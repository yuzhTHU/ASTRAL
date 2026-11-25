# Copyright (c) 2026-present, Yumeow. Licensed under the MIT License.
"""Fit standard astronomical distribution families and peak + tail sums."""

from typing import Any, Dict

import numpy as np

from .base_tool import BaseTool, ToolMetadata
from .simplify_formula import SimplifyFormulaTool


@BaseTool.register("fit_distribution_families")
class FitDistributionFamiliesTool(BaseTool):
    """Baseline scan of standard distribution functions for binned counts."""
    metadata = ToolMetadata("fit_distribution_families")

    def execute(self, feature: str = "", simplify: bool = True) -> Dict[str, Any]:
        """Fit standard distribution families to counts per bin of ``feature`` and rank them on validation.

        For a target that counts objects per bin of a logarithmic quantity (log10 energy,
        luminosity, mass...), fits per-dex forms of: log-normal, smoothly broken power law,
        Schechter, and sums of a log-normal peak with a broken-power-law tail, a Schechter tail
        or a second log-normal (tail location free and shared with the peak). Starting values
        come from the training histogram. With ``simplify`` every sum is also passed through
        simplify_formula (exponents set to 0, 1 or 2, locations shared). Use the table as the
        baseline for further search; nothing is submitted.

        Args:
            feature: Bin-centre variable; defaults to the only selected feature.
            simplify: Whether to simplify each peak + tail sum.

        Returns:
            Dict[str, Any]: Ranked rows with family, changes, fitted-parameter count,
            train/validation ranking metric and fitted formula.
        """
        features = list(self.context.feature_names())
        x_name = feature or (features[0] if len(features) == 1 else "")
        if x_name not in self.context.data:
            return {"exceptions": [f"Give the bin-centre feature; available: {features}"]}
        train = self.context.train_split.data
        x = np.asarray(train[x_name], float)
        y = np.asarray(train[self.context.target], float)
        grid = np.unique(x)
        hist = np.array([y[x == g].sum() for g in grid])
        if hist.sum() <= 0:
            return {"exceptions": ["Training counts are empty."]}
        peak = float(grid[np.argmax(hist)])
        sd = float(np.sqrt(np.average((grid - peak) ** 2, weights=hist)))
        w = max(min(sd, 1.0), 0.05)
        tail = peak + max(sd, 0.3)
        r = lambda v: repr(round(float(v), 4))
        X, P = x_name, lambda n, v: f"param('{n}', value={r(v)})"
        U = lambda loc: f"(10**({X}-{loc}))"
        LN = lambda loc, s: f"exp(-(({X}-{loc})/{s})**2/2)"
        x0, x1 = P("x0", peak), P("x1", tail)
        sbpl = lambda loc: f"{U(loc)}**(1-{P('a1', -1.0)})/(1+{U(loc)}**({P('a2', 1.8)}-{P('a1', -1.0)}))"
        sch = lambda loc: f"{U(loc)}**{P('g', 1.0)}*exp(-{U(loc)})"
        amp = f"exp({P('lnB', 0.0)})"
        singles = {
            "log-normal": LN(x0, P("s", w)),
            "smoothly broken power law": f"{U(x0)}**{P('g1', 2.0)}/(1+{U(x0)}**{P('g2', 3.0)})",
            "Schechter": f"{U(x0)}**{P('g', 1.0)}*exp(-{U(x0)})",
        }
        sums = {
            "log-normal + broken power-law tail": f"{LN(x0, P('s', w / 2))} + {amp}*{sbpl(x1)}",
            "log-normal + broken power-law tail (shared location)": f"{LN(x0, P('s', w / 2))} + {amp}*{sbpl(x0)}",
            "log-normal + Schechter tail": f"{LN(x0, P('s', w / 2))} + {amp}*{sch(x1)}",
            "log-normal + log-normal": f"{LN(x0, P('s', w / 2))} + {amp}*{LN(x1, P('s2', w))}",
        }
        metric = getattr(self.context.args, "ranking_metric", None) or "mse"
        larger = bool(getattr(self.context.args, "larger_is_better", False))
        target = self.parse_formula(self.context.target)
        rows, failures = [], []
        simplifier = SimplifyFormulaTool(context=self.context)
        for name, text in {**singles, **sums}.items():
            try:
                res = self.evaluate(self.parse_formula(text), target, show_diagnostics=False, fit=True)
            except Exception as exc:  # keep scanning
                failures.append({"family": name, "error": str(exc)[:200]})
                continue
            splits = res.get("data_split_results", {})
            get = lambda s: splits.get(s, {}).get("metrics", {}).get(metric)
            n_par = len({p for p in __import__("re").findall(r"param\('([^']+)'", res["formula"])})
            rows.append({"family": name, "changes": [], "parameters": n_par,
                         "train": get("train"), "validation": get("validation"), "formula": res["formula"]})
            if simplify and name in sums:
                out = simplifier.execute(f=res["formula"], max_changes=2)
                for item in out.get("results", []):
                    if item["changes"]:
                        rows.append({"family": name, **item})
        sign = -1 if larger else 1
        rows.sort(key=lambda r: (r["validation"] is None, sign * (r["validation"] or 0.0), r["parameters"]))
        return {"ranking_metric": metric, "larger_is_better": larger, "feature": x_name,
                "start": {"peak": peak, "width": w, "tail_location": tail},
                "results": rows[:15], "n_fitted": len(rows), "failed_families": failures}

    @classmethod
    def format_result_dict(cls, result: Dict[str, Any]) -> str:
        """Format the standard-family scan as a ranked table of fitted families.

        Args:
            result: Result dictionary returned by :meth:`execute`.

        Returns:
            str: One line per fitted family with parameters and train/validation scores, or the exception messages.
        """
        if result.get("exceptions"):
            return "\n".join(result["exceptions"])
        fmt = lambda v: "n/a" if v is None else f"{v:.6g}"
        lines = [f"Standard-family scan on {result['feature']} (validation {result['ranking_metric']}, "
                 f"{'higher' if result['larger_is_better'] else 'lower'} is better; {result['n_fitted']} fits, best 15):"]
        for row in result["results"]:
            change = ", ".join(row["changes"]) or "free fit"
            lines.append(f"- {row['family']} [{change}]: params={row['parameters']}, train={fmt(row['train'])}, "
                         f"validation={fmt(row['validation'])}\n    {row['formula']}")
        for item in result["failed_families"]:
            lines.append(f"! {item['family']} failed: {item['error']}")
        return "\n".join(lines)
