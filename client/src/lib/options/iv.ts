// Implied volatility solver via Newton-Raphson with bisection fallback.

import { OptionType, bsmPrice } from "./bsm";
import { vega } from "./greeks";

export interface ImpliedVolInput {
  price: number; // observed option price (per share)
  S: number;
  K: number;
  T: number; // years
  r: number;
  q?: number;
  type: OptionType;
}

const MAX_ITER = 100;
const TOL = 1e-6;

/**
 * Solve for implied volatility.
 * Newton-Raphson seeded at sigma = 0.3, using vega as the derivative.
 * Falls back to bisection when vega is too small to trust.
 * Returns NaN if the target price is outside no-arbitrage bounds.
 */
export function impliedVol({ price, S, K, T, r, q = 0, type }: ImpliedVolInput): number {
  if (T <= 0 || price <= 0) return NaN;

  // No-arbitrage bounds check.
  const dfR = Math.exp(-r * T);
  const dfQ = Math.exp(-q * T);
  const intrinsic =
    type === "call"
      ? Math.max(S * dfQ - K * dfR, 0)
      : Math.max(K * dfR - S * dfQ, 0);
  const upper = type === "call" ? S * dfQ : K * dfR;
  if (price < intrinsic - TOL || price > upper + TOL) return NaN;

  let sigma = 0.3;

  for (let i = 0; i < MAX_ITER; i++) {
    const modelPrice = bsmPrice({ S, K, T, r, sigma, q, type });
    const diff = modelPrice - price;
    if (Math.abs(diff) < TOL) return sigma;

    // vega() returns per-1% value, so scale back to per-1.0-sigma derivative.
    const v = vega({ S, K, T, r, sigma, q, type }) * 100;
    if (v < 1e-8) break; // vega too small -> switch to bisection
    sigma = sigma - diff / v;
    if (sigma <= 0 || !isFinite(sigma)) {
      sigma = 0.3; // reset then bisect
      break;
    }
  }

  // Bisection fallback over a wide vol range.
  let lo = 1e-4;
  let hi = 5.0;
  let priceLo = bsmPrice({ S, K, T, r, sigma: lo, q, type }) - price;
  let priceHi = bsmPrice({ S, K, T, r, sigma: hi, q, type }) - price;
  if (priceLo * priceHi > 0) return NaN; // no sign change -> no root

  for (let i = 0; i < MAX_ITER; i++) {
    const mid = 0.5 * (lo + hi);
    const pm = bsmPrice({ S, K, T, r, sigma: mid, q, type }) - price;
    if (Math.abs(pm) < TOL || (hi - lo) / 2 < TOL) return mid;
    if (pm * priceLo < 0) {
      hi = mid;
      priceHi = pm;
    } else {
      lo = mid;
      priceLo = pm;
    }
  }
  return 0.5 * (lo + hi);
}
