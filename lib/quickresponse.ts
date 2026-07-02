/* ============================================================================
 * Quick response — the value of a fast second cut (Fisher–Raman "accurate
 * response", made computable).
 *
 * Strategy A (single commit): cut once for the whole season, long lead time.
 * Strategy B (cut–read–recut): commit a lean first cut, observe the first k
 * months of real sales, update the remaining-season forecast from what those
 * reads reveal, then re-cut at a short lead time (with a rush premium).
 *
 * The learning is real only because demand has a PERSISTENT component (a
 * product is a hit or a miss). We estimate that level uncertainty from the
 * history itself — realized year-total deviations vs. the fitted model — and
 * simulate demand paths as (year-level factor λ) × forecast + monthly noise.
 * Conditioning on early reads = k-nearest-neighbour matching on simulated
 * early-season sales (an ABC posterior over paths).
 * ==========================================================================*/
import { hwBest, makeRng, newsvendor, quantile, type Econ } from "./engine";

export interface QRParams { k: number; premium: number; nPaths?: number; seed?: number; }
export interface QRResult {
  Qfull: number;            // the single-commit newsvendor quantity
  Q1: number;               // lean first cut under quick response
  avgQ2: number;            // average second cut across scenarios
  costSingle: number; costQR: number;
  savings: number; savingsPct: number;
  widthBefore: number; widthAfterAvg: number; tightenPct: number;  // forecast-interval shrink from reads
  lambdaN: number;          // how many year-level observations informed λ
}

/* year-level demand factors: realized yearly totals vs the fitted model's totals */
export function levelRatios(series: number[], m: number): number[] {
  if (series.length < 2 * m) return [1];
  const fit = hwBest(series, m);
  const ratios: number[] = [];
  const years = Math.floor(series.length / m);
  for (let y = 0; y < years; y++) {
    let a = 0, f = 0, cnt = 0;
    for (let t = y * m; t < (y + 1) * m; t++) {
      const fv = fit.fitted[t];
      if (fv != null && fv > 0) { a += series[t]; f += fv; cnt++; }
    }
    if (cnt >= m / 2 && f > 0) ratios.push(a / f);
  }
  return ratios.length ? ratios : [1];
}

export function simulateQR(pointFc: number[], resid: number[], ratios: number[], econ: Econ, p: QRParams): QRResult {
  const N = p.nPaths ?? 1200;
  const H = pointFc.length;
  const k = Math.min(Math.max(1, p.k), H - 1);
  const prem = Math.max(0, p.premium);
  const rng = makeRng(p.seed ?? 21);
  const nv = newsvendor(econ);
  const R = resid.length;

  // simulate paths with a persistent level factor λ + bootstrapped monthly noise
  const early = new Array<number>(N), rem = new Array<number>(N);
  for (let i = 0; i < N; i++) {
    const lam = ratios[(rng() * ratios.length) | 0] * (1 + (rng() - 0.5) * 0.06); // kernel jitter
    let e = 0, r = 0;
    for (let t = 0; t < H; t++) {
      const noise = R ? resid[(rng() * R) | 0] : 0;
      const d = Math.max(0, lam * pointFc[t] + noise);
      if (t < k) e += d; else r += d;
    }
    early[i] = e; rem[i] = r;
  }

  const totalsSorted = early.map((e, i) => e + rem[i]).sort((a, b) => a - b);
  const Qfull = Math.round(quantile(totalsSorted, nv.criticalRatio));

  // first cut: under-committing costs only the rush premium later (the re-cut
  // covers it), so the stage-1 newsvendor uses Cu1 = premium × unit cost.
  const cuPrem = prem * econ.unitCost;
  const cr1 = cuPrem + nv.Co > 0 ? cuPrem / (cuPrem + nv.Co) : 0;
  const Q1 = Math.round(quantile(totalsSorted, cr1));

  // second-stage economics: rush units cost c(1+prem)
  const cu2 = Math.max(0, econ.price - econ.unitCost * (1 + prem));
  const co2 = Math.max(0, econ.unitCost * (1 + prem) - econ.salvage);
  const cr2 = cu2 + co2 > 0 ? cu2 / (cu2 + co2) : 0;

  // kNN conditioning: paths ranked by early-season sales; a window of similar
  // paths is the posterior over the remaining season.
  const order = early.map((e, i) => i).sort((a, b) => early[a] - early[b]);
  const rank = new Array<number>(N);
  order.forEach((pi, r2) => { rank[pi] = r2; });
  const remSortedByEarly = order.map((pi) => rem[pi]);
  const W = Math.max(40, Math.round(N / 10));

  const remAllSorted = rem.slice().sort((a, b) => a - b);
  const widthBefore = quantile(remAllSorted, 0.9) - quantile(remAllSorted, 0.1);

  let costS = 0, costQ = 0, sumQ2 = 0, widthAfter = 0;
  for (let i = 0; i < N; i++) {
    const D = early[i] + rem[i];
    // strategy A — single commit
    costS += nv.Co * Math.max(0, Qfull - D) + nv.Cu * Math.max(0, D - Qfull);
    // strategy B — cut, read, re-cut
    const lo2 = Math.min(Math.max(0, rank[i] - W / 2), N - W);
    const cond = remSortedByEarly.slice(lo2, lo2 + W).sort((a, b) => a - b);
    widthAfter += quantile(cond, 0.9) - quantile(cond, 0.1);
    const leftover1 = Math.max(0, Q1 - early[i]);
    const earlyShort = Math.max(0, early[i] - Q1);
    const q2 = cu2 > 0 ? Math.max(0, Math.round(quantile(cond, cr2)) - leftover1) : 0;
    const supply = leftover1 + q2;
    const remShort = Math.max(0, rem[i] - supply);
    const leftover = Math.max(0, supply - rem[i]);
    costQ += nv.Cu * (earlyShort + remShort) + nv.Co * leftover + cuPrem * q2;
    sumQ2 += q2;
  }
  costS /= N; costQ /= N; widthAfter /= N;

  const savings = costS - costQ;
  return {
    Qfull, Q1, avgQ2: Math.round(sumQ2 / N),
    costSingle: costS, costQR: costQ,
    savings, savingsPct: costS > 0 ? savings / costS : 0,
    widthBefore, widthAfterAvg: widthAfter,
    tightenPct: widthBefore > 0 ? 1 - widthAfter / widthBefore : 0,
    lambdaN: ratios.length,
  };
}
