"""Reference evaluator for a distribution measured as a group x bin count table.

Copy into ``context.evaluator/`` and edit the four class constants. The table
must be group-major: each group (observing session, field, epoch...) occupies a
contiguous block of rows, every block lists the same increasing bin centres.
Custom evaluators run sandboxed and only see the target and feature arrays, so
groups are recovered from that row order and checked strictly.

Protocol
* split: groups in table order; the first groups holding ``TRAIN_FRACTION`` of
  all counts are training, the rest validation. A group never spans both.
* model: candidate ``f(feature)`` is an unnormalised density per bin. In group
  ``g`` the expected count is ``mu = N_g * f(x_b) / sum_b f(x_b)``, so only the
  shape is tested and group totals (exposure, sensitivity) cancel.
* fit: training groups only, multinomial (Poisson) likelihood, several starts.
* metrics: ``mse``/``r2``... compare the pooled histogram of the split with its
  expectation, i.e. the usual least-squares histogram fit quality, so the
  default ranking metric ``mse`` ranks shapes. ``poisson_deviance`` (per cell)
  is reported for reference.
* numeric literals other than ALLOWED_LITERALS are rejected: every adjustable
  number must be a fitted ``param()``, so validation scores cannot tune them.
* a distribution must fall off outside the observed range (checked one grid
  span beyond each edge): constant floors or rising tails are not distributions.
"""
from __future__ import annotations

import math

import numpy as np
from scipy.optimize import minimize

import sr_harness_engine as engine
from sr_harness.evaluator.default_evaluator import DefaultEvaluator
from sr_harness.evaluator.utils import regression_metrics


