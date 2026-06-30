/* ============================================================================
 * Loom Reach — core engine. Pure, dependency-free, identical logic to the
 * headless-validated reference (13/13 engine tests, 17/17 app tests).
 * Forecast (Holt-Winters) -> predictive distribution (residual bootstrap)
 * -> newsvendor production quantity -> cost backtest vs naive baselines.
 * ==========================================================================*/

export interface Econ { price: number; unitCost: number; salvage: number; }
export interface Fit {
  level: number; trend: number; seasonal: number[]; fitted: (number | null)[];
  rmse: number; n: number; m: number; alpha: number; beta: number; gamma: number;
}
export interface Newsvendor { Cu: number; Co: number; criticalRatio: number; }
export interface Plan {
  fit: Fit; pointForecast: number[]; residuals: number[]; samples: number[];
  meanDemand: number; newsvendor: Newsvendor; Qstar: number; QtoMean: number;
  expectedCostStar: number; expectedCostMean: number;
}
export interface Scored { Q: number; overUnits: number; shortUnits: number; overCost: number; shortCost: number; total: number; }
export interface Backtest {
  actualDemand: number;
  decisions: { newsvendor: number; makeToMean: number; lastSeasonPlus10: number; runRate: number };
  scored: Record<string, Scored>;
  plan: Plan; savedVsMean: number; savedVsLastPlus: number;
}

/* seeded RNG (mulberry32) so results are reproducible */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const avg = (a: number[]): number => a.reduce((x, y) => x + y, 0) / Math.max(a.length, 1);

/* Holt-Winters additive */
function hwFit(y: number[], m: number, alpha: number, beta: number, gamma: number): Fit {
  const n = y.length;
  const firstMean = avg(y.slice(0, m));
  const secondMean = avg(y.slice(m, 2 * m));
  let level = firstMean;
  let trend = (secondMean - firstMean) / m;
  const seasonal: number[] = [];
  for (let i = 0; i < m; i++) seasonal[i] = y[i] - firstMean;
  const fitted: (number | null)[] = new Array(n).fill(null);
  let sse = 0, cnt = 0;
  for (let t = 0; t < n; t++) {
    const s = seasonal[t % m];
    const f = level + trend + s;
    if (t >= m) { fitted[t] = f; sse += (y[t] - f) ** 2; cnt++; }
    const lvlPrev = level;
    level = alpha * (y[t] - s) + (1 - alpha) * (level + trend);
    trend = beta * (level - lvlPrev) + (1 - beta) * trend;
    seasonal[t % m] = gamma * (y[t] - level) + (1 - gamma) * s;
  }
  return { level, trend, seasonal, fitted, rmse: Math.sqrt(sse / Math.max(cnt, 1)), n, m, alpha, beta, gamma };
}

export function hwBest(y: number[], m: number): Fit {
  const grid = [0.05, 0.15, 0.3, 0.5, 0.7];
  let best: Fit | null = null;
  for (const a of grid) for (const b of grid) for (const g of grid) {
    const fit = hwFit(y, m, a, b, g);
    if (!isFinite(fit.rmse)) continue;
    if (!best || fit.rmse < best.rmse) best = fit;
  }
  return best ?? hwFit(y, m, 0.3, 0.05, 0.2);
}

export function residuals(fit: Fit, y: number[]): number[] {
  const r: number[] = [];
  for (let t = 0; t < y.length; t++) { const f = fit.fitted[t]; if (f != null) r.push(y[t] - f); }
  return r;
}

export function hwForecast(fit: Fit, h: number): number[] {
  const out: number[] = [];
  for (let k = 1; k <= h; k++) { const idx = (fit.n - 1 + k) % fit.m; out.push(fit.level + k * fit.trend + fit.seasonal[idx]); }
  return out;
}

export function seasonDemandSamples(pointFc: number[], resid: number[], nSamples: number, rng: () => number): number[] {
  const samples = new Array<number>(nSamples);
  const R = resid.length;
  for (let s = 0; s < nSamples; s++) {
    let tot = 0;
    for (let k = 0; k < pointFc.length; k++) { const e = R ? resid[(rng() * R) | 0] : 0; tot += Math.max(0, pointFc[k] + e); }
    samples[s] = tot;
  }
  samples.sort((p, q) => p - q);
  return samples;
}

