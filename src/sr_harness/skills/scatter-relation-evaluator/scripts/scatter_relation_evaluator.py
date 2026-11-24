"""Reference evaluator: relation with per-object errors, intrinsic scatter and optional outliers.

Copy to context.evaluator/ and change only the class constants.

* split: VALIDATION_FRACTION of the objects is held out at random (fixed seed). With GROUP set,
  whole groups (for example repeated observations of one star) go to one side.
* likelihood: target_i = f(features_i) + noise_i, noise_i ~ N(0, err_i^2 + s^2); with OUTLIERS a
  fraction eta instead follows a uniform distribution over the split's target range.
* fit: candidate parameters on the training split only, with (s, eta) profiled at every step.
* evaluate: the formula is held fixed; (s, eta) are profiled on the split being scored and
  gaussian_nll is the mean negative log-likelihood per object (lower is better).
  gaussian_nll_se is its standard error (spread of the per-object terms / sqrt(n)): candidates
  closer than this to the best score are not distinguished by the data.
* likelihood_bic: 2 n gaussian_nll + k ln n, k = formula parameters + s (+ eta), on the split
  being scored (also reported as bic; aic likewise). selection_bic is the training-split value,
  reported on every split: rank candidates by it (lower is better, differences below 2 are ties)
  and keep the validation gaussian_nll as the overfitting check.
* literal guard: numbers other than the allowed literals are rejected, and so is any allowed
  literal used as a coefficient or constant of an added term (``a + 2/x``, ``-2*pi + ...``):
  those must be fitted parameters. Literals stay usable as structure (``x**2``, ``10**x``,
  ``1 + x``) and inside function arguments (``exp(-(x - m)**2/2)``).
"""
from __future__ import annotations

import math

import numpy as np
from scipy.optimize import minimize

import sr_harness_engine as engine
from sr_harness_engine.expression import Binary, Function, Unary
from sr_harness.evaluator.default_evaluator import DefaultEvaluator
from sr_harness.evaluator.utils import regression_metrics, select_random_indices


