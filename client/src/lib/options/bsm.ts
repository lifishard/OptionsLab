// Black-Scholes-Merton pricing. Pure TS, no React dependency.

export type OptionType = "call" | "put";

export interface BsmInput {
  S: number; // underlying spot price
  K: number; // strike
  T: number; // time to expiry in YEARS
  r: number; // risk-free rate (decimal, e.g. 0.045)
  sigma: number; // implied volatility (decimal, e.g. 0.30)
  q?: number; // continuous dividend yield (decimal), default 0
  type: OptionType;
}

const SQRT_2PI = Math.sqrt(2 * Math.PI);

/** Standard normal probability density function. */
export function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / SQRT_2PI;
}

/**
 * Standard normal cumulative distribution function.
 * Abramowitz & Stegun 26.2.17 approximation, |error| < 7.5e-8.
 */
export function normCdf(x: number): number {
  const b1 = 0.319381530;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;
  const p = 0.2316419;
  const c = 0.39894228; // 1/sqrt(2*pi)

  const absX = Math.abs(x);
  const t = 1 / (1 + p * absX);
  const poly =
    c * Math.exp(-absX * absX / 2) *
    t * (b1 + t * (b2 + t * (b3 + t * (b4 + t * b5))));
  // For x >= 0, CDF = 1 - poly; symmetric otherwise.
  return x >= 0 ? 1 - poly : poly;
}

/** A tiny positive number used when sigma or T degenerate to zero. */
const EPS = 1e-8;

/**
 * d1 term of the BSM formula.
 */
export function d1(S: number, K: number, T: number, r: number, sigma: number, q: number): number {
  return (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
}

export function d2(S: number, K: number, T: number, r: number, sigma: number, q: number): number {
  return d1(S, K, T, r, sigma, q) - sigma * Math.sqrt(T);
}

/**
 * Black-Scholes-Merton theoretical price for a European option.
 * Edge cases:
 *  - T <= 0 returns intrinsic value.
 *  - sigma <= 0 is clamped to a tiny positive number.
 */
export function bsmPrice({ S, K, T, r, sigma, q = 0, type }: BsmInput): number {
  if (T <= 0) {
    return type === "call" ? Math.max(S - K, 0) : Math.max(K - S, 0);
  }
  const vol = sigma <= 0 ? EPS : sigma;
  const D1 = d1(S, K, T, r, vol, q);
  const D2 = D1 - vol * Math.sqrt(T);
  const dfR = Math.exp(-r * T);
  const dfQ = Math.exp(-q * T);

  if (type === "call") {
    return S * dfQ * normCdf(D1) - K * dfR * normCdf(D2);
  }
  return K * dfR * normCdf(-D2) - S * dfQ * normCdf(-D1);
}
