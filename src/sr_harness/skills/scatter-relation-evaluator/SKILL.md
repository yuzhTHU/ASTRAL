---
name: scatter-relation-evaluator
description: Use when building an evaluator for a relation between per-object measurements that have quoted uncertainties, an unknown intrinsic scatter and possibly contaminating outliers (for example stellar age against [Fe/H], or metallicity against pulsation period). Provides the reference evaluator to copy, with a random or grouped holdout, Gaussian likelihood with per-object error plus fitted intrinsic scatter, optional uniform outlier component, and a guard against hand-tuned constants.
---

# Evaluate a relation with measurement errors, scatter and outliers

## Steps

1. Set roles: target = the measured quantity; features = the predictors. Also select the target's uncertainty column (and the group id column if objects repeat): custom evaluators only see selected arrays. The reference evaluator refuses any formula that uses these extra columns.
2. Read `scripts/scatter_relation_evaluator.py` with `read_skill(name="scatter-relation-evaluator", file_path="scripts/scatter_relation_evaluator.py")` and write it to `context.evaluator/` unchanged except the class constants: `TARGET`, `FEATURES`, `UNCERTAINTY`, `GROUP` (or None), `VALIDATION_FRACTION` (the user's value) and `OUTLIERS` (True when the user mentions contaminants or outliers). Do not write your own evaluator.
3. Validate with a constant and with a fitted linear formula in the features. Check that a formula using the uncertainty column and one with a bare number such as `3*feh` are rejected.
4. Report the split sizes and that candidates are ranked by `gaussian_nll`, lower is better.

## What it does

Each object contributes a Gaussian with variance (its uncertainty)^2 + s^2, where s is the intrinsic scatter. With `OUTLIERS = True` a fraction eta of objects instead follows a uniform distribution over the target's range. Candidate parameters, s and eta are fitted on the training split only; on each split s and eta are re-profiled with the formula held fixed, so `gaussian_nll` (mean negative log-likelihood per object) compares splits fairly. `intrinsic_scatter` and `outlier_fraction` are reported.

Do not change the likelihood, the split or the literal guard to make a candidate look better.
