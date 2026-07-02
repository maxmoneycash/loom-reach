/* Headless validation of the forecasting brain. Run: npx tsx scripts/forecast.test.ts */
import { runForecast, classifyDemand, type Drivers } from "../lib/forecast";
import { makeRng, quantile, newsvendor, riskAt, allocateSizes } from "../lib/engine";
import { REAL, loadApparel, parseCSV } from "../lib/data";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) pass++; else fail++; console.log((cond ? "PASS " : "FAIL ") + name + (extra ? "  " + extra : "")); };

const M = 12;

/* ---- 1. classification ---- */
const smooth = Array.from({ length: 48 }, (_, i) => 100 + 20 * Math.sin((2 * Math.PI * i) / 12) + (i % 3));
ok("classify: smooth series → smooth", classifyDemand(smooth).label === "smooth", classifyDemand(smooth).label);

const rngI = makeRng(3);
const intermittent = Array.from({ length: 48 }, () => (rngI() < 0.35 ? Math.round(rngI() * 40) : 0));
ok("classify: sparse series → intermittent/lumpy", ["intermittent", "lumpy"].includes(classifyDemand(intermittent).label), classifyDemand(intermittent).label);

/* ---- 2. real champagne: seasonal models beat naive ---- */
const champ = REAL.champagne.vals;
const rc = runForecast(champ, M, 12, { seed: 7 });
ok("champagne: a model is selected", !!rc.selectedKey, rc.selectedKey + " (" + rc.selectedLabel + ")");
ok("champagne: selected is at least as accurate as seasonal-naive", rc.skillVsNaive >= -1e-9, "skill=" + (rc.skillVsNaive * 100).toFixed(1) + "%");
ok("champagne: samples sorted & positive", rc.samples.length === 5000 && rc.samples[0] >= 0 && rc.samples[0] <= rc.samples[4999]);
ok("champagne: bands monotone p10<=p50<=p90", rc.bands.every((b) => b.p10 <= b.p50 + 1e-6 && b.p50 <= b.p90 + 1e-6));
ok("champagne: point forecast has 12 steps, all finite", rc.point.length === 12 && rc.point.every((v) => isFinite(v) && v >= 0));
ok("champagne: candidates include all models", ["snaive", "ets", "etslog", "croston", "reg", "combo"].every((k) => rc.candidates.some((c) => c.key === k)), rc.candidates.map((c) => c.key + ":" + c.mase.toFixed(2)).join(" "));

/* ---- 3. driver regression recovers a promo lift ---- */
const n = 48;
const promoMonths = new Set([5, 14, 22, 33, 41]); // IRREGULAR (not lag-12 aligned), so seasonal-naive can't capture it
const promo: number[] = [], price: number[] = [], driven: number[] = [];
const rngD = makeRng(9);
for (let i = 0; i < n; i++) {
  const isPromo = promoMonths.has(i) ? 1 : 0;
  promo.push(isPromo);
  price.push(50);
  const base = 200 + 60 * Math.sin((2 * Math.PI * i) / 12);
  const lift = isPromo ? 140 : 0;              // strong, learnable promo effect
  driven.push(Math.max(0, Math.round(base + lift + (rngD() - 0.5) * 20)));
}
const drivers: Drivers = { price, promo };
const rd = runForecast(driven, M, 12, { seed: 7, drivers });
const promoCoef = rd.drivers.find((d) => d.name === "Promotion")?.coef ?? 0;
ok("drivers: promo coefficient is positive & material", promoCoef > 10, "promoCoef=" + promoCoef.toFixed(1));
const regMase = rd.candidates.find((c) => c.key === "reg")?.mase ?? Infinity;
const snMase = rd.candidates.find((c) => c.key === "snaive")?.mase ?? Infinity;
ok("drivers: regression beats seasonal-naive on driven data (MASE)", regMase < snMase, "reg=" + regMase.toFixed(2) + " snaive=" + snMase.toFixed(2));

/* ---- 3b. the default demo (apparel, structured demand) genuinely beats naive ---- */
const fj = loadApparel().find((x) => x.id === "AN-FJ")!;
const rfj = runForecast(fj.series, M, 12, { seed: 7 });
ok("apparel Field Jacket: selected beats seasonal-naive (skill>0)", rfj.skillVsNaive > 0, "skill=" + (rfj.skillVsNaive * 100).toFixed(1) + "% sel=" + rfj.selectedKey);

/* ---- 4. intermittent series routes to Croston ---- */
const rngL = makeRng(5);
const lumpy: number[] = [];
for (let i = 0; i < 48; i++) lumpy.push(rngL() < 0.13 ? 20 + Math.round(rngL() * 130) : 0); // very sparse → Croston territory
const rl = runForecast(lumpy, M, 12, { seed: 7 });
ok("intermittent: Croston selected (or tied-best)", rl.selectedKey === "croston", "selected=" + rl.selectedKey + " class=" + rl.classification.label);

/* ---- 5. selected model's samples drive a sane newsvendor Q* ---- */
const nv = newsvendor({ price: 100, unitCost: 40, salvage: 12 }); // CR≈0.638
const Qstar = Math.round(quantile(rc.samples, nv.criticalRatio));
const median = quantile(rc.samples, 0.5);
ok("newsvendor: Q* above median when CR>0.5", Qstar >= median, "Q*=" + Qstar + " median=" + Math.round(median));
ok("newsvendor: Q* within plausible band", Qstar > quantile(rc.samples, 0.4) && Qstar < quantile(rc.samples, 0.95), "Q*=" + Qstar);

