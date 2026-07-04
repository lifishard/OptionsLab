// Option Greeks. All functions return the RAW per-unit-of-underlying value
// (i.e. per 1 share). The UI decides whether to multiply by 100 for a contract.

import { OptionType, normCdf, normPdf, d1 as _d1 } from "./bsm";

export interface GreekInput {
  S: number; // spot
  K: number; // strike
  T: number; // time to expiry in YEARS
  r: number; // risk-free rate (decimal)
  sigma: number; // implied volatility (decimal)
  q?: number; // dividend yield (decimal), default 0
  type: OptionType;
}

const EPS = 1e-8;

function safe(T: number, sigma: number): { T: number; sigma: number } {
  return { T: T <= 0 ? EPS : T, sigma: sigma <= 0 ? EPS : sigma };
}

/** Delta: sensitivity of option price to a $1 move in the underlying. */
export function delta({ S, K, T, r, sigma, q = 0, type }: GreekInput): number {
  const s = safe(T, sigma);
  const D1 = _d1(S, K, s.T, r, s.sigma, q);
  const dfQ = Math.exp(-q * s.T);
  return type === "call" ? dfQ * normCdf(D1) : dfQ * (normCdf(D1) - 1);
}

/** Gamma: rate of change of Delta. Identical for calls and puts. */
export function gamma({ S, K, T, r, sigma, q = 0 }: GreekInput): number {
  const s = safe(T, sigma);
  const D1 = _d1(S, K, s.T, r, s.sigma, q);
  const dfQ = Math.exp(-q * s.T);
  return (dfQ * normPdf(D1)) / (S * s.sigma * Math.sqrt(s.T));
}

/**
 * Theta. By default returns PER-DAY theta (annualized / 365) to match
 * retail conventions. Pass perDay = false for the annualized value.
 */
export function theta(
  { S, K, T, r, sigma, q = 0, type }: GreekInput,
  perDay = true,
): number {
  const s = safe(T, sigma);
  const D1 = _d1(S, K, s.T, r, s.sigma, q);
  const D2 = D1 - s.sigma * Math.sqrt(s.T);
  const dfR = Math.exp(-r * s.T);
  const dfQ = Math.exp(-q * s.T);

  const term1 = -(S * dfQ * normPdf(D1) * s.sigma) / (2 * Math.sqrt(s.T));
  let annual: number;
  if (type === "call") {
    annual =
      term1 -
      r * K * dfR * normCdf(D2) +
      q * S * dfQ * normCdf(D1);
  } else {
    annual =
      term1 +
      r * K * dfR * normCdf(-D2) -
      q * S * dfQ * normCdf(-D1);
  }
  return perDay ? annual / 365 : annual;
}

/** Vega: price change for a 1% (1 percentage-point) move in IV. */
export function vega({ S, K, T, r, sigma, q = 0 }: GreekInput): number {
  const s = safe(T, sigma);
  const D1 = _d1(S, K, s.T, r, s.sigma, q);
  const dfQ = Math.exp(-q * s.T);
  // Raw vega (per 1.0 change in sigma) divided by 100 -> per 1% change.
  return (S * dfQ * normPdf(D1) * Math.sqrt(s.T)) / 100;
}

/** Rho: price change for a 1% (1 percentage-point) move in interest rate. */
export function rho({ S, K, T, r, sigma, q = 0, type }: GreekInput): number {
  const s = safe(T, sigma);
  const D1 = _d1(S, K, s.T, r, s.sigma, q);
  const D2 = D1 - s.sigma * Math.sqrt(s.T);
  const dfR = Math.exp(-r * s.T);
  const raw =
    type === "call"
      ? K * s.T * dfR * normCdf(D2)
      : -K * s.T * dfR * normCdf(-D2);
  return raw / 100;
}
