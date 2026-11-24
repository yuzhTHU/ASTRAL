---
name: few-bin-relation-evaluator
description: Use when building an evaluator for a trend measured in only a handful of independent bins (about 5-20 points, for example a cosmic density versus redshift), often with asymmetric errors. Provides the reference evaluator to copy, with an asymmetric chi-square likelihood, leave-one-bin-out validation, a cap on the number of fitted parameters and a guard against hand-tuned constants.
---

# Evaluate a trend measured in a few bins

## Steps

1. Set roles: target = the binned measurement; feature = the bin coordinate (for example redshift). Also select the lower and upper error columns: custom evaluators only see selected arrays. The reference evaluator refuses formulas that use the error columns.
2. Read `scripts/few_bin_evaluator.py` with `read_skill(name="few-bin-relation-evaluator", file_path="scripts/few_bin_evaluator.py")` and write it to `context.evaluator/` unchanged except the class constants `TARGET`, `FEATURES`, `ERR_LOW`, `ERR_UP` (the same column twice if errors are symmetric) and, only if the user asks, `MAX_PARAMETERS`. Do not write your own evaluator.
3. Validate with a fitted constant, with a fitted power law in the feature, and check that a formula with a bare number such as `3*z` and one using an error column are rejected.
4. Report the number of bins and that candidates are ranked by `loo_chi2`, lower is better.

## What it does

With this few points a fixed holdout wastes data, so both splits hold all bins. Parameters are fitted on all bins by asymmetric chi-square (a point uses its upper error when the model lies above it). `loo_chi2` refits the formula without each bin in turn, predicts that bin, and averages the held-out chi-square; it penalises formulas that only fit by bending through individual points. `chi2` and `reduced_chi2` describe the full fit; `loo_worst_bin` shows whether one bin dominates.

Error correlations between bins are not modelled; say so if the data provide a covariance. Do not change the likelihood, the validation or the guards to make a candidate look better.