/* ---- 6. accuracy metrics finite for the winner ---- */
ok("accuracy: selected model has finite MASE & WAPE", isFinite(rc.accuracy.mase) && isFinite(rc.accuracy.wape),
   "MASE=" + rc.accuracy.mase.toFixed(2) + " WAPE=" + (rc.accuracy.wape * 100).toFixed(1) + "%");

/* ---- 7. CSV parser: real-world shapes ---- */
const p1 = parseCSV("sku,date,units\nTEE,2024-01,100\nTEE,2024-02,120\nJKT,2024-01,40\nJKT,2024-02,55");
ok("csv: monthly sku/date/units → 2 SKUs", p1.items.length === 2 && p1.error === null, p1.items.map((i) => i.nm).join(","));
ok("csv: TEE series [100,120]", (() => { const t = p1.items.find((i) => i.nm === "TEE"); return !!t && t.series[0] === 100 && t.series[1] === 120; })());

const daily = ["sku,date,units"];
for (let d = 1; d <= 28; d++) daily.push(`A,2024-01-${String(d).padStart(2, "0")},2`);
for (let d = 1; d <= 28; d++) daily.push(`A,2024-02-${String(d).padStart(2, "0")},3`);
const p2 = parseCSV(daily.join("\n"));
ok("csv: daily rows aggregate to months [56,84]", (() => { const a = p2.items[0]; return !!a && a.series.length === 2 && a.series[0] === 56 && a.series[1] === 84; })(),
   p2.items[0]?.series.join(",") + " | " + p2.warnings.join(" / "));
ok("csv: aggregation warning emitted", p2.warnings.some((w) => /aggregated/i.test(w)));

const p3 = parseCSV("date;units\n2024-01;10\n2024-03;30");
ok("csv: semicolon delimiter + gap fill → [10,0,30]", (() => { const a = p3.items[0]; return !!a && a.series.join(",") === "10,0,30"; })(), p3.items[0]?.series.join(","));
ok("csv: gap warning emitted", p3.warnings.some((w) => /missing month/i.test(w)));

const p4 = parseCSV("Mar 2024,5\nApr 2024,7");
ok("csv: 'Mar 2024' month names parse", (() => { const a = p4.items[0]; return !!a && a.series.length === 2 && a.labels[0] === "2024-03"; })(), p4.items[0]?.labels.join(","));

const p5 = parseCSV("hello\nworld");
ok("csv: garbage → clean error, no throw", p5.error !== null && p5.items.length === 0, p5.error ?? "");

const p6 = parseCSV("10\n20\n30\n40");
ok("csv: bare single column still works", p6.items.length === 1 && p6.items[0].series.length === 4);

/* ---- 8. risk metrics ---- */
const sampl = [80, 90, 100, 110, 120];               // tiny known distribution
const rk = riskAt(100, sampl, 60, 30);
ok("risk: P(stockout) = 2/5 at Q=100", Math.abs(rk.pStockout - 0.4) < 1e-9, rk.pStockout.toFixed(2));
ok("risk: exp leftover = (20+10)/5 = 6", Math.abs(rk.expLeftover - 6) < 1e-9, String(rk.expLeftover));
ok("risk: exp short = (10+20)/5 = 6", Math.abs(rk.expShort - 6) < 1e-9, String(rk.expShort));
ok("risk: exp cost = 30*6 + 60*6 = 540", Math.abs(rk.expCost - 540) < 1e-9, String(rk.expCost));
ok("risk: fill rate = 1 - 6/100 = 0.94", Math.abs(rk.fillRate - 0.94) < 1e-9, rk.fillRate.toFixed(3));
ok("risk: monotone — higher Q lowers stockout risk", riskAt(115, sampl, 60, 30).pStockout < rk.pStockout);

/* ---- 9. size allocation (largest remainder) ---- */
const alloc = allocateSizes(1000, [6, 20, 30, 25, 14, 5]);
ok("sizes: sums exactly to total", alloc.reduce((a, b) => a + b, 0) === 1000, alloc.join(","));
ok("sizes: proportions respected (M is largest)", alloc[2] === Math.max(...alloc));
ok("sizes: zero weights get zero", allocateSizes(100, [0, 1, 0]).join(",") === "0,100,0");
ok("sizes: awkward remainder still exact", allocateSizes(101, [1, 1, 1]).reduce((a, b) => a + b, 0) === 101, allocateSizes(101, [1, 1, 1]).join(","));
ok("sizes: zero total → zeros", allocateSizes(0, [1, 2]).join(",") === "0,0");

/* ---- 10. expanded catalog ---- */
const cat = loadApparel();
ok("catalog: 10 SKUs", cat.length === 10, cat.map((c) => c.id).join(","));
ok("catalog: all have 48 months + drivers", cat.every((c) => c.series.length === 48 && !!c.drivers));

console.log("\n--- champagne leaderboard (by MASE) ---");
rc.candidates.forEach((c) => console.log(`  ${c.key.padEnd(8)} MASE ${c.mase.toFixed(3)}  WAPE ${(c.wape * 100).toFixed(1)}%  bias ${(c.bias * 100).toFixed(1)}%`));
console.log(`selected: ${rc.selectedLabel} · skill vs naive ${(rc.skillVsNaive * 100).toFixed(1)}% · class ${rc.classification.label}`);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
