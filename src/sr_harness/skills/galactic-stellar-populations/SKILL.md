---
name: galactic-stellar-populations
description: Use when selecting one Milky Way stellar population (thin disk, thick disk, halo) from a catalogue with abundances and orbital actions, for example to study an age, abundance or metallicity trend inside that population. Gives the usual chemo-dynamical definitions and the rules that keep the selection from biasing the trend.
---

# Select a Galactic stellar population

## Usual definitions (solar neighbourhood)

Actions in kpc km/s; J_phi is the angular momentum L_z, about 1800-2000 for the Sun's orbit.

- Thin disk: [alpha/Fe] on the low sequence (about 0-0.1), J_phi near the solar value, small J_z.
- Thick disk (old, alpha-enhanced): [alpha/Fe] on the high sequence; it rotates but lags the thin disk, so 0 < J_phi below about 1500; larger J_z.
- Halo and accreted debris: J_phi near zero or negative, large J_R; mostly [Fe/H] below about -1.

## Rules

1. Never cut on a quantity under study. If the question is age against [Fe/H], do not cut on age or [Fe/H]. Precision cuts (for example on relative age error) are allowed; report them.
2. Define the population with the fewest cuts: the alpha sequence plus the rotation (J_phi) range above. Do not stack further J_z or J_R thresholds unless the user asks; each extra cut changes which stars are in the population.
3. The high-alpha sequence slopes down with [Fe/H]: about 0.25-0.3 at [Fe/H] = -1 and about 0.1-0.15 near solar. Put a flat threshold just above the thin-disk sequence (about 0.10-0.15), or follow the gap between the sequences. A higher flat cut (0.2 or more) removes the metal-rich end of the thick disk and biases any trend with [Fe/H].
4. Report the count after every step and a small table of how the count changes with the [alpha/Fe] threshold.
5. Some contamination survives any cut: halo stars at the metal-poor end, and in age samples blue stragglers and merger products that look too young. Keep these stars; the evaluator handles them with an outlier component (skill `scatter-relation-evaluator`), and the search can show where the trend stops.
6. Put only the selected population in the analysis table; save the rest separately for comparison.
