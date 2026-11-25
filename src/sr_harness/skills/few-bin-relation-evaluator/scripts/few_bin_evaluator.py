"""Reference evaluator: a smooth trend through a handful of binned measurements (about 5-20 points).

Copy to context.evaluator/ and change only the class constants.

* data: one row per independent bin, with the measured value and its lower/upper 1-sigma errors
  (set ERR_LOW and ERR_UP to the same column for symmetric errors).
* likelihood: asymmetric chi^2; a point uses ERR_UP when the model lies above it and ERR_LOW
  when the model lies below it.
* fit: every parameter is fitted on all bins; `chi2` and `reduced_chi2` describe that fit.
* validation: leave-one-bin-out. The formula is refitted without bin i (warm start from the full
  fit) and bin i is predicted; `loo_chi2` is the mean held-out chi^2 per bin (lower is better).
  With so few points a fixed holdout would waste data, so both splits hold all bins and
  `loo_chi2` is the ranking metric.
* guards: at most MAX_PARAMETERS fitted parameters, no hand-tuned numeric literals, finite
  predictions on every bin.
"""
from __future__ import annotations

import math

import numpy as np
from scipy.optimize import minimize

import sr_harness_engine as engine
from sr_harness.evaluator.default_evaluator import DefaultEvaluator
from sr_harness.evaluator.utils import regression_metrics


