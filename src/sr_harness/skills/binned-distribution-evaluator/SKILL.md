---
name: binned-distribution-evaluator
description: Use when preparing counts per bin for, or building an evaluator of, the shape of an astronomical distribution (energy, luminosity, flux, mass or size function) observed in several sessions, epochs or fields. Defines the long count table and provides the reference evaluator to copy (group split, multinomial fit, histogram metrics, guards against hand-tuned constants and non-decaying forms); custom evaluators are not needed.
---

# Evaluate a binned distribution

## Count table (data preparation)

Build a long table: one row per (group, bin), 1-D arrays aligned on one axis: the group id, the bin centre (for energies log10 E in dex) and the integer count. Same bins for every group, empty bins kept, rows ordered by group in time order then by increasing bin centre. Do not store it as a 2-D matrix; the evaluator only sees aligned 1-D arrays.

Use this when the data are a group x bin count table and the question is the distribution's shape, not a prediction for individual objects. Group totals depend on exposure and sensitivity; the reference protocol normalises them away inside each group, so no exposure model is needed.

## Steps

1. Check the table: one row per (group, bin), group-major order, the same increasing bin centres in every group, integer counts, zero-count rows kept. If it is not in this form (for example empty bins were dropped, so groups have different row counts), stop and ask the user to have the data-preparation agent rebuild it; do not repair or reorder rows inside the evaluator.
2. Set roles: target = the count column, the only feature = the bin centre (for energies, `log10_energy`). Everything else is unused; custom evaluators cannot see unused arrays.
3. Read `scripts/grouped_histogram_evaluator.py` with `read_skill(name="binned-distribution-evaluator", file_path="scripts/grouped_histogram_evaluator.py")` and write it to `context.evaluator/` unchanged except the class constants `TARGET`, `FEATURE` and `TRAIN_FRACTION` (the share of counts in the earlier groups; keep the user's value). Do not write your own evaluator: the reference also checks fitted parameters, numeric literals and the fall-off beyond the data, which the search relies on.
4. Validate with a constant and with a two-parameter Gaussian in the feature (fitted). Check `expected_total == counts_observed` in both splits, that the fitted Gaussian beats the constant on training `mse`, and that a formula with a bare number such as `exp(3*log10_energy)` is rejected.
5. Report the groups and counts in each split, and that candidates are ranked by `mse`, lower is better.

## What the metrics mean

`mse`, `r2` and the other standard metrics compare the split's pooled histogram (counts summed over its groups) with the expected histogram: the usual least-squares quality of a histogram fit. Parameters are fitted on the training groups with the multinomial likelihood, which treats sparse tail bins correctly. `poisson_deviance` is the per-cell deviance, for reference.

Do not change the split, the likelihood or the literal guard to make a candidate look better. If the user's protocol differs (for example a known exposure per group), adapt the expected counts and state the change.
