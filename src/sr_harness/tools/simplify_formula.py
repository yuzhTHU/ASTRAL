# Copyright (c) 2026-present, Yumeow. Licensed under the MIT License.
"""Try nested simplifications of a fitted formula with warm-started refits."""

import re
from itertools import combinations
from typing import Any, Dict, List, Optional

from .base_tool import BaseTool, ToolMetadata

_PARAM = re.compile(r"param\('(?P<name>[^']+)',\s*value=(?P<value>[^)]+)\)")


def one_standard_error_choice(rows: List[Dict[str, Any]], larger_is_better: bool = False) -> Optional[Dict[str, Any]]:
    """Pick the row with the fewest parameters whose validation score is within one standard error of the best.

    This is the one-standard-error rule: scores closer than their standard error are not
    distinguished by the data, so the simplest of them is preferred.

    Args:
        rows: Rows with ``validation``, ``validation_se`` and ``parameters`` entries.
        larger_is_better: Whether a larger validation score is better.

    Returns:
        Optional[Dict[str, Any]]: The chosen row, or ``None`` when the best row reports no standard error.
    """
    scored = [r for r in rows if r.get("validation") is not None]
    if not scored:
        return None
    sign = -1 if larger_is_better else 1
    best = min(scored, key=lambda r: sign * r["validation"])
    se = best.get("validation_se")
    if se is None:
        return None
    close = [r for r in scored if sign * (r["validation"] - best["validation"]) <= se]
    return min(close, key=lambda r: (r["parameters"], sign * r["validation"]))


def bic_choice(rows: List[Dict[str, Any]], tie: float = 2.0) -> Optional[Dict[str, Any]]:
    """Pick the row preferred by the training-split BIC, breaking near-ties by fewer parameters.

    BIC penalises each fitted parameter by ln(n), so on a large sample a small likelihood gain from
    an extra term does not pay, while on a small sample a real term (one the full training
    likelihood clearly supports) is kept even when a small validation split cannot resolve it.

    Args:
        rows: Rows with ``train_bic`` and ``parameters`` entries.
        tie: BIC differences below this are treated as ties.

    Returns:
        Optional[Dict[str, Any]]: The chosen row, or ``None`` when no row reports a BIC.
    """
    scored = [r for r in rows if r.get("train_bic") is not None]
    if not scored:
        return None
    best = min(r["train_bic"] for r in scored)
    close = [r for r in scored if r["train_bic"] - best < tie]
    return min(close, key=lambda r: (r["parameters"], r["train_bic"]))


@BaseTool.register("simplify_formula")
class SimplifyFormulaTool(BaseTool):
    """Tool for testing whether fewer fitted parameters describe the data as well."""
    metadata = ToolMetadata("simplify_formula")
    SPECIAL_VALUES = (0.0, 1.0, 2.0)
    MAX_VARIANTS = 60

    def execute(self, f: str, max_changes: int = 2) -> Dict[str, Any]:
        """Refit nested simplifications of a candidate and rank them on validation.

        Changes tried, alone and combined up to ``max_changes``: setting a fitted exponent
        or slope (a parameter that is not an amplitude, an offset, a location or a divisor/width) to 0, 1 or 2
        (nested special cases, whatever the fitted value), dropping an added term (its leading
        coefficient set to 0), and letting two location parameters (those written as
        ``feature - param('...')``) share one value. When the evaluator reports a standard error of
        the ranking metric (``<metric>_se``), the result also names the simplest variant within one
        standard error of the best; when it reports ``likelihood_bic`` on the training split, the
        variant preferred by that BIC is named instead. Every variant starts from the
        fitted values of ``f``, so pass a formula whose parameters were already fitted (for
        example the ``formula`` returned by evaluate_formula with fit=true). The variants are
        not submitted; submit the preferred one with submit_formula.

        Args:
            f: Fitted candidate formula using ``param('name', value=...)`` for every parameter.
            max_changes: Maximum number of simultaneous simplifications per variant (1-3).

        Returns:
            Dict[str, Any]: Base fit and variants with their changes, parameter count and
            train/validation ranking metric, best first, plus ``one_se_choice`` when available.
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
        amplitudes |= set(re.findall(r"(?:^|[+\-(])\s*param\('([^']+)',\s*value=[^)]+\)\s*[*/]", text))
        # Offsets (a parameter standing alone as an added term, such as an intercept) have no
        # structural special value either: 0, 1 or 2 only reflect the units of the target.
        offsets = set(re.findall(r"(?:^|[+\-(])\s*param\('([^']+)',\s*value=[^)]+\)\s*(?=[+\-)]|$)", text))
        # Widths/scales (divisors) have no structural special value either.
        widths = set(re.findall(r"/\s*\(?\s*param\('([^']+)',\s*value=[^)]+\)", text))
        # The leading coefficient of an added term does have one: 0 drops the term (nested model).
        added = set(re.findall(r"[+\-]\s*param\('([^']+)',\s*value=[^)]+\)\s*\*", text))
        changes = []
        for name in values:
            if name in amplitudes or name in locations or name in widths or name in offsets:
                continue
            changes.extend(("fix", name, special) for special in self.SPECIAL_VALUES)
        for keep, drop in combinations(locations, 2):
            changes.append(("share", drop, keep))
        changes.extend(("fix", name, 0.0) for name in values if name in added and name in amplitudes)

        metric = getattr(self.context.args, "ranking_metric", None) or "mse"
        larger_is_better = bool(getattr(self.context.args, "larger_is_better", False))
        target = self.parse_formula(self.context.target)

        def score(formula: str) -> Dict[str, Any]:
            result = self.evaluate(self.parse_formula(formula), target, show_diagnostics=False, fit=True)
            splits = result.get("data_split_results", {})
            get = lambda split, key=metric: splits.get(split, {}).get("metrics", {}).get(key)
            return {"formula": result["formula"], "train": get("train"), "validation": get("validation"),
                    "validation_se": get("validation", f"{metric}_se"),
                    "train_bic": get("train", "likelihood_bic")}

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
                "results": ranked, "failed_variants": failures,
                "one_se_choice": one_standard_error_choice(ranked, larger_is_better),
                "bic_choice": bic_choice(ranked)}

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
            bic = "" if row.get("train_bic") is None else f", train BIC={row['train_bic']:.2f}"
            lines.append(f"- {change}: params={row['parameters']}, train={fmt(row['train'])}, "
                         f"validation={fmt(row['validation'])}{bic}\n    {row['formula']}")
        if result["failed_variants"]:
            lines.append(f"{len(result['failed_variants'])} variants failed to fit, e.g. "
                         f"{result['failed_variants'][0]}")
        choice = result.get("bic_choice")
        if choice:
            change = ", ".join(choice["changes"]) or "(fitted base formula)"
            lines.append(f"Preferred by training BIC (differences below 2 are ties, broken by fewer "
                         f"parameters; prefer it): {change}, params={choice['parameters']}\n    {choice['formula']}")
        elif result.get("one_se_choice"):
            choice = result["one_se_choice"]
            change = ", ".join(choice["changes"]) or "(fitted base formula)"
            lines.append(f"Simplest variant within one standard error of the best (prefer it): "
                         f"{change}, params={choice['parameters']}\n    {choice['formula']}")
        return "\n".join(lines)