class FewBinRelationEvaluator(DefaultEvaluator):
    TARGET = "omega_h2"
    FEATURES = ("z",)
    ERR_LOW = "omega_h2_err_low"
    ERR_UP = "omega_h2_err_up"
    MAX_PARAMETERS = 5

    MAX_EVALS = 3000
    PENALTY = 1e100
    ALLOWED_LITERALS = (0.0, 1.0, 2.0, 10.0, math.e, math.pi, math.log(10.0))

    # ------------------------------------------------------------------ data
    @classmethod
    def _table(cls, context):
        if context.target != cls.TARGET:
            raise ValueError(f"Select {cls.TARGET!r} as the target; got {context.target!r}")
        needed = [cls.TARGET, *cls.FEATURES, cls.ERR_LOW, cls.ERR_UP]
        missing = [name for name in needed if name not in context.data]
        if missing:
            raise ValueError(f"{missing} are not in the live selection; select them (evaluators only "
                             "see selected arrays)")
        y = np.asarray(context.data[cls.TARGET], float)
        X = {name: np.asarray(context.data[name], float) for name in cls.FEATURES}
        lo = np.asarray(context.data[cls.ERR_LOW], float)
        up = np.asarray(context.data[cls.ERR_UP], float)
        if y.ndim != 1 or any(v.shape != y.shape for v in (*X.values(), lo, up)):
            raise ValueError("target, features and errors must be aligned 1-D arrays")
        if not (np.isfinite(y).all() and all(np.isfinite(v).all() for v in X.values())):
            raise ValueError("target and features must be finite; drop empty bins in data preparation")
        if not (np.isfinite(lo).all() and np.isfinite(up).all()) or np.any(lo <= 0) or np.any(up <= 0):
            raise ValueError("errors must be finite and positive")
        if y.size < 4:
            raise ValueError("need at least 4 bins")
        return {"X": X, "y": y, "lo": lo, "up": up}

    @classmethod
    def split(cls, context):
        cls._table(context)
        return {"train": context, "validation": context}

    # -------------------------------------------------------------- symbolic
    @classmethod
    def _check(cls, f, y, context):
        if context.target != cls.TARGET or y.to_str().strip() != cls.TARGET:
            raise ValueError(f"Score the observed {cls.TARGET!r} itself")
        names = {n.name for n in f.iter_preorder() if isinstance(n, engine.Variable)}
        foreign = sorted(names - set(cls.FEATURES))
        if foreign:
            raise ValueError(f"Use only {list(cls.FEATURES)} as inputs; got {foreign}. "
                             f"{[cls.ERR_LOW, cls.ERR_UP]} are evaluator metadata, not predictors.")
        for node in f.iter_preorder():
            if isinstance(node, engine.Number):
                value = abs(float(node.value))
                if not any(math.isclose(value, a, rel_tol=1e-9, abs_tol=1e-12) for a in cls.ALLOWED_LITERALS):
                    raise ValueError(f"Numeric literal {node.value!r} must be written as "
                                     "param('name', value=...) so it is fitted")
        n_par = len(engine.parameter_values(f)) + len(engine.unbound_parameters(f))
        if n_par > cls.MAX_PARAMETERS:
            raise ValueError(f"{n_par} fitted parameters; at most {cls.MAX_PARAMETERS} are allowed "
                             "with this few bins")

    @classmethod
    def _predict(cls, f, X, parameters=None):
        with np.errstate(all="ignore"):
            out = np.asarray(engine.evaluate(f, X, parameters=parameters), float)
        return np.broadcast_to(out, next(iter(X.values())).shape)

    @staticmethod
    def _chi2_terms(y, pred, lo, up):
        sigma = np.where(pred > y, up, lo)
        return ((y - pred) / sigma) ** 2

    @classmethod
    def _minimize(cls, f, t, idx, x0, names):
        X = {k: v[idx] for k, v in t["X"].items()}
        y, lo, up = t["y"][idx], t["lo"][idx], t["up"][idx]
        calls = 0

        def objective(values):
            nonlocal calls
            calls += 1
            if calls > cls.MAX_EVALS:
                return cls.PENALTY
            try:
                pred = cls._predict(f, X, dict(zip(names, values)))
            except (ValueError, FloatingPointError, OverflowError, ZeroDivisionError):
                return cls.PENALTY
            if not np.isfinite(pred).all():
                return cls.PENALTY
            return float(np.sum(cls._chi2_terms(y, pred, lo, up)))

        best_x, best = np.asarray(x0, float), objective(x0)
        if not names:
            return best_x, best
        for method, opts in (("Nelder-Mead", {"maxiter": 1500, "xatol": 1e-10, "fatol": 1e-10}),
                             ("Powell", {"maxiter": 1500, "xtol": 1e-10, "ftol": 1e-12}),
                             ("Nelder-Mead", {"maxiter": 1500, "xatol": 1e-10, "fatol": 1e-10})):
            if calls > cls.MAX_EVALS:
                break
            r = minimize(objective, best_x, method=method, options=opts)
            if np.isfinite(r.fun) and r.fun < best:
                best_x, best = np.asarray(r.x, float), float(r.fun)
        return best_x, best

    # -------------------------------------------------------------------- fit
    @classmethod
    def fit(cls, f, y, context):
        cls._check(f, y, context)
        t = cls._table(context)
        unbound = engine.unbound_parameters(f)
        if unbound:
            raise ValueError("Give every parameter a finite starting value, e.g. param('a', value=1.0): "
                             + ", ".join(unbound))
        init = engine.parameter_values(f)
        names = list(init)
        x0 = np.asarray([init[k] for k in names], float)
        if not np.isfinite(x0).all():
            raise ValueError("parameter starting values must be finite")
        best_x, best = cls._minimize(f, t, np.arange(t["y"].size), x0, names)
        if best >= cls.PENALTY:
            raise ValueError("the expression does not give a finite value on every bin at the starting values")
        return engine.bind_parameters(f, dict(zip(names, map(float, best_x)))) if names else f

    # --------------------------------------------------------------- evaluate
    @classmethod
    def evaluate(cls, f, y, context):
        cls._check(f, y, context)
        t = cls._table(context)
        pred = cls._predict(f, t["X"])
        if not np.isfinite(pred).all():
            raise ValueError("the formula does not give a finite value on every bin")
        n = int(t["y"].size)
        init = engine.parameter_values(f)
        names = list(init)
        x_full = np.asarray([init[k] for k in names], float)
        chi2 = float(np.sum(cls._chi2_terms(t["y"], pred, t["lo"], t["up"])))
        held = []
        for i in range(n):
            keep = np.flatnonzero(np.arange(n) != i)
            x_i, val = cls._minimize(f, t, keep, x_full, names)
            if val >= cls.PENALTY:
                held.append(cls.PENALTY)
                continue
            p_i = cls._predict(f, {k: v[i:i + 1] for k, v in t["X"].items()}, dict(zip(names, x_i)))
            term = cls._chi2_terms(t["y"][i:i + 1], p_i, t["lo"][i:i + 1], t["up"][i:i + 1])
            held.append(float(term[0]) if np.isfinite(term).all() else cls.PENALTY)
        metrics = regression_metrics(f, t["y"], pred)
        if float(np.ptp(pred)) == 0.0:
            metrics.update({k: 0.0 for k in ("pearson_r", "spearman_r") if k in metrics})
        dof = max(n - len(names), 1)
        metrics.update(chi2=chi2, reduced_chi2=chi2 / dof, loo_chi2=float(np.mean(held)),
                       loo_worst_bin=float(np.max(held)), n_parameters=len(names), n_samples=n)
        return metrics