class GroupedHistogramEvaluator(DefaultEvaluator):
    TARGET = "cell_count"          # count per (group, bin)
    FEATURE = "log10_energy"       # bin centre
    TRAIN_FRACTION = 0.70          # share of counts in the earlier groups
    STARTS = 12                    # fit starts: given values + jittered copies
    ALLOWED_LITERALS = (0.0, 1.0, 2.0, 10.0, math.e, math.pi, 2 * math.pi, math.log(10))
    TAIL_FACTOR = 0.5              # f one grid span beyond each edge must be <= this x edge value
    MAX_EVALS = 6000
    PENALTY = 1e100

    # ---------------------------------------------------------------- table
    @classmethod
    def _table(cls, context):
        if context.target != cls.TARGET:
            raise ValueError(f"Select target {cls.TARGET!r} (got {context.target!r})")
        x = np.asarray(context.data[cls.FEATURE], float)
        y = np.asarray(context.data[cls.TARGET], float)
        if x.shape != y.shape or x.ndim != 1 or not np.isfinite(x).all():
            raise ValueError("Feature and target must be aligned finite 1-D arrays")
        if np.any(y < 0) or np.any(y != np.floor(y)):
            raise ValueError("Counts must be nonnegative integers")
        starts = [0, *(np.flatnonzero(np.diff(x) < 0) + 1)]
        bounds = list(zip(starts, [*starts[1:], len(x)]))
        sizes = {b - a for a, b in bounds}
        grid = x[bounds[0][0]:bounds[0][1]]
        if len(sizes) != 1 or np.any(np.diff(grid) <= 0) or any(
                not np.allclose(x[a:b], grid, rtol=0, atol=1e-12) for a, b in bounds):
            raise ValueError("Table must be group-major with one common increasing bin grid per group")
        return {"x": x, "y": y, "bounds": bounds, "nbins": len(grid), "grid": grid}

    @classmethod
    def split(cls, context):
        t = cls._table(context)
        totals = np.array([t["y"][a:b].sum() for a, b in t["bounds"]])
        k = int(np.searchsorted(np.cumsum(totals), cls.TRAIN_FRACTION * totals.sum())) + 1
        if not 0 < k < len(t["bounds"]):
            raise ValueError("Split leaves an empty training or validation set")
        cut = t["bounds"][k - 1][1]
        part = lambda sl: context.with_data({n: np.asarray(v)[sl] for n, v in context.data.items()})
        return {"train": part(slice(0, cut)), "validation": part(slice(cut, None))}

    # ---------------------------------------------------------------- model
    @classmethod
    def _check_formula(cls, f):
        names = {n.name for n in f.iter_preorder() if isinstance(n, engine.Variable)} - {cls.FEATURE}
        if names:
            raise ValueError(f"Use only {cls.FEATURE!r} as input; unexpected {sorted(names)}")
        for node in f.iter_preorder():
            if type(node).__name__ == "Number":
                v = abs(float(node.value))
                if not any(math.isclose(v, a, rel_tol=1e-9, abs_tol=1e-12) for a in cls.ALLOWED_LITERALS):
                    raise ValueError(f"Numeric literal {node.value!r}: declare it as param('name', value=...) "
                                     "so it is fitted on training data")

    @classmethod
    def _expected(cls, f, t, parameters=None):
        with np.errstate(all="ignore"):
            v = np.asarray(engine.evaluate(f, {cls.FEATURE: t["x"]}, parameters=parameters), float)
        v = np.broadcast_to(v, t["x"].shape)
        if not np.isfinite(v).all() or np.any(v < 0):
            raise ValueError("Distribution must be finite and nonnegative at every bin")
        g = t["grid"]
        probe = np.array([g[0], g[-1], 2 * g[0] - g[-1], 2 * g[-1] - g[0]])  # edges, one span beyond
        with np.errstate(all="ignore"):
            e = np.broadcast_to(np.asarray(engine.evaluate(f, {cls.FEATURE: probe}, parameters=parameters), float), (4,))
        tiny = 1e-12 * v.max()
        if not np.isfinite(e).all() or e[2] > cls.TAIL_FACTOR * e[0] + tiny or e[3] > cls.TAIL_FACTOR * e[1] + tiny:
            raise ValueError("Distribution does not fall off beyond the observed range: it must drop below half its "
                             "edge value one grid span outside each edge, or it predicts unbounded counts there")
        mu = np.empty_like(t["y"])
        for a, b in t["bounds"]:
            s = v[a:b].sum()
            if not np.isfinite(s) or s <= 0:
                raise ValueError("Distribution has no positive mass on the bin grid")
            mu[a:b] = t["y"][a:b].sum() * v[a:b] / s
        return mu

    @staticmethod
    def _deviance(y, mu):
        pos = y > 0
        if np.any(mu[pos] <= 0):
            raise ValueError("Observed counts in a bin with zero expectation")
        d = mu - y
        d[pos] += y[pos] * np.log(y[pos] / mu[pos])
        return 2 * d

    # ---------------------------------------------------------------- fit
    @classmethod
    def fit(cls, f, y, context):
        cls._check_formula(f)
        t = cls._table(context)
        if engine.unbound_parameters(f):
            raise ValueError("Give every param() a finite initial value")
        init = engine.parameter_values(f)
        if not init:
            cls._expected(f, t)
            return f
        names = list(init)
        x0 = np.array([init[n] for n in names], float)
        try:  # report why the starting point is invalid instead of a generic failure
            cls._expected(f, t, dict(zip(names, x0)))
        except ValueError as exc:
            raise ValueError(f"Initial parameter values are invalid: {exc}. Choose starting values for which "
                             "every component rises below its location and falls above it") from None
        count = 0

        def loss(p):
            nonlocal count
            count += 1
            try:
                val = float(cls._deviance(t["y"], cls._expected(f, t, dict(zip(names, p)))).mean())
                return val if np.isfinite(val) else cls.PENALTY
            except (ValueError, FloatingPointError, OverflowError):
                return cls.PENALTY

        rng = np.random.default_rng(0)
        best_p, best = x0, loss(x0)
        scale = np.clip(np.abs(x0), 0.1, 1.0)
        for i in range(cls.STARTS):
            # given values, then small and large additive jitters (locations in dex stay local)
            start = x0 if i == 0 else x0 + rng.normal(0, 0.15 if i % 2 else 0.5, x0.size) * scale
            if loss(start) >= cls.PENALTY:
                continue
            for method in ("Nelder-Mead", "Powell"):
                if count > cls.MAX_EVALS:
                    break
                r = minimize(loss, start, method=method, options={"maxiter": 600, "xatol": 1e-7, "fatol": 1e-10})
                if r.fun < best:
                    best_p, best = np.asarray(r.x, float), float(r.fun)
                start = r.x
        if best >= cls.PENALTY:
            raise ValueError("No valid parameter values found; check initial values and the formula domain")
        return engine.bind_parameters(f, dict(zip(names, map(float, best_p))))

    @classmethod
    def fit_candidate(cls, f, context):
        return cls.fit(f, engine.Symbol(context.target), context)

    # ---------------------------------------------------------------- evaluate
    @classmethod
    def evaluate(cls, f, y, context):
        cls._check_formula(f)
        t = cls._table(context)
        mu = cls._expected(f, t)
        hist = t["y"].reshape(-1, t["nbins"]).sum(0)
        expect = mu.reshape(-1, t["nbins"]).sum(0)
        metrics = regression_metrics(f, hist, expect)   # pooled histogram of this split
        metrics.update(poisson_deviance=float(cls._deviance(t["y"], mu).mean()),
                       n_groups=len(t["bounds"]), n_bins=int(t["nbins"]),
                       counts_observed=int(t["y"].sum()), expected_total=float(mu.sum()))
        return metrics

    @classmethod
    def evaluate_candidate(cls, f, context):
        return cls.evaluate(f, engine.Symbol(context.target), context)
