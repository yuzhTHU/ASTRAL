# Copyright (c) 2026-present, Yumeow. Licensed under the MIT License.
"""Try nested simplifications of a fitted formula with warm-started refits."""

import re
from itertools import combinations
from typing import Any, Dict

from .base_tool import BaseTool, ToolMetadata

_PARAM = re.compile(r"param\('(?P<name>[^']+)',\s*value=(?P<value>[^)]+)\)")


@BaseTool.register("simplify_formula")
class SimplifyFormulaTool(BaseTool):
    """Tool for testing whether fewer fitted parameters describe the data as well."""
    metadata = ToolMetadata("simplify_formula")
    SPECIAL_VALUES = (0.0, 1.0, 2.0)
    MAX_VARIANTS = 60

    def execute(self, f: str, max_changes: int = 2) -> Dict[str, Any]:
        """Refit nested simplifications of a candidate and rank them on validation.

        Changes tried, alone and combined up to ``max_changes``: setting a fitted exponent
        or slope (a parameter that is not an amplitude, a location or a divisor/width) to 0, 1 or 2
        (nested special cases, whatever the fitted value), and letting two location parameters (those
        written as ``feature - param('...')``) share one value. Every variant starts from the
        fitted values of ``f``, so pass a formula whose parameters were already fitted (for
        example the ``formula`` returned by evaluate_formula with fit=true). The variants are
        not submitted; submit the preferred one with submit_formula.

        Args:
            f: Fitted candidate formula using ``param('name', value=...)`` for every parameter.
            max_changes: Maximum number of simultaneous simplifications per variant (1-3).

        Returns:
            Dict[str, Any]: Base fit and variants with their changes, parameter count and
            train/validation ranking metric, best first.
        """
        max_changes = max(1, min(int(max_changes), 3))
        text = self.normalize_formula(f)
        values = {}
        for match in _PARAM.finditer(text):
            values.setdefault(match["name"], float(match["value"]))
        if not values:
            return {"exceptions": ["f contains no param('name', value=...) parameters to simplify."]}
        data_names = set(self.context.data)
        locations = sorted({name for var, name in re.findall(r"(\w+)\s*-\s*param\('([^']+)'", text)
                            if var in data_names})

        # Amplitudes (exp(param) or param multiplying a whole term) have no structural special
        # value: their size depends on how each component is normalised. Fix only other params.
        amplitudes = set(re.findall(r"exp\(\s*param\('([^']+)',\s*value=[^)]+\)\s*\)", text))
        amplitudes |= set(re.findall(r"(?:^|[+(])\s*param\('([^']+)',\s*value=[^)]+\)\s*\*", text))
        # Widths/scales (divisors) have no structural special value either.
        widths = set(re.findall(r"/\s*\(?\s*param\('([^']+)',\s*value=[^)]+\)", text))
        changes = []
        for name in values:
            if name in amplitudes or name in locations or name in widths:
                continue
            changes.extend(("fix", name, special) for special in self.SPECIAL_VALUES)
        for keep, drop in combinations(locations, 2):
            changes.append(("share", drop, keep))

        metric = getattr(self.context.args, "ranking_metric", None) or "mse"
        larger_is_better = bool(getattr(self.context.args, "larger_is_better", False))
        target = self.parse_formula(self.context.target)

        def score(formula: str) -> Dict[str, Any]:
            result = self.evaluate(self.parse_formula(formula), target, show_diagnostics=False, fit=True)
            splits = result.get("data_split_results", {})
            get = lambda split: splits.get(split, {}).get("metrics", {}).get(metric)
            return {"formula": result["formula"], "train": get("train"), "validation": get("validation")}

        def apply(variant) -> str | None:
            removed = [name for _, name, _ in variant]
            kept = {other for kind, _, other in variant if kind == "share"}
            if len(set(removed)) < len(removed) or kept & set(removed):
                return None  # one change per parameter; a shared value must stay free
            out = text
            for kind, name, other in variant:
                replacement = repr(float(other)) if kind == "fix" else f"param('{other}', value={values[other]!r})"
                out = re.sub(rf"param\('{re.escape(name)}',\s*value=[^)]+\)", replacement, out)
            return out

        base = score(text)
        base["changes"], base["parameters"] = [], len(values)
        variants, failures = [], []
        for size in range(1, max_changes + 1):
            for variant in combinations(changes, size):
                if len(variants) + len(failures) >= self.MAX_VARIANTS:
                    break
                formula = apply(variant)
                if formula is None:
                    continue
                label = [f"{n} = {v:g}" if k == "fix" else f"{n} shares {v}" for k, n, v in variant]
                try:
                    item = score(formula)
                except Exception as exc:  # report, keep exploring
                    failures.append({"changes": label, "error": str(exc)[:200]})
                    continue
                item["changes"] = label
                item["parameters"] = len(values) - len(variant)
                variants.append(item)
        sign = -1 if larger_is_better else 1
        ranked = sorted([base, *variants], key=lambda r: (r["validation"] is None,
                                                          sign * (r["validation"] or 0.0), r["parameters"]))
        return {"ranking_metric": metric, "larger_is_better": larger_is_better,
                "location_parameters": locations, "candidate_changes": len(changes),
                "results": ranked, "failed_variants": failures}

    @classmethod
    def format_result_dict(cls, result: Dict[str, Any]) -> str:
        """Format the simplification candidates as a table ranked by validation score.

        Args:
            result: Result dictionary returned by :meth:`execute`.

        Returns:
            str: One line per structural simplification with its refitted scores, or the exception messages.
        """
        if result.get("exceptions"):
            return "\n".join(result["exceptions"])
        metric = result["ranking_metric"]
        lines = [f"Simplification table (validation {metric}, "
                 f"{'higher' if result['larger_is_better'] else 'lower'} is better):"]
        for row in result["results"]:
            change = ", ".join(row["changes"]) or "(fitted base formula)"
            fmt = lambda v: "n/a" if v is None else f"{v:.6g}"
            lines.append(f"- {change}: params={row['parameters']}, train={fmt(row['train'])}, "
                         f"validation={fmt(row['validation'])}\n    {row['formula']}")
        if result["failed_variants"]:
            lines.append(f"{len(result['failed_variants'])} variants failed to fit, e.g. "
                         f"{result['failed_variants'][0]}")
        return "\n".join(lines)
