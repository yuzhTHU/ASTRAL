"""One-standard-error selection in simplify_formula and the scatter evaluator's score error."""
import importlib.util
import math
from pathlib import Path

import numpy as np
import pytest

from sr_harness.tools.simplify_formula import bic_choice, one_standard_error_choice

SCRIPT = (Path(__file__).resolve().parents[2] / "src/sr_harness/skills/scatter-relation-evaluator"
          / "scripts/scatter_relation_evaluator.py")


def row(name, validation, parameters, se=0.01):
    return {"name": name, "validation": validation, "parameters": parameters, "validation_se": se}


def test_prefers_fewest_parameters_within_one_standard_error():
    rows = [row("quadratic", 2.0000, 3), row("line", 2.0003, 2), row("const", 2.5, 1)]
    assert one_standard_error_choice(rows)["name"] == "line"


def test_keeps_the_best_when_simpler_forms_are_clearly_worse():
    rows = [row("quadratic", 2.00, 3), row("line", 2.05, 2)]
    assert one_standard_error_choice(rows)["name"] == "quadratic"


def test_larger_is_better_and_missing_error():
    rows = [row("big", 0.90, 4), row("small", 0.895, 2)]
    assert one_standard_error_choice(rows, larger_is_better=True)["name"] == "small"
    assert one_standard_error_choice([{"validation": 1.0, "parameters": 2}]) is None
    assert one_standard_error_choice([]) is None


@pytest.mark.parametrize("outliers", [False, True])
def test_profile_standard_error_matches_per_object_terms(outliers):
    pytest.importorskip("sr_harness_engine")
    spec = importlib.util.spec_from_file_location("scatter_relation_evaluator", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    cls = type("Ev", (module.ScatterRelationEvaluator,), {"OUTLIERS": outliers})
    rng = np.random.default_rng(0)

    def profile(n):
        sigma = rng.uniform(0.3, 0.8, n)
        residual = rng.normal(0, np.sqrt(sigma ** 2 + 0.8 ** 2))
        return cls._profile(residual, sigma, span=15.0)

    small, large = profile(1000), profile(16000)
    assert large["intrinsic_scatter"] == pytest.approx(0.8, rel=0.05)
    # A standard error of the mean per-object term shrinks as 1/sqrt(n): 16x the stars, 1/4 the error.
    assert small["nll_se"] / large["nll_se"] == pytest.approx(4.0, rel=0.15)
    # For Gaussian residuals the per-object NLL terms have standard deviation sqrt(1/2).
    assert large["nll_se"] * math.sqrt(16000) == pytest.approx(math.sqrt(0.5), rel=0.15)


def _evaluator():
    pytest.importorskip("sr_harness_engine")
    spec = importlib.util.spec_from_file_location("scatter_relation_evaluator", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.ScatterRelationEvaluator


@pytest.mark.parametrize("text", [
    "a + 2/pf", "-2*pi + b/pf", "a*(1 + 2/pf)", "a + b*x + 2", "x/2 + a", "a + (2*x)**b",
    "1 + b*(log(x) + log(x)**2)", "b*x - 1",
])
def test_literal_used_as_coefficient_or_constant_is_rejected(text):
    import sr_harness_engine as engine
    assert _evaluator()._literal_coefficient(engine.parse(text)) is not None


@pytest.mark.parametrize("text", [
    "a + b*x", "a + b*x + c*x**2", "a + b*log10(x/c)", "exp(-((x - m)/s)**2/2) + w*10**(x - m)/(1 + (10**(x - m))**k)",
    "a - x", "a + b/(x + c)", "a + b*exp(c*x)", "a + b/(1 + (x/c)**k)",
])
def test_structural_literals_are_allowed(text):
    import sr_harness_engine as engine
    assert _evaluator()._literal_coefficient(engine.parse(text)) is None


def test_bic_choice_keeps_a_supported_term_and_drops_an_unsupported_one():
    # Small sample: the extra term lowers BIC by 11, so it stays (Chen-like).
    rows = [{"name": "two-period", "train_bic": -80.2, "parameters": 3},
            {"name": "one-period", "train_bic": -69.3, "parameters": 2}]
    assert bic_choice(rows)["name"] == "two-period"
    # Large sample: the curvature gains less than its ln(n) charge (Xiang-like).
    rows = [{"name": "quadratic", "train_bic": 80272.5, "parameters": 3},
            {"name": "line", "train_bic": 80270.7, "parameters": 2}]
    assert bic_choice(rows)["name"] == "line"
    # Near-ties go to fewer parameters.
    rows = [{"name": "big", "train_bic": 10.0, "parameters": 4}, {"name": "small", "train_bic": 11.5, "parameters": 2}]
    assert bic_choice(rows)["name"] == "small"
    assert bic_choice([{"parameters": 2}]) is None


def test_evaluator_reports_training_bic():
    import sr_harness_engine as engine
    from sr_harness.core import AgentContext
    ev = type("Ev", (_evaluator(),), {"TARGET": "y", "FEATURES": ("x",), "UNCERTAINTY": "dy", "OUTLIERS": False})
    rng = np.random.default_rng(1)
    x = rng.uniform(-1, 1, 400); dy = np.full(400, 0.1); y = 1 - 2 * x + rng.normal(0, 0.2, 400)
    try:
        context = AgentContext(data={"x": x, "y": y, "dy": dy}, target="y")
    except TypeError:
        pytest.skip("AgentContext signature differs")
    f = engine.parse("param('a', value=1.0) + param('b', value=-2.0) * x")
    m = ev.evaluate(f, engine.parse("y"), context)
    assert m["likelihood_parameters"] == 3  # a, b and the scatter
    assert m["likelihood_bic"] == pytest.approx(2 * 400 * m["gaussian_nll"] + 3 * math.log(400))
    assert m["bic"] == m["likelihood_bic"]  # no second, mse-based BIC to confuse the search
    assert m["aic"] == pytest.approx(2 * 400 * m["gaussian_nll"] + 6)
    # selection_bic is the training BIC on every split, so a search can rank validation rows by it.
    splits = ev.split(context)
    fitted = ev.fit(f, engine.parse("y"), splits["train"])
    train_m = ev.evaluate(fitted, engine.parse("y"), splits["train"])
    val_m = ev.evaluate(fitted, engine.parse("y"), splits["validation"])
    assert train_m["selection_bic"] == pytest.approx(train_m["likelihood_bic"])
    assert val_m["selection_bic"] == pytest.approx(train_m["likelihood_bic"])
    assert val_m["likelihood_bic"] != pytest.approx(train_m["likelihood_bic"])