class ScatterRelationEvaluator(DefaultEvaluator):
    TARGET = "age"
    FEATURES = ("feh",)
    UNCERTAINTY = "age_unc"      # 1-sigma error of the target, same units
    GROUP = None                 # column of object ids for a grouped split, or None
    VALIDATION_FRACTION = 0.30
    OUTLIERS = True
    RANDOM_SEED = 42

    MAX_OUTLIER_FRACTION = 0.5
    LOG_SCATTER_BOUNDS = (-9.0, 7.0)
    MAX_EVALS = 600
    PENALTY = 1e100
    ALLOWED_LITERALS = (0.0, 1.0, 2.0, 10.0, math.e, math.pi, math.log(10.0))

    # ------------------------------------------------------------------ data
    @classmethod
    def _aux(cls):
        return [name for name in (cls.UNCERTAINTY, cls.GROUP) if name]

    @classmethod
    def _table(cls, context):
        if context.target != cls.TARGET:
            raise ValueError(f"Select {cls.TARGET!r} as the target; got {context.target!r}")
        needed = [cls.TARGET, *cls.FEATURES, *cls._aux()]
        missing = [name for name in needed if name not in context.data]
        if missing:
            raise ValueError(f"{missing} are not in the live selection; select them (evaluators only "
                             "see selected arrays)")
        y = np.asarray(context.data[cls.TARGET], float)
        X = {name: np.asarray(context.data[name], float) for name in cls.FEATURES}
        sigma = (np.asarray(context.data[cls.UNCERTAINTY], float) if cls.UNCERTAINTY
                 else np.zeros_like(y))
        if y.ndim != 1 or any(v.shape != y.shape for v in (*X.values(), sigma)):
            raise ValueError("target, features and uncertainty must be aligned 1-D arrays")
        if not np.isfinite(y).all() or not all(np.isfinite(v).all() for v in X.values()):
            raise ValueError("target and features must be finite; selection belongs to data preparation")
        if not np.isfinite(sigma).all() or np.any(sigma < 0):
            raise ValueError("the uncertainty column must be finite and non-negative")
        span = float(y.max() - y.min())
        if not span > 0:
            raise ValueError("the target range of this split must have positive width")
        return {"X": X, "y": y, "sigma": sigma, "span": span}

    @classmethod
    def split(cls, context):
        cls._table(context)
        n = int(np.asarray(context.data[cls.TARGET]).size)
        if cls.GROUP:
            groups = np.asarray(context.data[cls.GROUP])
            unique = np.unique(groups)
            rng = np.random.default_rng(cls.RANDOM_SEED)
            held = set(rng.permutation(unique)[: int(round(len(unique) * cls.VALIDATION_FRACTION))].tolist())
            is_val = np.array([g in held for g in groups.tolist()])
            train, val = np.flatnonzero(~is_val), np.flatnonzero(is_val)
        else:
            n_val = int(round(n * cls.VALIDATION_FRACTION))
            train, val = select_random_indices(seed=cls.RANDOM_SEED, n_samples=n, n_train=n - n_val)
        if len(train) < 2 or len(val) < 2:
            raise ValueError("the holdout leaves an empty training or validation sample")

        def part(idx):
            return context.with_data({k: np.asarray(v)[idx] for k, v in context.data.items()})

        splits = {"train": part(train), "validation": part(val)}
        # Kept so that every split can report the training BIC as selection_bic (see evaluate).
        cls._train_context = splits["train"]
        return splits

    # -------------------------------------------------------------- symbolic
    @classmethod
    def _check(cls, f, y, context):
        if context.target != cls.TARGET or y.to_str().strip() != cls.TARGET:
            raise ValueError(f"Score the observed {cls.TARGET!r} itself")
        names = {n.name for n in f.iter_preorder() if isinstance(n, engine.Variable)}
        foreign = sorted(names - set(cls.FEATURES))
        if foreign:
            raise ValueError(f"Use only {list(cls.FEATURES)} as inputs; got {foreign}. "
                             f"{cls._aux()} are evaluator metadata, not predictors.")
        for node in f.iter_preorder():
            if isinstance(node, engine.Number):
                value = abs(float(node.value))
                if not any(math.isclose(value, a, rel_tol=1e-9, abs_tol=1e-12) for a in cls.ALLOWED_LITERALS):
                    raise ValueError(f"Numeric literal {node.value!r} must be written as "
                                     "param('name', value=...) so it is fitted on the training split")
        bad = cls._literal_coefficient(f)
        if bad is not None:
            raise ValueError(f"{bad} acts as a hand-set coefficient or constant; write it as "
                             "param('name', value=...) so it is fitted on the training split")

    @staticmethod
    def _is_literal(node):
        if isinstance(node, engine.Number):
            return True
        if isinstance(node, engine.Variable) and getattr(node, "name", None) in ("pi", "e"):
            return True
        if isinstance(node, Unary):
            return ScatterRelationEvaluator._is_literal(node.operand)
        if isinstance(node, Binary):
            return ScatterRelationEvaluator._is_literal(node.left) and ScatterRelationEvaluator._is_literal(node.right)
        if isinstance(node, Function):
            return all(ScatterRelationEvaluator._is_literal(a) for a in node.arguments)
        return False

    @classmethod
    def _literal_coefficient(cls, f):
        """Return the text of a literal used as the coefficient or value of an added term, else None.

        Added terms are those joined by + or - outside function arguments and exponents. A term
        may not be made of literals only (1 is allowed inside a nested sum, not as the formula's own
        constant), and none of its multiplied or divided
        factors may be a literal other than 1.
        """
        def terms(node):
            if isinstance(node, Binary) and node.operator in "+-":
                return terms(node.left) + terms(node.right)
            if isinstance(node, Unary):
                return terms(node.operand)
            return [node]

        def factors(node):
            if isinstance(node, Binary) and node.operator in "*/":
                return factors(node.left) + factors(node.right)
            if isinstance(node, Unary):
                return factors(node.operand)
            return [node]

        def is_one(node):
            try:
                return math.isclose(abs(float(engine.evaluate(node, {}))), 1.0)
            except Exception:
                return False

        def visit(node, top=False):
            for term in terms(node):
                if cls._is_literal(term):
                    # The formula's own constant term must be fitted; 1 is structure only inside
                    # a nested sum such as 1 + (x/x0)**a.
                    if top or not is_one(term):
                        return engine.render(term) if hasattr(engine, "render") else str(term)
                    continue
                for factor in factors(term):
                    if cls._is_literal(factor):
                        if not is_one(factor):
                            return engine.render(factor) if hasattr(engine, "render") else str(factor)
                    elif isinstance(factor, Binary) and factor.operator == "**":
                        # A literal base (10**x) and the exponent are structure; look inside a
                        # compound base such as (1 + 2/x)**a.
                        found = None if cls._is_literal(factor.left) else visit(factor.left)
                        if found:
                            return found
                    elif isinstance(factor, Binary) and factor.operator in "+-":
                        found = visit(factor)
                        if found:
                            return found
            return None

        return visit(f, top=True)

    @classmethod
    def _predict(cls, f, X, parameters=None):
        with np.errstate(all="ignore"):
            out = np.asarray(engine.evaluate(f, X, parameters=parameters), float)
        return np.broadcast_to(out, next(iter(X.values())).shape)

    # ------------------------------------------------------------ noise model
    @staticmethod
    def _scatter_guess(residual, sigma):
        robust = float(np.median(np.abs(residual))) / 0.6744897501960817
        value = math.sqrt(max(robust ** 2 - float(np.median(sigma ** 2)), 1e-8))
        return min(max(value, 1e-3), 1e2)

    @classmethod
    def _profile(cls, residual, sigma, span, starts=None):
        var = sigma ** 2
        log2pi, log_span = math.log(2 * math.pi), math.log(span)
        if cls.OUTLIERS:
            bounds = [cls.LOG_SCATTER_BOUNDS, (1e-6, cls.MAX_OUTLIER_FRACTION)]
        else:
            bounds = [cls.LOG_SCATTER_BOUNDS]

        def nll(p):
            total = var + math.exp(2 * p[0])
            log_main = -0.5 * (log2pi + np.log(total)) - 0.5 * residual ** 2 / total
            if not cls.OUTLIERS:
                return float(-np.mean(log_main))
            eta = float(p[1])
            return float(-np.mean(np.logaddexp(math.log1p(-eta) + log_main, math.log(eta) - log_span)))

        s0 = math.log(cls._scatter_guess(residual, sigma))
        if starts is None:
            starts = [(s0, 0.10), (s0 - 1.6, 0.02), (s0 + 1.6, 0.30)]
        best = None
        for st in starts:
            x0 = np.array([min(max(v, lo), hi) for v, (lo, hi) in zip(st, bounds)], float)
            r = minimize(nll, x0, method="L-BFGS-B", bounds=bounds)
            if np.isfinite(r.fun) and (best is None or r.fun < best.fun):
                best = r
        if best is None:
            raise ValueError("the noise model could not be fitted on this split")
        total = var + math.exp(2 * best.x[0])
        terms = 0.5 * (log2pi + np.log(total)) + 0.5 * residual ** 2 / total
        if cls.OUTLIERS:
            eta = float(best.x[1])
            terms = -np.logaddexp(math.log1p(-eta) - terms, math.log(eta) - log_span)
        return {"nll": float(best.fun), "nll_se": float(np.std(terms) / math.sqrt(terms.size)),
                "intrinsic_scatter": math.exp(best.x[0]),
                "outlier_fraction": float(best.x[1]) if cls.OUTLIERS else 0.0}

    # -------------------------------------------------------------------- fit
    @classmethod
    def fit(cls, f, y, context):
        cls._check(f, y, context)
        t = cls._table(context)
        unbound = engine.unbound_parameters(f)
        if unbound:
            raise ValueError("Give every parameter a finite starting value, e.g. param('a', value=0.0): "
                             + ", ".join(unbound))
        init = engine.parameter_values(f)
        names = list(init)
        x0 = np.asarray([init[k] for k in names], float)
        if not np.isfinite(x0).all():
            raise ValueError("parameter starting values must be finite")
        calls = 0

        def objective(values):
            nonlocal calls
            calls += 1
            if calls > cls.MAX_EVALS:
                return cls.PENALTY
            try:
                pred = cls._predict(f, t["X"], dict(zip(names, values)))
                if not np.isfinite(pred).all():
                    return cls.PENALTY
                res = t["y"] - pred
                start = [(math.log(cls._scatter_guess(res, t["sigma"])), 0.10)]
                return cls._profile(res, t["sigma"], t["span"], starts=start)["nll"]
            except (ValueError, FloatingPointError, OverflowError, ZeroDivisionError):
                return cls.PENALTY

        best_x, best = x0.copy(), objective(x0)
        if best >= cls.PENALTY:
            raise ValueError("the expression does not give a finite value for every training object "
                             "at the starting values")
        if not names:
            return f
        for method, opts in (("Nelder-Mead", {"maxiter": 400, "xatol": 1e-8, "fatol": 1e-10}),
                             ("Powell", {"maxiter": 400, "xtol": 1e-8, "ftol": 1e-10})):
            if calls > cls.MAX_EVALS:
                break
            r = minimize(objective, best_x, method=method, options=opts)
            if np.isfinite(r.fun) and r.fun < best:
                best_x, best = np.asarray(r.x, float), float(r.fun)
        return engine.bind_parameters(f, dict(zip(names, map(float, best_x))))

    # --------------------------------------------------------------- evaluate
    @classmethod
    def evaluate(cls, f, y, context):
        cls._check(f, y, context)
        t = cls._table(context)
        pred = cls._predict(f, t["X"])
        if not np.isfinite(pred).all():
            raise ValueError("the formula does not give a finite value for every object")
        res = t["y"] - pred
        prof = cls._profile(res, t["sigma"], t["span"])
        metrics = regression_metrics(f, t["y"], pred)
        if float(np.ptp(pred)) == 0.0:  # correlations are undefined for a constant prediction
            metrics.update({k: 0.0 for k in ("pearson_r", "spearman_r") if k in metrics})
        n = int(t["y"].size)
        # Free quantities of the likelihood: the formula's parameters, the scatter s and, with
        # OUTLIERS, the fraction eta. On the training split this is the usual BIC of the fit.
        k = len({node.name for node in f.iter_preorder() if isinstance(node, engine.Parameter)})
        k += 2 if cls.OUTLIERS else 1
        metrics.update(gaussian_nll=prof["nll"], gaussian_nll_se=prof["nll_se"], intrinsic_scatter=prof["intrinsic_scatter"],
                       outlier_fraction=prof["outlier_fraction"], n_samples=n,
                       likelihood_bic=2.0 * n * prof["nll"] + k * math.log(n), likelihood_parameters=k)
        # One information criterion only: the generic aic/bic from regression_metrics assume an
        # unweighted Gaussian mse and disagree with this likelihood, so replace them.
        metrics.update(aic=2.0 * n * prof["nll"] + 2 * k, bic=metrics["likelihood_bic"])
        metrics["selection_bic"] = cls._selection_bic(f, k, metrics["likelihood_bic"])
        return metrics

    @classmethod
    def _selection_bic(cls, f, k, fallback):
        """Training-split BIC of the fitted formula, reported on every split so the search can rank by it."""
        train = getattr(cls, "_train_context", None)
        if train is None:
            return fallback
        t = cls._table(train)
        pred = cls._predict(f, t["X"])
        if not np.isfinite(pred).all():
            return fallback
        prof = cls._profile(t["y"] - pred, t["sigma"], t["span"])
        n = int(t["y"].size)
        return 2.0 * n * prof["nll"] + k * math.log(n)
