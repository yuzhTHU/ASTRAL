"""Reference evaluator: relation with per-object errors, intrinsic scatter and optional outliers.

Copy to context.evaluator/ and change only the class constants.

* split: VALIDATION_FRACTION of the objects is held out at random (fixed seed). With GROUP set,
  whole groups (for example repeated observations of one star) go to one side.
* likelihood: target_i = f(features_i) + noise_i, noise_i ~ N(0, err_i^2 + s^2); with OUTLIERS a
  fraction eta instead follows a uniform distribution over the split's target range.
* fit: candidate parameters on the training split only, with (s, eta) profiled at every step.
* evaluate: the formula is held fixed; (s, eta) are profiled on the split being scored and
  gaussian_nll is the mean negative log-likelihood per object (lower is better).
"""
from __future__ import annotations

import math

import numpy as np
from scipy.optimize import minimize

import sr_harness_engine as engine
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

        return {"train": part(train), "validation": part(val)}

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
        return {"nll": float(best.fun), "intrinsic_scatter": math.exp(best.x[0]),
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
        metrics.update(gaussian_nll=prof["nll"], intrinsic_scatter=prof["intrinsic_scatter"],
                       outlier_fraction=prof["outlier_fraction"], n_samples=int(t["y"].size))
        return metrics
