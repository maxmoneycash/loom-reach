/* ============================================================================
 * Loom Reach — the forecasting brain.
 * A competition of genuinely different models, selected per-SKU by rolling-
 * origin cross-validation (MASE/WAPE), with demand classification, driver
 * regression, and a probabilistic forecast from the winning model.
 *
 *   Seasonal-Naive · Holt-Winters ETS · Croston/SBA · Driver Ridge Regression
 *   · Forecast Combination
 *
 * Pure + dependency-free. Validated headlessly (see scripts/forecast.test.ts).
 * ==========================================================================*/
import { makeRng, quantile, avg, hwBest, hwForecast, residuals, type Fit } from "./engine";

export interface Drivers { price?: number[]; promo?: number[]; }
export type Rng = () => number;
export interface Band { p10: number; p50: number; p90: number; }
export interface Classification { adi: number; cv2: number; label: "smooth" | "erratic" | "intermittent" | "lumpy" | "new"; }
export interface Candidate { key: string; label: string; mase: number; wape: number; bias: number; ran: boolean; }
export interface ForecastResult {
  classification: Classification;
  candidates: Candidate[];
  selectedKey: string; selectedLabel: string;
  point: number[]; resid: number[]; samples: number[]; bands: Band[];
  drivers: { name: string; coef: number }[];
  skillVsNaive: number; accuracy: { mase: number; wape: number; bias: number };
  hwParams: { alpha: number; beta: number; gamma: number } | null;
}

