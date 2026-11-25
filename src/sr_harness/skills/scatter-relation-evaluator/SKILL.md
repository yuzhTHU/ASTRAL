---
name: scatter-relation-evaluator
description: Use when building an evaluator for a relation between per-object measurements that have quoted uncertainties, an unknown intrinsic scatter and possibly contaminating outliers (for example stellar age against [Fe/H], or metallicity against pulsation period). Provides the reference evaluator to copy, with a random or grouped holdout, Gaussian likelihood with per-object error plus fitted intrinsic scatter, optional uniform outlier component, and a guard against hand-tuned constants.
---

# Evaluate a relation with measurement errors, scatter and outliers

## Steps

1. Set roles: target = the measured quantity; features = the predictors. When the user names several predictors (for example two periods), select all of them, plus columns derived from them such as their ratio; the search decides which ones the relation needs. Also select the target's uncertainty column (and the group id column if objects repeat): custom evaluators only see selected arrays. The reference evaluator refuses any formula that uses these extra columns.
2. Read `scripts/scatter_relation_evaluator.py` with `read_skill(name="scatter-relation-evaluator", file_path="scripts/scatter_relation_evaluator.py")` and write it to `context.evaluator/` unchanged except the class constants: `TARGET`, `FEATURES`, `UNCERTAINTY`, `GROUP` (or None), `VALIDATION_FRACTION` (the user's value) and `OUTLIERS` (True when the user mentions contaminants or outliers). Do not write your own evaluator.
3. Validate with a constant and with a fitted linear formula in the features. Check that a formula using the uncertainty column, one with a bare number such as `3*feh`, and one that uses an allowed literal as a coefficient such as `param('a') + 2/feh` are all rejected.
4. Report the split sizes and that candidates are ranked by `selection_bic` (the training-split BIC under this likelihood, reported on every split), lower is better; `gaussian_nll` on the validation split is the overfitting check.

## What it does

Each object contributes a Gaussian with variance (its uncertainty)^2 + s^2, where s is the intrinsic scatter. With `OUTLIERS = True` a fraction eta of objects instead follows a uniform distribution over the target's range. Candidate parameters, s and eta are fitted on the training split only; on each split s and eta are re-profiled with the formula held fixed, so `gaussian_nll` (mean negative log-likelihood per object) compares splits fairly. `intrinsic_scatter` and `outlier_fraction` are reported.

Do not change the likelihood, the split or the literal guard to make a candidate look better.

## Choosing among candidates (for the search)

1. Score a constant and a straight line in each feature first; they are the baselines every other form must beat. When the user names several predictors, also try the plain linear combination of them (in log for periods, ratios and other scale quantities) before curved one-variable forms.
2. Choose by `selection_bic`, the training-split BIC that the search ranks by (lower is better). It uses the full training likelihood and charges ln(n) per fitted parameter: on a large sample a small gain from an extra term does not pay, on a small sample a term the data clearly support is kept even when the validation split is too small to resolve it. Differences below 2 are ties: prefer fewer parameters, then the conventional way of writing the relation in the field (for example log P for period relations).
3. Use the validation `gaussian_nll` as an overfitting check: reject a candidate whose validation score is worse than the best by more than `gaussian_nll_se`.
4. Before submitting, list the lowest training `likelihood_bic` of each family you tried (one predictor; all named predictors together; curved forms) and compare them with each other, not only within one family. The lowest overall wins unless another is within 2 of it with fewer parameters.
5. Run `simplify_formula` on the chosen candidate; it names the variant preferred by the training BIC.
6. Submit the formula the search ranks first (lowest `selection_bic`) as your first submission, even when validation scores are tied or a residual check looks flat: a tied validation score on a small split is not evidence against a term the training likelihood supports. Submit other forms after it and discuss them in your summary.
