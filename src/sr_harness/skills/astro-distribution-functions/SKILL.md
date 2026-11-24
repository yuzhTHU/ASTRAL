---
name: astro-distribution-functions
description: Use for any question about the shape of an astronomical energy, luminosity, flux, mass or size distribution fitted to binned counts, including whether it is stable between observations. Explains that the formula is the number per dex of the binned variable, gives the standard families, and the search order starting with the fit_distribution_families tool. Does not name the answer for any dataset.
---

# Model an astronomical distribution function

## Write the candidate in the evaluator's measure

With bins in x = log10(E) the candidate f(x) is the number per dex, E·dN/dE. Literature forms are usually dN/dE: multiply by E. Below u = (10**(x - x0)) with fitted x0, always in parentheses (`10**(x-x0)**a` means 10**((x-x0)**a)); all exponents are fitted param().

| family (dN/dE) | f(x), per dex |
|---|---|
| power law E^-a | u**(1-a) |
| log-normal in E | exp(-((x-x0)/s)**2/2); s in dex, sigma_lnE = s*ln(10) |
| smoothly broken power law E^-a1 → E^-a2 | u**(1-a1)/(1+u**(a2-a1)) with a1 < 1 < a2; a1 = 0 is the generalized Cauchy 1/(1+u**a) |
| Schechter E^-a exp(-E/E0) | u**(1-a)*exp(-u) |

Choose starting exponents so each component rises below its location and falls above it; the evaluator rejects starting values that do not. Write positive amplitudes as exp(param('lnA', value=0.0)). The overall scale cancels in the evaluator, so one component needs no amplitude. Read starting values (peak position, width, tail slope) from the histogram before fitting.

## Search order

1. Call `fit_distribution_families` first. It fits the standard families and log-normal peak + tail sums from data-based starting values, simplifies each sum (exponents set to 0, 1 or 2, shared locations) and ranks everything on validation. Submit its best row.
2. Then look for better forms: other tails, other peak shapes, asymmetry. Pass promising fitted formulas to `simplify_formula`; a sum that ranks low when free can rank first once simplified.
3. Stop when added terms give less than 2% improvement. Among forms within 2%, prefer fewer fitted parameters, then the form built from standard families.

## Admissibility

- Every component must be a distribution that falls off at both ends, also beyond the observed range. The evaluator rejects candidates that do not drop below half their edge value one grid span outside the data, such as constant floors or tails that rise again.
- Avoid oscillating factors; periods near the bin width or the grid span fit binning artefacts. Avoid steps or min/max switches at chosen energies unless a sharp break is the hypothesis being tested.
- Bare numbers other than 0, 1, 2, 10, e and pi are rejected by the evaluator: pivots, slopes, widths and amplitudes are fitted param().
- The lowest bins can be depleted by detection incompleteness. Note this rather than adding a component only for them.

## Report

Give the peak energy (in physical units), the width in dex and as sigma_lnE, the tail type (power law with index a in dN/dE ∝ E^-a, or exponential cutoff) and its parameters, the single-family baselines, the step-3 table (free fit and each simplified variant with validation `mse`), and validation `mse`/`r2`. The validation groups are later observations, so a good validation score supports a stable shape; a large train/validation gap suggests the distribution changes between groups.