interface ModelRun {
  key: string; label: string; point: number[]; resid: number[];
  sampler: (n: number, rng: Rng) => number[];
  fittedTrain?: (number | null)[]; coefs?: { name: string; coef: number }[]; fit?: Fit;
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const dot = (a: number[], b: number[]) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

/* ---------------- demand classification (Syntetos–Boylan–Croston) ---------------- */
export function classifyDemand(series: number[]): Classification {
  if (series.length < 6) return { adi: NaN, cv2: NaN, label: "new" };
  const nz = series.filter((v) => v > 0);
  const adi = series.length / Math.max(nz.length, 1);
  const mean = avg(nz);
  const varr = nz.length > 1 ? nz.reduce((s, v) => s + (v - mean) ** 2, 0) / nz.length : 0;
  const cv2 = mean > 0 ? varr / (mean * mean) : 0;
  let label: Classification["label"];
  if (adi < 1.32 && cv2 < 0.49) label = "smooth";
  else if (adi < 1.32) label = "erratic";
  else if (cv2 < 0.49) label = "intermittent";
  else label = "lumpy";
  return { adi, cv2, label };
}

/* ---------------- linear algebra: ridge via normal equations ---------------- */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((r, i) => r.concat([b[i]]));
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

function featuresFor(i: number, m: number, K: number, price?: number[], promo?: number[]): number[] {
  const f = [1, i / m];
  for (let k = 1; k <= K; k++) { const w = (2 * Math.PI * k * i) / m; f.push(Math.sin(w), Math.cos(w)); }
  if (price) f.push(price[i] ?? price[price.length - 1]);
  if (promo) f.push(promo[i] ?? 0);
  return f;
}

/* ---------------- individual models ---------------- */
function snaiveModel(ytrain: number[], m: number, h: number): ModelRun | null {
  if (ytrain.length < m) return null;
  const point = range(h).map((k) => ytrain[ytrain.length - m + (k % m)]);
  const resid: number[] = [];
  for (let t = m; t < ytrain.length; t++) resid.push(ytrain[t] - ytrain[t - m]);
  return { key: "snaive", label: "Seasonal naive", point, resid, sampler: (n, rng) => residualSampler(point, resid, n, rng) };
}

function etsModel(ytrain: number[], m: number, h: number): ModelRun | null {
  if (ytrain.length < 2 * m) return null;
  const fit = hwBest(ytrain, m);
  const point = hwForecast(fit, h).map((v) => Math.max(0, v));
  const resid = residuals(fit, ytrain);
  return { key: "ets", label: "Holt-Winters ETS", point, resid, fit, fittedTrain: fit.fitted, sampler: (n, rng) => residualSampler(point, resid, n, rng) };
}

function etsLogModel(ytrain: number[], m: number, h: number): ModelRun | null {
  if (ytrain.length < 2 * m) return null;
  const ylog = ytrain.map((v) => Math.log1p(v));
  const fit = hwBest(ylog, m);
  const point = hwForecast(fit, h).map((v) => Math.max(0, Math.expm1(v)));
  const resid: number[] = [];
  const fittedTrain: (number | null)[] = fit.fitted.map((f) => (f == null ? null : Math.expm1(f)));
  for (let t = 0; t < ytrain.length; t++) { const f = fittedTrain[t]; if (f != null) resid.push(ytrain[t] - f); }
  return { key: "etslog", label: "ETS (multiplicative)", point, resid, fit, fittedTrain, sampler: (n, rng) => residualSampler(point, resid, n, rng) };
}

function crostonModel(ytrain: number[], h: number, alpha = 0.1, sba = true): ModelRun {
  let z = 0, p = 1, q = 1, started = false;
  for (let t = 0; t < ytrain.length; t++) {
    const d = ytrain[t];
    if (d > 0) { if (!started) { z = d; p = Math.max(q, 1); started = true; } else { z = alpha * d + (1 - alpha) * z; p = alpha * q + (1 - alpha) * p; } q = 1; }
    else q++;
  }
  let rate = started ? z / Math.max(p, 1e-9) : 0;
  if (sba) rate *= 1 - alpha / 2;
  const point = range(h).map(() => rate);
  return { key: "croston", label: "Croston / SBA", point, resid: [], sampler: (n, rng) => empiricalSampler(ytrain, h, n, rng) };
}

function regModel(series: number[], ntrain: number, m: number, h: number, drv: Drivers, K: number, lambda: number): ModelRun | null {
  if (ntrain < 2 * m) return null;
  const ytrain = series.slice(0, ntrain);
  const rawTrain = range(ntrain).map((i) => featuresFor(i, m, K, drv.price, drv.promo));
  const p = rawTrain[0].length;
  // standardize columns 1..p-1 (keep intercept)
  const mean = new Array(p).fill(0), sd = new Array(p).fill(1);
  for (let c = 1; c < p; c++) {
    let mu = 0; for (let r = 0; r < ntrain; r++) mu += rawTrain[r][c]; mu /= ntrain;
    let v = 0; for (let r = 0; r < ntrain; r++) v += (rawTrain[r][c] - mu) ** 2; v /= ntrain;
    mean[c] = mu; sd[c] = Math.sqrt(v) < 1e-9 ? 1 : Math.sqrt(v);
  }
  const std = (row: number[]) => row.map((x, c) => (c === 0 ? 1 : (x - mean[c]) / sd[c]));
  const Xtr = rawTrain.map(std);
  const beta = ridgeFit(Xtr, ytrain, lambda);
  if (!beta) return null;
  const fittedTrain = Xtr.map((row) => dot(row, beta));
  const resid = ytrain.map((y, i) => y - fittedTrain[i]);
  const futIdx = range(h).map((k) => ntrain + k);
  const Xfut = futIdx.map((i) => std(featuresFor(i, m, K, drv.price, drv.promo)));
  const point = Xfut.map((row) => Math.max(0, dot(row, beta)));
  // standardized coefficients = driver importance
  const coefs: { name: string; coef: number }[] = [{ name: "Trend", coef: beta[1] }];
  let ci = 2 + 2 * K;
  if (drv.price) coefs.push({ name: "Price", coef: beta[ci++] });
  if (drv.promo) coefs.push({ name: "Promotion", coef: beta[ci++] });
  return { key: "reg", label: "Driver regression", point, resid, fittedTrain, coefs, sampler: (n, rng) => residualSampler(point, resid, n, rng) };
}

function ridgeFit(X: number[][], y: number[], lambda: number): number[] | null {
  const p = X[0].length;
  const A: number[][] = range(p).map(() => new Array(p).fill(0));
  const b = new Array(p).fill(0);
  for (let a = 0; a < p; a++) {
    for (let c = 0; c < p; c++) { let s = 0; for (let r = 0; r < X.length; r++) s += X[r][a] * X[r][c]; A[a][c] = s; }
    let sb = 0; for (let r = 0; r < X.length; r++) sb += X[r][a] * y[r]; b[a] = sb;
  }
  for (let a = 1; a < p; a++) A[a][a] += lambda;
  return solve(A, b);
}

/* ---------------- samplers (season-demand totals) ---------------- */
function residualSampler(point: number[], resid: number[], nSamples: number, rng: Rng): number[] {
  const out = new Array<number>(nSamples); const R = resid.length;
  for (let s = 0; s < nSamples; s++) { let tot = 0; for (let k = 0; k < point.length; k++) { const e = R ? resid[(rng() * R) | 0] : 0; tot += Math.max(0, point[k] + e); } out[s] = tot; }
  out.sort((a, b) => a - b); return out;
}
function empiricalSampler(ytrain: number[], h: number, nSamples: number, rng: Rng): number[] {
  const out = new Array<number>(nSamples); const N = ytrain.length;
  for (let s = 0; s < nSamples; s++) { let tot = 0; for (let k = 0; k < h; k++) tot += ytrain[(rng() * N) | 0]; out[s] = tot; }
  out.sort((a, b) => a - b); return out;
}

/* ---------------- model registry run at a given split ---------------- */
const K_OF = (m: number) => Math.min(3, Math.max(1, Math.floor(m / 2)));
function runModels(series: number[], ntrain: number, m: number, h: number, drv: Drivers): ModelRun[] {
  const ytrain = series.slice(0, ntrain);
  const K = K_OF(m), lambda = 1.0;
  const models: (ModelRun | null)[] = [];
  const sn = snaiveModel(ytrain, m, h); models.push(sn);
  const ets = etsModel(ytrain, m, h); models.push(ets);
  models.push(etsLogModel(ytrain, m, h));
  const croston = crostonModel(ytrain, h); models.push(croston);
  const reg = regModel(series, ntrain, m, h, drv, K, lambda); models.push(reg);
  if (ets && reg) {
    const point = ets.point.map((v, k) => 0.5 * (v + reg.point[k]));
    const resid: number[] = [];
    const ef = ets.fittedTrain!, rf = reg.fittedTrain!;
    for (let t = 0; t < ntrain; t++) { const e = ef[t], r = rf[t]; if (e == null || r == null) continue; const cf = 0.5 * (e + r); resid.push(series[t] - cf); }
    models.push({ key: "combo", label: "Combination (ETS+Reg)", point, resid, sampler: (n, rng) => residualSampler(point, resid, n, rng) });
  }
  return models.filter((x): x is ModelRun => x != null);
}

/* ---------------- metrics + rolling-origin cross-validation ---------------- */
function chooseOrigins(n: number, m: number, h: number, folds = 6): number[] {
  const minTrain = 2 * m, last = n - h;
  if (last < minTrain) return [];
  const out: number[] = [];
  if (last === minTrain) return [minTrain];
  const step = (last - minTrain) / (folds - 1);
  for (let i = 0; i < folds; i++) out.push(Math.round(minTrain + i * step));
  return Array.from(new Set(out));
}

function crossValidate(series: number[], m: number, h: number, drv: Drivers): Map<string, Candidate> {
  const origins = chooseOrigins(series.length, m, h);
  const acc = new Map<string, { label: string; sumAbs: number; sumAct: number; sumSigned: number; maseAcc: number; folds: number }>();
  for (const t of origins) {
    const actual = series.slice(t, t + h);
    const actSum = actual.reduce((a, b) => a + b, 0);
    // seasonal-naive in-sample scale for MASE (on this fold's training data)
    let scaleSum = 0, scaleCnt = 0;
    for (let i = m; i < t; i++) { scaleSum += Math.abs(series[i] - series[i - m]); scaleCnt++; }
    const scale = scaleCnt ? scaleSum / scaleCnt : 1;
    const runs = runModels(series, t, m, h, drv);
    for (const r of runs) {
      let absErr = 0, signed = 0;
      for (let k = 0; k < h; k++) { const e = r.point[k] - actual[k]; absErr += Math.abs(e); signed += e; }
      const mae = absErr / h;
      const cur = acc.get(r.key) ?? { label: r.label, sumAbs: 0, sumAct: 0, sumSigned: 0, maseAcc: 0, folds: 0 };
      cur.sumAbs += absErr; cur.sumAct += actSum; cur.sumSigned += signed;
      cur.maseAcc += mae / (scale || 1); cur.folds++;
      acc.set(r.key, cur);
    }
  }
  const out = new Map<string, Candidate>();
  for (const [key, a] of acc) out.set(key, { key, label: a.label, mase: a.folds ? a.maseAcc / a.folds : Infinity, wape: a.sumAct ? a.sumAbs / a.sumAct : Infinity, bias: a.sumAct ? a.sumSigned / a.sumAct : 0, ran: true });
  return out;
}

/* ---------------- top-level ---------------- */
export function runForecast(series: number[], m: number, h: number, opts?: { drivers?: Drivers; seed?: number; nSamples?: number }): ForecastResult {
  const drv = opts?.drivers ?? {};
  const seed = opts?.seed ?? 7;
  const nSamples = opts?.nSamples ?? 5000;
  const classification = classifyDemand(series);
  const cv = crossValidate(series, m, h, drv);
  const full = runModels(series, series.length, m, h, drv);

  // selection: lowest CV MASE among models that both ran full & were scored.
  let selectedKey = "";
  let best = Infinity;
  for (const r of full) { const c = cv.get(r.key); if (c && isFinite(c.mase) && c.mase < best) { best = c.mase; selectedKey = r.key; } }
  if (!selectedKey) selectedKey = full.find((r) => r.key === "ets")?.key ?? full.find((r) => r.key === "snaive")?.key ?? full[0]?.key ?? "";
  // Intermittent/lumpy demand: point-accuracy metrics (MASE/WAPE) reward predicting
  // ~0 on the many zero periods — operationally useless (you'd stock out on every lump).
  // Croston/SBA is the appropriate estimator, so select it by domain rule, not by MASE.
  if ((classification.label === "lumpy" || classification.label === "intermittent") && full.some((r) => r.key === "croston")) {
    selectedKey = "croston";
  }

  const chosen = full.find((r) => r.key === selectedKey) ?? full[0];
  const rng = makeRng(seed);
  const samples = chosen.sampler(nSamples, rng);
  const bands = perStepBandsFor(chosen, series, makeRng(seed + 1), 3000);

  const regFull = full.find((r) => r.key === "reg");
  const candidates = full.map((r) => cv.get(r.key) ?? { key: r.key, label: r.label, mase: Infinity, wape: Infinity, bias: 0, ran: true })
    .sort((a, b) => a.mase - b.mase);
  const selCand = cv.get(selectedKey);
  const snaive = cv.get("snaive");
  const skillVsNaive = selCand && snaive && isFinite(selCand.wape) && snaive.wape > 0 ? Math.max(-1, 1 - selCand.wape / snaive.wape) : 0;

  return {
    classification, candidates, selectedKey, selectedLabel: chosen.label,
    point: chosen.point, resid: chosen.resid, samples, bands,
    drivers: regFull?.coefs ?? [],
    skillVsNaive,
    accuracy: { mase: selCand?.mase ?? NaN, wape: selCand?.wape ?? NaN, bias: selCand?.bias ?? NaN },
    hwParams: chosen.fit ? { alpha: chosen.fit.alpha, beta: chosen.fit.beta, gamma: chosen.fit.gamma } : null,
  };
}

function perStepBandsFor(chosen: ModelRun, series: number[], rng: Rng, n: number): Band[] {
  const useResid = chosen.resid.length > 0;
  const cols: number[][] = chosen.point.map(() => []);
  for (let s = 0; s < n; s++)
    for (let k = 0; k < chosen.point.length; k++) {
      const v = useResid ? Math.max(0, chosen.point[k] + chosen.resid[(rng() * chosen.resid.length) | 0]) : series[(rng() * series.length) | 0];
      cols[k].push(v);
    }
  return cols.map((c) => { c.sort((a, b) => a - b); return { p10: quantile(c, 0.1), p50: quantile(c, 0.5), p90: quantile(c, 0.9) }; });
}
