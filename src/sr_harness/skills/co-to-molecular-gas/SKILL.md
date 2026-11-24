---
name: co-to-molecular-gas
description: Use when converting CO line luminosities or luminosity densities into molecular gas mass or the cosmic molecular density parameter Omega_H2 (for example from line-intensity mapping or CO surveys). Gives the L to L' conversion, the role of the CO(1-0) line and alpha_CO, and the critical density, with the usual pitfalls.
---

# From CO luminosity to molecular gas

## Conversions

1. Line luminosity L (in L_sun) to the brightness-temperature luminosity L' (in K km/s pc^2) for a line at rest frequency nu (GHz):
   L = 3.2e-11 * nu^3 * L'   (Solomon & Vanden Bout 2005). For CO(1-0), nu = 115.271 GHz, so L = 4.9e-5 * L'.
   The same holds for luminosity densities (L_sun/Mpc^3 to K km/s pc^2 per Mpc^3).
2. Gas mass uses the CO(1-0) line only: M_H2 = alpha_CO * L'_CO(1-0), with alpha_CO in M_sun (K km/s pc^2)^-1. The Milky Way value is 3.6 without helium or 4.3 with helium; state which one is used.
3. Omega_H2 = rho_H2 / rho_crit,0 with rho_crit,0 = 2.775e11 h^2 M_sun/Mpc^3 (present-day value, comoving density). Planck 2018: h = 0.6766.

## Pitfalls

- A sum over several CO transitions is not CO(1-0). If only the sum is given, the CO(1-0) share must come from the excitation (SLED) model the authors used; record where the share came from. Higher-J lines carry most of the luminosity at high redshift, so the share falls with redshift.
- Scale the lower and upper errors with the same factor as the value; keep them separate.
- Model curves or posterior medians on a dense grid are not independent measurements. Use them only for conversion factors, never as data points.
- Report alpha_CO, h and the CO(1-0) share in the output so the result can be rescaled.