export function quantile(sortedAsc: number[], p: number): number {
  if (!sortedAsc.length) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.round(p * (sortedAsc.length - 1))));
  return sortedAsc[idx];
}

export function newsvendor(econ: Econ): Newsvendor {
  const Cu = Math.max(0, econ.price - econ.unitCost);
  const Co = Math.max(0, econ.unitCost - econ.salvage);
  const cr = Cu + Co === 0 ? 0.5 : Cu / (Cu + Co);
  return { Cu, Co, criticalRatio: cr };
}

export function expectedCost(Q: number, demandSamples: number[], Cu: number, Co: number): number {
  let c = 0;
  for (let i = 0; i < demandSamples.length; i++) { const d = demandSamples[i]; c += Co * Math.max(0, Q - d) + Cu * Math.max(0, d - Q); }
  return c / demandSamples.length;
}

export function realizedCost(Q: number, actualDemand: number, Cu: number, Co: number): Scored {
  const over = Math.max(0, Q - actualDemand), short = Math.max(0, actualDemand - Q);
  return { Q, overUnits: over, shortUnits: short, overCost: Co * over, shortCost: Cu * short, total: Co * over + Cu * short };
}

export function planSku(series: number[], m: number, horizon: number, econ: Econ, opts?: { nSamples?: number; seed?: number }): Plan {
  const nSamples = opts?.nSamples ?? 5000;
  const rng = makeRng(opts?.seed ?? 12345);
  const fit = hwBest(series, m);
  const pointFc = hwForecast(fit, horizon);
  const resid = residuals(fit, series);
  const samples = seasonDemandSamples(pointFc, resid, nSamples, rng);
  const nv = newsvendor(econ);
  const Qstar = Math.round(quantile(samples, nv.criticalRatio));
  const meanDemand = avg(samples);
  const QtoMean = Math.round(meanDemand);
  return {
    fit, pointForecast: pointFc, residuals: resid, samples, meanDemand, newsvendor: nv, Qstar, QtoMean,
    expectedCostStar: expectedCost(Qstar, samples, nv.Cu, nv.Co),
    expectedCostMean: expectedCost(QtoMean, samples, nv.Cu, nv.Co),
  };
}

export function backtest(series: number[], m: number, horizon: number, econ: Econ, opts?: { nSamples?: number; seed?: number }): Backtest {
  const train = series.slice(0, series.length - horizon);
  const test = series.slice(series.length - horizon);
  const actualDemand = test.reduce((a, b) => a + b, 0);
  const plan = planSku(train, m, horizon, econ, opts);
  const nv = plan.newsvendor;
  const Qmean = plan.QtoMean;
  const prevSeason = train.slice(train.length - horizon).reduce((a, b) => a + b, 0);
  const QlastPlus = Math.round(prevSeason * 1.1);
  const QrunRate = Math.round(avg(train.slice(train.length - horizon)) * horizon);
  const decisions = { newsvendor: plan.Qstar, makeToMean: Qmean, lastSeasonPlus10: QlastPlus, runRate: QrunRate };
  const scored: Record<string, Scored> = {};
  (Object.keys(decisions) as (keyof typeof decisions)[]).forEach((k) => { scored[k] = realizedCost(decisions[k], actualDemand, nv.Cu, nv.Co); });
  return { actualDemand, decisions, scored, plan, savedVsMean: scored.makeToMean.total - scored.newsvendor.total, savedVsLastPlus: scored.lastSeasonPlus10.total - scored.newsvendor.total };
}

/* per-period prediction bands (charting only) */
export function perStepBands(pointFc: number[], resid: number[], rng: () => number, n: number) {
  const cols: number[][] = pointFc.map(() => []);
  for (let s = 0; s < n; s++) for (let k = 0; k < pointFc.length; k++) cols[k].push(Math.max(0, pointFc[k] + (resid.length ? resid[(rng() * resid.length) | 0] : 0)));
  return cols.map((c) => { c.sort((a, b) => a - b); return { p10: quantile(c, 0.1), p50: quantile(c, 0.5), p90: quantile(c, 0.9) }; });
}
