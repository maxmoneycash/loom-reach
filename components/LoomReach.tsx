"use client";

import { useEffect, useMemo, useRef, useState, useCallback, type CSSProperties } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import NumberFlow from "@number-flow/react";
import { Drawer } from "vaul";
import {
  Upload, TriangleAlert, Download, RotateCcw, ChevronLeft,
  ClipboardList, Database, BookOpen, Layers, ShoppingBag, ArrowUpRight, Shield, Shirt, Plus,
} from "lucide-react";
import { newsvendor, quantile, avg, expectedCost, realizedCost, riskAt, allocateSizes, makeRng, type Econ } from "@/lib/engine";
import { runForecast, type ForecastResult } from "@/lib/forecast";
import { loadApparel, loadReal, loadDefense, loadDtc, parseCSV, type SkuItem } from "@/lib/data";
import { loadState, saveState, clearState } from "@/lib/persist";
import { simulateQR, levelRatios } from "@/lib/quickresponse";
import { allocateCapacity } from "@/lib/capacity";

const M = 12;
type Source = "apparel" | "real" | "upload" | "defense" | "dtc";
type Tab = "plan" | "data" | "method";
interface View { tab: Tab; sku: string | null; }

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const money = (n: number) => (n < 0 ? "-" : "") + "$" + fmt(Math.abs(n));
const pct = (n: number) => (n >= 0 ? "+" : "") + (n * 100).toFixed(1) + "%";
const INT = { maximumFractionDigits: 0 } as const;
const vib = (ms: number) => { try { navigator.vibrate?.(ms); } catch { /* unsupported */ } };

interface Decision { nv: ReturnType<typeof newsvendor>; Qstar: number; QtoMean: number; meanDemand: number; expectedCostStar: number; expectedCostMean: number; }
function decide(samples: number[], econ: Econ): Decision {
  const nv = newsvendor(econ);
  const Qstar = Math.round(quantile(samples, nv.criticalRatio));
  const meanDemand = avg(samples);
  const QtoMean = Math.round(meanDemand);
  return { nv, Qstar, QtoMean, meanDemand, expectedCostStar: expectedCost(Qstar, samples, nv.Cu, nv.Co), expectedCostMean: expectedCost(QtoMean, samples, nv.Cu, nv.Co) };
}
interface Holdout { samples: number[]; actual: number; }
interface Compute { fc: ForecastResult; holdouts: Holdout[]; }

/* ---- animated sheet: fades up as it enters the viewport ---- */
function Sheet({ no, name, right, children }: { no: string; name: string; right?: string; children: React.ReactNode }) {
  const rm = useReducedMotion();
  return (
    <motion.section
      className="sheet"
      initial={rm ? false : { opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px 0px" }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="tblock"><span className="no">{no}</span><span className="sig">{name}</span>{right && <span className="r">{right}</span>}</div>
      {children}
    </motion.section>
  );
}

/* =============================== charts =============================== */

function ForecastChart({ it, fc, horizon }: { it: SkuItem; fc: ForecastResult; horizon: number }) {
  const hist = it.series, H = horizon, n = hist.length, bands = fc.bands;
  const [si, setSi] = useState<number | null>(null);
  const W = 720, Ht = 250, padL = 46, padR = 14, padT = 12, padB = 26;
  const maxV = Math.max(...hist.concat(bands.map((b) => b.p90))) * 1.06 || 1;
  const minV = 0, totalX = n + H;
  const X = (i: number) => padL + (i / (totalX - 1)) * (W - padL - padR);
  const Y = (v: number) => padT + (1 - (v - minV) / (maxV - minV)) * (Ht - padT - padB);
  const histPath = hist.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1)).join(" ");
  const up = bands.map((b, k) => [X(n + k), Y(b.p90)] as const);
  const lo = bands.map((b, k) => [X(n + k), Y(b.p10)] as const).reverse();
  const bandPts = up.concat(lo).map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  const medPath = "M" + X(n - 1).toFixed(1) + " " + Y(hist[n - 1]).toFixed(1) + " " + bands.map((b, k) => "L" + X(n + k).toFixed(1) + " " + Y(b.p50).toFixed(1)).join(" ");
  const sep = X(n - 0.5);
  const gridV = [0, 1, 2, 3, 4].map((g) => minV + (g / 4) * (maxV - minV));
  const labIdx = [0, Math.floor(n / 2), n - 1];

  const idxFrom = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width) return null;
    const vx = ((e.clientX - r.left) / r.width) * W;
    return Math.min(totalX - 1, Math.max(0, Math.round(((vx - padL) / (W - padL - padR)) * (totalX - 1))));
  };
  const val = si == null ? null : si < n
    ? { lab: it.labels[si] ?? "t" + si, main: fmt(hist[si]), sub: "actual", y: Y(hist[si]) }
    : { lab: "+" + (si - n + 1) + " mo", main: fmt(bands[si - n].p50), sub: fmt(bands[si - n].p10) + "–" + fmt(bands[si - n].p90), y: Y(bands[si - n].p50) };

  return (
    <div className="chartwrap">
      <svg className="chart scrub-svg" viewBox={`0 0 ${W} ${Ht}`} role="img"
        aria-label={`Demand history and ${H}-month forecast for ${it.nm}. Press and drag to read values.`}
        onPointerDown={(e) => setSi(idxFrom(e))}
        onPointerMove={(e) => { if (e.buttons & 1 || e.pointerType === "mouse") setSi(idxFrom(e)); }}
        onPointerLeave={() => setSi(null)}
        onPointerUp={(e) => { if (e.pointerType !== "mouse") setSi(null); }}>
        {gridV.map((v, i) => (<g key={i}><line x1={padL} y1={Y(v)} x2={W - padR} y2={Y(v)} stroke="var(--line-2)" /><text x={padL - 7} y={Y(v) + 3} textAnchor="end" fontSize={9} fill="var(--faint)" fontFamily="var(--mono)">{fmt(v)}</text></g>))}
        <line x1={sep} y1={padT} x2={sep} y2={Ht - padB} stroke="var(--line)" strokeDasharray="2 3" />
        <polygon points={bandPts} fill="var(--blue)" fillOpacity={0.13} stroke="none" />
        <path d={histPath} fill="none" stroke="var(--ink)" strokeWidth={1.8} />
        <path className="fpath" style={{ ["--len" as string]: 1400 } as CSSProperties} d={medPath} fill="none" stroke="var(--signal)" strokeWidth={2.1} strokeLinecap="round" />
        {labIdx.map((i, k) => it.labels[i] ? <text key={k} x={X(i)} y={Ht - 7} textAnchor="middle" fontSize={9} fill="var(--faint)" fontFamily="var(--mono)">{it.labels[i]}</text> : null)}
        <text x={X(n + H - 1)} y={Ht - 7} textAnchor="end" fontSize={9} fill="var(--signal-ink)" fontFamily="var(--mono)">+{H}mo</text>
        {si != null && val && (
          <g>
            <line x1={X(si)} y1={padT} x2={X(si)} y2={Ht - padB} stroke="var(--ink)" strokeWidth={1} strokeDasharray="2 2" opacity={0.65} />
            <circle cx={X(si)} cy={val.y} r={4.5} fill={si < n ? "var(--ink)" : "var(--signal)"} stroke="var(--surface)" strokeWidth={1.5} />
          </g>
        )}
      </svg>
      {si != null && val && (
        <div className="scrubtip" style={{ left: Math.min(88, Math.max(12, (X(si) / W) * 100)) + "%" }}>
          <div className="tl">{val.lab}</div>
          <div className="tv">{val.main} u</div>
          <div className="ts">{val.sub}</div>
        </div>
      )}
      <div className="legend">
        <span><i style={{ background: "var(--ink)" }} />actual</span>
        <span><i style={{ background: "var(--signal)" }} />forecast · {fc.selectedLabel}</span>
        <span><i style={{ background: "var(--blue)", opacity: 0.4 }} />P10–P90 · press to scrub</span>
      </div>
    </div>
  );
}

function CostCurveChart({ samples, plan }: { samples: number[]; plan: Decision }) {
  const nv = plan.nv, lo = quantile(samples, 0.01), hi = quantile(samples, 0.99), STEPS = 60;
  const [si, setSi] = useState<number | null>(null);
  const qs: number[] = [], cs: number[] = [];
  for (let i = 0; i <= STEPS; i++) { const Q = lo + (i / STEPS) * (hi - lo); qs.push(Q); cs.push(expectedCost(Q, samples, nv.Cu, nv.Co)); }
  const W = 720, Ht = 200, padL = 52, padR = 14, padT = 12, padB = 26;
  const maxC = Math.max(...cs) * 1.05 || 1, minC = 0;
  const X = (q: number) => padL + ((q - lo) / (hi - lo || 1)) * (W - padL - padR);
  const Y = (c: number) => padT + (1 - (c - minC) / (maxC - minC)) * (Ht - padT - padB);
  const path = qs.map((q, i) => (i ? "L" : "M") + X(q).toFixed(1) + " " + Y(cs[i]).toFixed(1)).join(" ");
  const gridC = [0, 1, 2, 3].map((g) => minC + (g / 3) * (maxC - minC));
  const idxFrom = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width) return null;
    const vx = ((e.clientX - r.left) / r.width) * W;
    return Math.min(STEPS, Math.max(0, Math.round(((vx - padL) / (W - padL - padR)) * STEPS)));
  };
  const mark = (Q: number, col: string, lab: string, dash: boolean, key: string) => (
    <g key={key}><line x1={X(Q)} y1={padT} x2={X(Q)} y2={Ht - padB} stroke={col} strokeWidth={1.4} strokeDasharray={dash ? "4 3" : undefined} /><text x={X(Q)} y={padT + 9} textAnchor="middle" fontSize={9} fill={col} fontFamily="var(--mono)">{lab}</text></g>
  );
  return (
    <div className="chartwrap">
      <p className="ph">Expected cost of each quantity over 5,000 demand draws. The minimum sits exactly at Q* — press the curve to explore.</p>
      <svg className="chart scrub-svg" viewBox={`0 0 ${W} ${Ht}`} role="img"
        aria-label={`Expected cost by production quantity; minimum at ${fmt(plan.Qstar)} units. Press and drag to read values.`}
        onPointerDown={(e) => setSi(idxFrom(e))}
        onPointerMove={(e) => { if (e.buttons & 1 || e.pointerType === "mouse") setSi(idxFrom(e)); }}
        onPointerLeave={() => setSi(null)}
        onPointerUp={(e) => { if (e.pointerType !== "mouse") setSi(null); }}>
        {gridC.map((c, i) => (<g key={i}><line x1={padL} y1={Y(c)} x2={W - padR} y2={Y(c)} stroke="var(--line-2)" /><text x={padL - 7} y={Y(c) + 3} textAnchor="end" fontSize={9} fill="var(--faint)" fontFamily="var(--mono)">{money(c)}</text></g>))}
        <path d={path} fill="none" stroke="var(--blue)" strokeWidth={2} />
        {mark(plan.QtoMean, "var(--faint)", "mean", true, "m")}
        {mark(plan.Qstar, "var(--signal)", "Q* " + fmt(plan.Qstar), false, "q")}
        <circle cx={X(plan.Qstar)} cy={Y(plan.expectedCostStar)} r={4} fill="var(--signal)" />
        {si != null && (
          <g>
            <line x1={X(qs[si])} y1={padT} x2={X(qs[si])} y2={Ht - padB} stroke="var(--ink)" strokeWidth={1} strokeDasharray="2 2" opacity={0.65} />
            <circle cx={X(qs[si])} cy={Y(cs[si])} r={4.5} fill="var(--ink)" stroke="var(--surface)" strokeWidth={1.5} />
          </g>
        )}
      </svg>
      {si != null && (
        <div className="scrubtip" style={{ left: Math.min(88, Math.max(12, (X(qs[si]) / W) * 100)) + "%" }}>
          <div className="tl">make {fmt(qs[si])} u</div>
          <div className="tv">{money(cs[si])}</div>
          <div className="ts">expected cost</div>
        </div>
      )}
    </div>
  );
}

function Seasonality({ it }: { it: SkuItem }) {
  const start = (() => { const m = it.labels[0]?.match(/^(\d{4})-(\d{2})/); return m ? +m[2] - 1 : 0; })();
  const sums = Array(12).fill(0), cnts = Array(12).fill(0);
  it.series.forEach((v, i) => { const mo = (start + i) % 12; sums[mo] += v; cnts[mo]++; });
  const overall = avg(it.series) || 1;
  const idx = sums.map((s, m) => (cnts[m] ? s / cnts[m] / overall : 0));
  const maxI = Math.max(1.6, ...idx) * 1.08;
  const C = 110, R = 80;
  const pt = (m: number, v: number): [number, number] => {
    const a = -Math.PI / 2 + (m * 2 * Math.PI) / 12;
    const rr = (Math.max(0, v) / maxI) * R;
    return [C + rr * Math.cos(a), C + rr * Math.sin(a)];
  };
  const poly = idx.map((v, m) => pt(m, v).map((x) => x.toFixed(1)).join(",")).join(" ");
  const peak = idx.indexOf(Math.max(...idx));
  const MO = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  return (
    <svg className="chart" viewBox="0 0 220 220" role="img"
      aria-label={`Seasonality fingerprint for ${it.nm}: demand peaks in month ${peak + 1}`}>
      {[0.5, 1.5].map((v) => <circle key={v} cx={C} cy={C} r={(v / maxI) * R} fill="none" stroke="var(--line-2)" strokeDasharray="2 3" />)}
      <circle cx={C} cy={C} r={(1 / maxI) * R} fill="none" stroke="var(--line)" />
      {MO.map((_, m) => { const [x, y] = pt(m, maxI); return <line key={m} x1={C} y1={C} x2={x} y2={y} stroke="var(--line-2)" />; })}
      <polygon points={poly} fill="var(--signal)" fillOpacity={0.14} stroke="var(--signal)" strokeWidth={1.6} strokeLinejoin="round" />
      {idx.map((v, m) => { const [x, y] = pt(m, v); return <circle key={m} cx={x} cy={y} r={m === peak ? 3.4 : 2} fill={m === peak ? "var(--signal)" : "var(--ink)"} />; })}
      {MO.map((lab, m) => { const a = -Math.PI / 2 + (m * 2 * Math.PI) / 12; const x = C + (R + 13) * Math.cos(a), y = C + (R + 13) * Math.sin(a) + 3;
        return <text key={m} x={x} y={y} textAnchor="middle" fontSize={9.5} fill={m === peak ? "var(--signal-ink)" : "var(--faint)"} fontFamily="var(--mono)" fontWeight={m === peak ? 600 : 400}>{lab}</text>; })}
      <text x={C} y={C + (1 / maxI) * R - 5} textAnchor="middle" fontSize={7.5} fill="var(--faint)" fontFamily="var(--mono)">avg</text>
    </svg>
  );
}

/* =============================== sheets =============================== */

const CLASS_BLURB: Record<string, string> = {
  smooth: "regular, stable demand — classical time-series models fit well.",
  erratic: "regular timing but volatile size — lean on the distribution, not the point.",
  intermittent: "many zero periods — point accuracy misleads, so Croston/SBA is used.",
  lumpy: "sporadic and volatile — hardest case; Croston/SBA + a wide interval.",
  new: "short history — limited model choice until more data accrues.",
};

/* the critical ratio as a real instrument dial */
function RatioGauge({ cr }: { cr: number }) {
  const rm = useReducedMotion();
  const angle = -90 + cr * 180;
  const arc = (a0: number, a1: number, r: number) => {
    const p = (a: number) => [100 + r * Math.cos(((a - 90) * Math.PI) / 180), 104 + r * Math.sin(((a - 90) * Math.PI) / 180)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  };
  return (
    <div className="gaugewrap">
      <svg width="200" height="118" viewBox="0 0 200 118" role="img" aria-label={`Urgency dial at ${(cr * 100).toFixed(0)} percent toward avoiding stockouts`}>
        <path d={arc(-90, 90, 74)} fill="none" stroke="var(--line)" strokeWidth={13} strokeLinecap="round" />
        <path d={arc(-90, -90 + cr * 180, 74)} fill="none" stroke="url(#gg)" strokeWidth={13} strokeLinecap="round" />
        <defs><linearGradient id="gg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--blue)" /><stop offset="100%" stopColor="var(--signal)" />
        </linearGradient></defs>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const a = ((-90 + t * 180 - 90) * Math.PI) / 180;
          return <line key={t} x1={100 + 60 * Math.cos(a)} y1={104 + 60 * Math.sin(a)} x2={100 + 66 * Math.cos(a)} y2={104 + 66 * Math.sin(a)} stroke="var(--faint)" strokeWidth={t === 0.5 ? 2 : 1} />;
        })}
        <motion.g initial={rm ? false : { rotate: -90 }} animate={{ rotate: angle }}
          transition={rm ? { duration: 0 } : { type: "spring", stiffness: 60, damping: 12 }}
          style={{ originX: "100px", originY: "104px" }}>
          <line x1={100} y1={104} x2={100} y2={48} stroke="var(--ink)" strokeWidth={3} strokeLinecap="round" />
          <circle cx={100} cy={104} r={7} fill="var(--ink)" />
          <circle cx={100} cy={104} r={2.6} fill="var(--surface)" />
        </motion.g>
        <text x={22} y={114} fontSize={8.5} fill="var(--faint)" fontFamily="var(--mono)">CUT LESS</text>
        <text x={178} y={114} fontSize={8.5} fill="var(--signal-ink)" fontFamily="var(--mono)" textAnchor="end">CUT MORE</text>
      </svg>
      <span className="gauge-cap">how much the math leans toward extra units</span>
    </div>
  );
}

function DecisionSheet({ it, plan, horizon, samples }: { it: SkuItem; plan: Decision; horizon: number; samples: number[] }) {
  const nv = plan.nv, save = plan.expectedCostMean - plan.expectedCostStar, buffer = plan.Qstar - plan.QtoMean;
  const risk = riskAt(plan.Qstar, samples, nv.Cu, nv.Co);
  const ratio = nv.Co > 0 ? nv.Cu / nv.Co : Infinity;
  return (
    <Sheet no="01" name="How many to cut" right={it.nm}>
      <div className="hero">
        <div className="cut">
          <div className="lab">for the next {horizon}-month season</div>
          <div className="num"><NumberFlow value={plan.Qstar} format={INT} /> <small>units</small></div>
          <p className="answer">
            That&apos;s the typical forecast <b>{buffer >= 0 ? "plus" : "minus"} {fmt(Math.abs(buffer))} units</b> — because for this product,
            {ratio >= 1
              ? <>a missed sale hurts <b>{isFinite(ratio) ? ratio.toFixed(1) + "×" : "far"} more</b> than an unsold unit.</>
              : <>an unsold unit hurts <b>{(1 / Math.max(ratio, 1e-9)).toFixed(1)}× more</b> than a missed sale.</>}
            Expect to serve <span className="good">{Math.round(risk.fillRate * 100)}%</span> of demand and keep <span className="good">~{money(save)}</span> that a plain forecast would lose.
          </p>
          <div className="chips">
            <div className="chip fill"><div className="cv">{(risk.fillRate * 100).toFixed(1)}%</div><div className="ck">demand served</div></div>
            <div className="chip risk"><div className="cv">{(risk.pStockout * 100).toFixed(0)}%</div><div className="ck">chance you sell out</div></div>
            <div className="chip left"><div className="cv">{fmt(risk.expLeftover)}</div><div className="ck">typical leftover</div></div>
          </div>
        </div>
        <RatioGauge cr={nv.criticalRatio} />
      </div>
      <details className="how">
        <summary>How this number is computed</summary>
        <div className="howbody">
          This is the <b>newsvendor optimum</b>: Q* = F⁻¹(Cu / (Cu + Co)), where <b>Cu = ${fmt(nv.Cu)}</b> is the margin lost
          per missed sale (price − cost) and <b>Co = ${fmt(nv.Co)}</b> is the loss per unsold unit (cost − salvage).
          The dial shows the critical ratio {(nv.criticalRatio * 100).toFixed(1)}% — the service level worth paying for.
          F is the demand distribution from the winning forecast model (5,000 simulated outcomes).
        </div>
      </details>
    </Sheet>
  );
}

function BrainSheet({ fc }: { fc: ForecastResult }) {
  const c = fc.classification, skillGood = fc.skillVsNaive > 0.001;
  const missPct = isFinite(fc.accuracy.wape) ? (fc.accuracy.wape * 100).toFixed(0) : null;
  return (
    <Sheet no="03" name="How good is the forecast" right="tested on the past">
      <p className="answer">
        Five different forecasting methods competed on this product&apos;s own history. The winner — <b>{fc.selectedLabel}</b> —
        {missPct ? <> has typically been <b>~{missPct}% off</b> when tested on seasons it hadn&apos;t seen</> : <> was chosen for this demand pattern</>}
        {skillGood
          ? <>, <span className="good">{(fc.skillVsNaive * 100).toFixed(0)}% more accurate</span> than just copying last year.</>
          : <>. Honest note: on this product, simply copying last year is about as accurate — the forecast can&apos;t add much here.</>}
      </p>
      <div className="mt">Demand pattern: <b>{c.label}</b> — {CLASS_BLURB[c.label]}</div>
      <details className="how">
        <summary>The scoreboard (for the quants)</summary>
        <div className="howbody">
          <table className="lead">
            <thead><tr><th>Model</th><th>MASE</th><th>WAPE</th><th>Bias</th></tr></thead>
            <tbody>
              {fc.candidates.map((cd) => (
                <tr key={cd.key} className={cd.key === fc.selectedKey ? "sel" : ""}>
                  <td>{cd.label}{cd.key === fc.selectedKey && <span className="win">chosen</span>}</td>
                  <td>{isFinite(cd.mase) ? cd.mase.toFixed(3) : "—"}</td>
                  <td>{isFinite(cd.wape) ? (cd.wape * 100).toFixed(1) + "%" : "—"}</td>
                  <td>{isFinite(cd.bias) ? pct(cd.bias) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ margin: "10px 0 0" }}>
            Scored by rolling-origin cross-validation against a seasonal-naive benchmark. MASE &lt; 1 beats naive;
            WAPE is average % miss; bias is systematic over/under-forecasting. Pattern label from ADI {isFinite(c.adi) ? c.adi.toFixed(1) : "—"} / CV² {isFinite(c.cv2) ? c.cv2.toFixed(2) : "—"}
            (Syntetos–Boylan). Industry context: fashion SKU forecasts typically run 30–40% off; new items 50–100%.
          </p>
        </div>
      </details>
    </Sheet>
  );
}

function DriverSheet({ fc }: { fc: ForecastResult }) {
  const drivers = fc.drivers.filter((d) => isFinite(d.coef));
  const maxAbs = Math.max(1e-6, ...drivers.map((d) => Math.abs(d.coef)));
  return (
    <Sheet no="04" name="What moves demand" right="standardized effect">
      <p className="ph">What moves this SKU&apos;s sales, holding the rest fixed — learned by the driver-regression model.</p>
      <div className="drv">
        {drivers.map((d) => {
          const w = Math.min(50, (Math.abs(d.coef) / maxAbs) * 50), pos = d.coef >= 0;
          return (
            <div className="drvrow" key={d.name}>
              <span className="dn">{d.name}</span>
              <div className="drvbar"><div className="mid" /><i className={pos ? "pos" : "neg"} style={pos ? { left: "50%", width: w + "%" } : { left: 50 - w + "%", width: w + "%" }} /></div>
              <span className="drvval">{d.coef >= 0 ? "+" : ""}{d.coef.toFixed(1)}</span>
            </div>
          );
        })}
      </div>
      <div className="mt">Positive lifts demand — promotions and lower price push right; a negative price coefficient is price elasticity (cheaper → sells more).</div>
    </Sheet>
  );
}

function EconSheet({ it, econ, horizon, onEcon, onHorizon }: { it: SkuItem; econ: Econ; horizon: number; onEcon: (k: keyof Econ, v: number) => void; onHorizon: (v: number) => void; }) {
  const field = (k: keyof Econ, label: string, pre: string) => {
    const hi = Math.max(Math.ceil(it.econ[k] * 2.5), Math.ceil(econ[k] * 1.2), 10);
    const fill = Math.min(100, Math.max(0, (econ[k] / hi) * 100));
    return (
      <div className="f"><label htmlFor={"econ-" + k}>{label}</label><div className="inp"><span aria-hidden="true">{pre}</span>
        <input id={"econ-" + k} type="number" min={0} step={1} value={econ[k]} onChange={(e) => onEcon(k, parseFloat(e.target.value))} inputMode="decimal" autoComplete="off" /></div>
        <input className="slider" type="range" min={0} max={hi} step={1} value={econ[k]}
          style={{ ["--fill" as string]: fill + "%" } as CSSProperties}
          aria-label={label + " slider"} onChange={(e) => onEcon(k, parseFloat(e.target.value))} />
      </div>
    );
  };
  return (
    <Sheet no="05" name="The cost of being wrong" right="cost of being wrong">
      <p className="ph">These set Cu and Co — the only thing that separates the optimal quantity from a naive forecast.</p>
      <div className="econ">
        {field("price", "Retail $", "$")}
        {field("unitCost", "Unit cost", "$")}
        {field("salvage", "Salvage $", "$")}
        <div className="f"><label htmlFor="econ-horizon">Season (mo)</label><div className="inp"><span></span>
          <input id="econ-horizon" type="number" min={1} max={Math.max(1, it.series.length - 2 * M)} step={1} value={horizon} onChange={(e) => onHorizon(parseInt(e.target.value) || 12)} inputMode="numeric" autoComplete="off" /></div></div>
      </div>
      <div className="mt">Cu = price − unit cost (margin lost on a stockout) · Co = unit cost − salvage (lost on overstock).{it.real ? "" : " Defaults reflect typical apparel economics; change them to your numbers."}</div>
    </Sheet>
  );
}

function RiskSheet({ samples, plan }: { samples: number[]; plan: Decision }) {
  const rm = useReducedMotion();
  const [Q, setQ] = useState(plan.Qstar);
  const [run, setRun] = useState(0);                     // season-drop simulation run counter
  const nv = plan.nv;
  const lo = quantile(samples, 0.005), hi = quantile(samples, 0.995);
  const clampQ = (q: number) => Math.round(Math.min(hi, Math.max(lo, q)));
  const r = riskAt(Q, samples, nv.Cu, nv.Co);
  const rStar = riskAt(plan.Qstar, samples, nv.Cu, nv.Co);
  const penalty = r.expCost - rStar.expCost;
  const atOpt = Math.abs(penalty) < Math.max(1, rStar.expCost * 0.002);
  const BINS = 36;
  const counts = Array(BINS).fill(0);
  for (const d of samples) { const b = Math.min(BINS - 1, Math.max(0, Math.floor(((d - lo) / (hi - lo || 1)) * BINS))); counts[b]++; }
  const maxC = Math.max(...counts, 1);
  const W = 720, Ht = 224, padL = 10, padR = 10, padT = 44, padB = 24;
  const X = (q: number) => padL + ((q - lo) / (hi - lo || 1)) * (W - padL - padR);
  const bw = (W - padL - padR) / BINS;
  const YH = (c: number) => (c / maxC) * (Ht - padT - padB);
  const qFrom = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * W;
    return clampQ(lo + ((vx - padL) / (W - padL - padR)) * (hi - lo));
  };
  // 60 sampled seasons for the drop animation (seeded per run)
  const DROPS = 60;
  const drops = useMemo(() => {
    if (!run) return [] as { v: number; x: number; y: number; hit: boolean }[];
    const rng = makeRng(run * 7919 + 29);
    const stack = Array(BINS).fill(0);
    return Array.from({ length: DROPS }, () => {
      const v = samples[(rng() * samples.length) | 0];
      const b = Math.min(BINS - 1, Math.max(0, Math.floor(((v - lo) / (hi - lo || 1)) * BINS)));
      const y = padT - 8 - stack[b] * 7;
      stack[b]++;
      return { v, x: padL + b * bw + bw / 2 + (rng() - 0.5) * 3, y, hit: v <= Q };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, samples, lo, hi, Q]);
  const hits = drops.filter((d) => d.hit).length;
  return (
    <Sheet no="06" name="What if you cut more — or less" right="drag the orange line">
      <p className="answer">
        Every bar is a possible season. Left of the orange line: sales you make. Right: sales you miss. <b>Drag it.</b>
      </p>
      <svg className="chart risk-svg" viewBox={`0 0 ${W} ${Ht}`} role="img"
        aria-label={`Demand distribution with adjustable cut quantity, currently ${fmt(Q)} units`}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setQ(qFrom(e)); }}
        onPointerMove={(e) => { if (e.buttons & 1) setQ(qFrom(e)); }}>
        {counts.map((c, b) => {
          const x0 = padL + b * bw, covered = x0 + bw / 2 <= X(Q);
          return <rect key={b} x={x0 + 0.5} y={Ht - padB - YH(c)} width={bw - 1} height={YH(c)}
            fill={covered ? "var(--blue)" : "var(--red)"} fillOpacity={covered ? 0.35 : 0.4} />;
        })}
        <line x1={X(plan.Qstar)} y1={padT - 4} x2={X(plan.Qstar)} y2={Ht - padB} stroke="var(--ink)" strokeWidth={1.2} strokeDasharray="4 3" />
        <text x={X(plan.Qstar)} y={padT - 8} textAnchor="middle" fontSize={9} fill="var(--muted)" fontFamily="var(--mono)">Q* {fmt(plan.Qstar)}</text>
        <line x1={X(Q)} y1={padT + 4} x2={X(Q)} y2={Ht - padB} stroke="var(--signal)" strokeWidth={2.4} />
        <circle cx={X(Q)} cy={padT + 4} r={7} fill="var(--signal)" />
        <circle cx={X(Q)} cy={padT + 4} r={2.6} fill="var(--surface)" />
        <text x={padL} y={Ht - 8} fontSize={9} fill="var(--faint)" fontFamily="var(--mono)">{fmt(lo)}</text>
        <text x={W - padR} y={Ht - 8} textAnchor="end" fontSize={9} fill="var(--faint)" fontFamily="var(--mono)">{fmt(hi)}</text>
        {drops.map((d, i) => (
          <motion.circle key={run + ":" + i} r={3}
            fill={d.hit ? "var(--good)" : "var(--red)"} stroke="var(--surface)" strokeWidth={0.8}
            initial={rm ? { cx: d.x, cy: d.y, opacity: 1 } : { cx: d.x, cy: -8, opacity: 0 }}
            animate={{ cx: d.x, cy: d.y, opacity: 1 }}
            transition={rm ? { duration: 0 } : { delay: i * 0.045, duration: 0.5, ease: [0.55, 0, 0.85, 0.4] }} />
        ))}
      </svg>
      <div className="simbtnrow">
        <button className="btn" onClick={() => { setRun((n) => n + 1); vib(8); }}>
          ▸ {run ? "Replay" : "Play"} 60 seasons
        </button>
        {run > 0 && (
          <span className="simnote" aria-live="polite">
            <b className="hit">{hits} served</b> · <b className="miss">{DROPS - hits} sold out</b> at {fmt(Q)} u
          </span>
        )}
      </div>
      <div className="qrow">
        <span className="qlab">your cut</span>
        <input className="slider" type="range" min={Math.floor(lo)} max={Math.ceil(hi)} step={1} value={Q}
          style={{ ["--fill" as string]: (((Q - lo) / (hi - lo || 1)) * 100).toFixed(1) + "%" } as CSSProperties}
          aria-label="Simulated cut quantity" onChange={(e) => setQ(clampQ(parseInt(e.target.value)))} />
        <span className="qval"><NumberFlow value={Q} format={INT} /> u</span>
        <button className="snap" onClick={() => { setQ(plan.Qstar); vib(8); }}>snap to Q*</button>
      </div>
      <div className="chips">
        <div className="chip fill"><div className="cv">{(r.fillRate * 100).toFixed(1)}%</div><div className="ck">fill rate</div></div>
        <div className="chip risk"><div className="cv">{(r.pStockout * 100).toFixed(0)}%</div><div className="ck">stockout risk</div></div>
        <div className="chip left"><div className="cv">{fmt(r.expLeftover)}</div><div className="ck">exp. leftover u</div></div>
        <div className="chip"><div className="cv">{money(r.expCost)}</div><div className="ck">exp. cost</div></div>
      </div>
      <div className={"deltacost" + (atOpt ? " opt" : "")} aria-live="polite">
        {atOpt ? "✓ You're at the optimum — this is the cheapest quantity to commit to."
          : <>Committing {fmt(Q)} u costs <b>{money(Math.abs(penalty))}</b> more than Q* in expectation ({Q > plan.Qstar ? "over-cutting → markdowns" : "under-cutting → lost sales"}).</>}
      </div>
      <CostCurveChart samples={samples} plan={plan} />
    </Sheet>
  );
}

const SIZE_NAMES = ["XS", "S", "M", "L", "XL", "2XL"];
const DEFAULT_SIZE_W = [6, 20, 30, 25, 14, 5];
function SizeSheet({ it, Qstar, weights, onWeights }: { it: SkuItem; Qstar: number; weights?: number[]; onWeights: (w: number[]) => void }) {
  const w = weights && weights.length === SIZE_NAMES.length ? weights
    : it.sizeW && it.sizeW.length === SIZE_NAMES.length ? it.sizeW : DEFAULT_SIZE_W;
  const units = allocateSizes(Qstar, w);
  const maxU = Math.max(...units, 1);
  const totW = w.reduce((a, b) => a + b, 0) || 1;
  return (
    <Sheet no="08" name="Which sizes to cut" right={it.nm}>
      <p className="answer">Your cut, split into sizes the factory can work from. Edit the percentages — units always add up exactly.</p>
      <div className="sizehead"><span>size</span><span></span><span style={{ textAlign: "right" }}>curve %</span><span style={{ textAlign: "right" }}>units</span></div>
      <div className="sizes">
        {SIZE_NAMES.map((nm, i) => (
          <div className="sizerow" key={nm}>
            <span className="sz">{nm}</span>
            <div className="sizebar"><i style={{ width: ((units[i] / maxU) * 100).toFixed(1) + "%" }} /></div>
            <input type="number" min={0} step={1} value={Math.round((w[i] / totW) * 1000) / 10}
              aria-label={`Size ${nm} share percent`} inputMode="decimal" autoComplete="off"
              onChange={(e) => { const next = w.slice(); next[i] = Math.max(0, parseFloat(e.target.value) || 0); onWeights(next); }} />
            <span className="units">{fmt(units[i])}</span>
          </div>
        ))}
      </div>
      <div className="sizefoot"><span>allocation check</span><span><b>{fmt(units.reduce((a, b) => a + b, 0))}</b> / {fmt(Qstar)} u</span></div>
      <div className="actions"><button className="btn" onClick={() => onWeights(DEFAULT_SIZE_W)}><RotateCcw size={13} /> Standard curve</button></div>
    </Sheet>
  );
}

function QRSheet({ it, fc, econ }: { it: SkuItem; fc: ForecastResult; econ: Econ }) {
  const H = fc.point.length;
  const [k, setK] = useState(2);
  const [prem, setPrem] = useState(12);
  const ratios = useMemo(() => levelRatios(it.series, M), [it]);
  const qr = useMemo(
    () => simulateQR(fc.point, fc.resid, ratios, econ, { k, premium: prem / 100, seed: 5 }),
    [fc, ratios, econ, k, prem]
  );
  const kMax = Math.min(4, H - 1);
  const pos = qr.savings > 0;
  const readPct = (k / H) * 100;
  return (
    <Sheet no="09" name="What speed is worth" right="why short lead times win">
      <p className="ph">
        Cut a little now. Watch {k} month{k > 1 ? "s" : ""} of real sales. Then re-cut fast, knowing if it&apos;s a hit. Simulated over 1,200 seasons of this product&apos;s own ups and downs.
      </p>
      <div className="qrhead">
        <span className={"big" + (pos ? "" : " neg")}>
          <NumberFlow value={Math.round(Math.abs(qr.savings))} format={INT} prefix={qr.savings < 0 ? "-$" : "$"} />{pos ? " saved" : ""}
        </span>
        <span className="sub">
          {pos
            ? <>per season vs. a single offshore-style commit — a <b>{(qr.savingsPct * 100).toFixed(0)}%</b> lower expected cost, because {k} month{k > 1 ? "s" : ""} of reads shrink remaining-season uncertainty by <b>{(qr.tightenPct * 100).toFixed(0)}%</b>.</>
            : <>at this rush premium the second cut doesn&apos;t pay for this SKU — a single commit is fine. Honest answer.</>}
        </span>
      </div>
      <div className="stagebar" aria-hidden="true">
        <i className="s1" style={{ width: "34%" }}>cut {fmt(qr.Q1)} u now</i>
        <i className="sread" style={{ width: readPct + "%" }}>read {k}mo</i>
        <i className="s2" style={{ flex: 1 }}>re-cut ~{fmt(qr.avgQ2)} u fast</i>
      </div>
      <div className="stagecap"><span>lean commit</span><span>learn from sell-through</span><span>respond at +{prem}% cost</span></div>
      <div className="btbars" style={{ marginTop: 14 }}>
        {[
          { lab: "Single commit (long lead)", cost: qr.costSingle, q: qr.Qfull, q2: null as number | null, best: !pos },
          { lab: "Cut → read → re-cut", cost: qr.costQR, q: qr.Q1, q2: qr.avgQ2 as number | null, best: pos },
        ].map((s) => {
          const maxC = Math.max(qr.costSingle, qr.costQR) || 1;
          return (
            <div key={s.lab} className={"btbar" + (s.best ? " best" : "")}>
              <div className="nm">{s.best ? <b>{s.lab}</b> : s.lab}<br />
                <span className="mono" style={{ fontSize: 9.5, color: "var(--faint)" }}>
                  {s.q2 != null ? `${fmt(s.q)} + ~${fmt(s.q2)} u` : `${fmt(s.q)} u`}
                </span></div>
              <div className="track"><i className={s.best ? "" : "neutral"} style={{ width: ((s.cost / maxC) * 100).toFixed(0) + "%" }} /></div>
              <div className="cost">{money(s.cost)}</div>
            </div>
          );
        })}
      </div>
      <div className="qrctl">
        <div className="f">
          <label htmlFor="qr-k">Months of reads before re-cut <b>{k} mo</b></label>
          <input id="qr-k" className="slider" type="range" min={1} max={kMax} step={1} value={k}
            style={{ ["--fill" as string]: (((k - 1) / Math.max(1, kMax - 1)) * 100).toFixed(0) + "%" } as CSSProperties}
            onChange={(e) => setK(parseInt(e.target.value) || 2)} />
        </div>
        <div className="f">
          <label htmlFor="qr-prem">Rush premium on the 2nd cut <b>+{prem}%</b></label>
          <input id="qr-prem" className="slider" type="range" min={0} max={40} step={1} value={prem}
            style={{ ["--fill" as string]: ((prem / 40) * 100).toFixed(0) + "%" } as CSSProperties}
            onChange={(e) => setPrem(parseInt(e.target.value) || 0)} />
        </div>
      </div>
      <div className="mt">
        This is the economics of &quot;weeks-not-months&quot; lead times: reads are only worth money because demand has a persistent
        hit-or-miss component — estimated here from realized year-over-year deviations{qr.lambdaN < 3 ? " (few observed years: treat as indicative)" : ""}.
        Offshore lead times can&apos;t use the reads; a fast factory can. Real-world context: Zara commits just 15–20% of a season
        before it starts (industry: 45–60%), and Sport Obermeyer&apos;s early-read program lifted profits 50–100% (Fisher–Raman, HBR 1994).
      </div>
    </Sheet>
  );
}

function BacktestSheet({ it, cm, econ, horizon, score }: { it: SkuItem; cm: Compute; econ: Econ; horizon: number; score: (it: SkuItem, h: Holdout, econ: Econ) => { actual: number; scored: Record<string, ReturnType<typeof realizedCost>> }; }) {
  const holdout = cm.holdouts[0];
  if (!holdout) return <Sheet no="07" name="Did it actually work"><p className="ph">Needs ≥ {2 * M + horizon} months (two seasons to learn + one to hold out). This has {it.series.length}.</p></Sheet>;
  const bt = score(it, holdout, econ);
  const rows: [string, string][] = [["newsvendor", "Loom Reach"], ["makeToMean", "Make-to-forecast"], ["lastSeasonPlus10", "Last season +10%"], ["runRate", "Recent run-rate"]];
  const maxCost = Math.max(...rows.map(([k]) => bt.scored[k].total)) || 1;
  const nvWon = bt.scored.newsvendor.total <= bt.scored.makeToMean.total;
  return (
    <Sheet no="07" name="Did it actually work" right={`held-out ${horizon}mo`}>
      <p className="answer">We hid the last season, planned for it, then checked what really sold.</p>
      <div className="btbars">
        {rows.map(([k, lab]) => {
          const sc = bt.scored[k], w = (sc.total / maxCost) * 100;
          const fill = k === "newsvendor" ? "" : sc.total >= maxCost * 0.999 ? "worst" : k === "makeToMean" ? "neutral" : "bad";
          return (
            <div key={k} className={"btbar" + (k === "newsvendor" ? " best" : "")}>
              <div className="nm">{k === "newsvendor" ? <b>{lab}</b> : lab}<br /><span className="mono" style={{ fontSize: 9.5, color: "var(--faint)" }}>make {fmt(sc.Q)} u</span></div>
              <div className="track"><i className={fill} style={{ width: w.toFixed(0) + "%" }} /></div>
              <div className="cost">{money(sc.total)}</div>
            </div>
          );
        })}
      </div>
      <div className={"note" + (nvWon ? " good" : "")}>
        {nvWon ? (<><b>On this held-out season, Loom Reach was cheapest.</b> Actual demand was {fmt(bt.actual)} units; the newsvendor plan absorbed it with the least combined markdown + lost-margin cost.</>)
          : (<><b>On this single season, the naive plan happened to win.</b> Actual demand ({fmt(bt.actual)} u) landed below forecast, so the uncertainty buffer cost money here — expected, since newsvendor minimizes <em>expected</em> cost and wins across the portfolio, not every coin-flip. Shown honestly on purpose.</>)}
      </div>
    </Sheet>
  );
}

function MethodologyBody() {
  return (
    <>
      <h2>What&apos;s real</h2>
      <ul className="methlist">
        <li><b>Model competition</b> — Seasonal-Naive, Holt-Winters ETS (additive + log/multiplicative), Croston/SBA for intermittent demand, a driver ridge-regression (Fourier seasonality + trend + price + promo), and a forecast combination.</li>
        <li><b>Selection</b> — rolling-origin cross-validation scores each by <b>MASE / WAPE / bias</b>; winner chosen per-SKU. Intermittent/lumpy demand routes to Croston (point metrics mislead there).</li>
        <li><b>Classification</b> — ADI / CV² (Syntetos–Boylan–Croston) labels each SKU smooth / erratic / intermittent / lumpy.</li>
        <li><b>Decision</b> — the winner&apos;s residual-bootstrap distribution feeds the <b>newsvendor</b> optimum Q* = F⁻¹(Cu/(Cu+Co)); a true hold-out backtest scores it vs. naive baselines.</li>
        <li><b>Quick response</b> — cut → read → re-cut simulated with a persistent hit-or-miss level factor estimated from realized year-over-year deviations; conditioning on early reads is a kNN posterior over simulated paths.</li>
        <li><b>Ingestion</b> — <code>/api/ingest</code> aggregates Shopify orders exports to per-SKU monthly demand server-side.</li>
      </ul>
      <h2>What&apos;s illustrative</h2>
      <p className="ph" style={{ maxWidth: "70ch" }}>
        The default catalog is labeled sample data with realistic seasonality and promo/price drivers. &quot;Real public data&quot;
        runs the identical brain on genuine published series; uploads and Shopify exports run it on yours. Cost inputs
        (margin, salvage, rush premium) are adjustable assumptions, not claims. 52 headless tests cover the math.
      </p>
      <h2>Path to production at Loom</h2>
      <p className="ph" style={{ maxWidth: "70ch" }}>
        Put <code>/api/ingest</code> behind Shopify OAuth + webhooks, add accounts + Postgres, reforecast on a schedule and
        alert when actuals break the interval, and emit the plan into the production schedule — the Loom Core handoff.
      </p>
    </>
  );
}

/* Capacity sheet — split scarce factory capacity optimally across the catalog */
function CapacitySheet({ rows }: { rows: { it: SkuItem; samples: number[]; econ: Econ }[] }) {
  const [capPct, setCapPct] = useState(100);
  const skus = useMemo(() => rows.map((r) => ({ id: r.it.id, samples: r.samples, econ: r.econ })), [rows]);
  const baseTotal = useMemo(() => allocateCapacity(skus, Number.MAX_SAFE_INTEGER).totalUnconstrained, [skus]);
  const cap = Math.round((baseTotal * capPct) / 100);
  const res = useMemo(() => allocateCapacity(skus, cap), [skus, cap]);
  const byId = new Map(res.alloc.map((a) => [a.id, a]));
  return (
    <Sheet no="0C" name="Who gets the machines" right="who gets the machines">
      <p className="answer">Not enough machine time for everything? Drag capacity down and watch it protect the products that earn the most.</p>
      <div className="qrctl" style={{ gridTemplateColumns: "1fr" }}>
        <div className="f">
          <label htmlFor="cap-sl">Season capacity <b>{fmt(cap)} u · {capPct}% of plan</b></label>
          <input id="cap-sl" className="slider" type="range" min={30} max={120} step={1} value={capPct}
            style={{ ["--fill" as string]: (((capPct - 30) / 90) * 100).toFixed(0) + "%" } as CSSProperties}
            onChange={(e) => setCapPct(parseInt(e.target.value) || 100)} />
        </div>
      </div>
      {res.binding ? (
        <div className="note good" style={{ marginTop: 4 }}>
          Optimal allocation earns <b><NumberFlow value={Math.round(res.gain)} format={INT} prefix="$" /></b> more expected profit than scaling every SKU down {(100 - (cap / baseTotal) * 100).toFixed(0)}% pro-rata.
        </div>
      ) : (
        <div className="note" style={{ marginTop: 4 }}>Capacity covers the full plan — every SKU gets its own optimum. Drag below 100% to see the trade-offs.</div>
      )}
      <div className="caprows">
        {rows.map((r) => {
          const a = byId.get(r.it.id); if (!a) return null;
          const w = a.unconstrained > 0 ? (a.q / a.unconstrained) * 100 : 0;
          const cutBack = a.unconstrained - a.q;
          return (
            <div className="caprow" key={r.it.id}>
              <span className="cn">{r.it.nm}<small>{r.it.id}</small></span>
              <div className="capbar"><div className="want" style={{ width: "100%" }} /><div className="got" style={{ width: Math.min(100, w).toFixed(1) + "%" }} /></div>
              <span className="cq"><b>{fmt(a.q)}</b>{cutBack > 0 ? <span className="cut-back"> −{fmt(cutBack)}</span> : " full"}</span>
            </div>
          );
        })}
      </div>
      <div className="mt">Greedy on marginal expected profit — provably optimal for this problem (validated against brute force). Thin-margin SKUs give way first; the fat-margin winners keep their buffer.</div>
    </Sheet>
  );
}

/* =============================== screens =============================== */

function PlanScreen({ items, compute, econFor, horizon, portfolio, openSku }: {
  items: SkuItem[]; compute: Map<string, Compute>; econFor: (it: SkuItem) => Econ; horizon: number;
  portfolio: { totNV: number; totMean: number; wins: number; n: number; savedVsMean: number }; openSku: (id: string) => void;
}) {
  const rows = items.map((it) => {
    const cm = compute.get(it.id); if (!cm) return null;
    const d = decide(cm.fc.samples, econFor(it));
    return { it, fc: cm.fc, d, save: d.expectedCostMean - d.expectedCostStar };
  }).filter((r): r is NonNullable<typeof r> => r != null);
  const totQ = rows.reduce((a, r) => a + r.d.Qstar, 0);
  const totSave = rows.reduce((a, r) => a + r.save, 0);
  const showRoll = portfolio.n >= 6;

  function exportCSV() {
    const esc = (s: string) => /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    const lines = [
      ["sku", "name", "chosen_model", "demand_pattern", "cut_quantity", "mean_forecast", "uncertainty_buffer", "expected_saving_usd"].join(","),
      ...rows.map((r) => [esc(r.it.id), esc(r.it.nm), esc(r.fc.selectedLabel), r.fc.classification.label, r.d.Qstar, r.d.QtoMean, r.d.Qstar - r.d.QtoMean, Math.round(r.save)].join(",")),
      ["TOTAL", "", "", "", totQ, "", "", Math.round(totSave)].join(","),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "loom-reach-production-plan-" + horizon + "mo.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <div className="screen">
      <section className="intro" style={{ padding: "4px 2px 12px" }}>
        <h1>How many do you <em>actually</em> make?</h1>
        <p>One number per product. Tap any product to see how its number is made.</p>
      </section>
      {rows.length === 0 ? (
        <div className="sheet" style={{ marginTop: 14 }}>
          <h2 className="st">No data loaded</h2>
          <p className="ph">Pick a data source on the Data tab — the sample catalog, real public series, or your own Shopify/CSV export.</p>
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          <Sheet no="00" name="The plan" right={`${horizon}-mo season · ${rows.length} SKUs`}>
            <div className="planrows">
              {rows.map((r) => {
                const buffer = r.d.Qstar - r.d.QtoMean;
                return (
                  <button key={r.it.id} className="planrow" onClick={() => openSku(r.it.id)}>
                    <span className="pn">{r.it.nm}</span>
                    <span className="pq">{fmt(r.d.Qstar)}<small>units to cut</small></span>
                    <span className="pd">
                      {buffer >= 0 ? `+${fmt(buffer)} safety buffer` : `${fmt(buffer)} vs average`} · planning this way saves <b>~{money(r.save)}</b>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="plantotal">
              <span className="k">Season total</span>
              <span className="v"><NumberFlow value={totQ} format={INT} /> <small>units · ~{money(totSave)} protected</small></span>
            </div>
            <div className="actions">
              <button className="btn primary" onClick={exportCSV}><Download size={14} /> Export plan CSV</button>
            </div>
            {showRoll && (
              <details className="how">
                <summary>Does this actually work?</summary>
                <div className="howbody">
                  We tested it on the past. Hide a season, plan for it, then check what really sold.
                  Across <b>{portfolio.n}</b> hidden seasons, this planning beat &quot;just make the forecast&quot; on <b>{portfolio.wins} of {portfolio.n}</b>,
                  keeping <b style={{ color: portfolio.savedVsMean < 0 ? "var(--red)" : "var(--good)" }}>{money(portfolio.savedVsMean)}</b> that
                  would have been lost to markdowns and missed sales. It wins on average — not on every single product.
                </div>
              </details>
            )}
          </Sheet>
          {rows.length > 1 && (
            <div style={{ marginTop: 14 }}>
              <CapacitySheet rows={rows.map((r) => ({ it: r.it, samples: compute.get(r.it.id)!.fc.samples, econ: econFor(r.it) }))} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SkuScreen({ it, cm, items, econ, horizon, sizes, onEcon, onHorizon, onSizes, switchSku, score }: {
  it: SkuItem; cm: Compute; items: SkuItem[]; econ: Econ; horizon: number;
  sizes?: number[]; onEcon: (k: keyof Econ, v: number) => void; onHorizon: (v: number) => void;
  onSizes: (w: number[]) => void; switchSku: (id: string) => void;
  score: (it: SkuItem, h: Holdout, econ: Econ) => { actual: number; scored: Record<string, ReturnType<typeof realizedCost>> };
}) {
  const plan = decide(cm.fc.samples, econ);
  const [open, setOpen] = useState<string | null>(null);
  const hasDrivers = cm.fc.drivers.filter((d) => isFinite(d.coef)).length > 0;
  const topics: { id: string; q: string; t: string; show?: boolean; body: () => React.ReactNode }[] = [
    { id: "risk", q: "What if I cut more — or less?", t: "Drag the line. Play 60 seasons.", body: () => <RiskSheet key={"risk-" + it.id + ":" + horizon} samples={cm.fc.samples} plan={plan} /> },
    { id: "sizes", q: "Which sizes?", t: "Split the cut into a size run.", body: () => <SizeSheet it={it} Qstar={plan.Qstar} weights={sizes} onWeights={onSizes} /> },
    { id: "speed", q: "What is speed worth?", t: "Cut small, read sales, re-cut fast.", show: horizon >= 3, body: () => <QRSheet key={"qr-" + it.id + ":" + horizon} it={it} fc={cm.fc} econ={econ} /> },
    { id: "econ", q: "My numbers are different", t: "Set your price, cost, and salvage.", body: () => <EconSheet it={it} econ={econ} horizon={horizon} onEcon={onEcon} onHorizon={onHorizon} /> },
    { id: "trust", q: "Can I trust the forecast?", t: "Five models competed. See the scores.", body: () => <BrainSheet fc={cm.fc} /> },
    { id: "drivers", q: "What moves demand?", t: "Price and promo effects, learned from history.", show: hasDrivers, body: () => <DriverSheet fc={cm.fc} /> },
    { id: "proof", q: "Did it actually work?", t: "Tested against seasons it never saw.", body: () => <BacktestSheet it={it} cm={cm} econ={econ} horizon={horizon} score={score} /> },
  ];
  return (
    <>
      <div className="skuchips" role="tablist" aria-label="Switch SKU">
        {items.map((s) => (
          <button key={s.id} role="tab" aria-selected={s.id === it.id} className={"skuchip" + (s.id === it.id ? " on" : "")} onClick={() => switchSku(s.id)}>{s.nm}</button>
        ))}
      </div>
      {it.story && <p className="story"><span className="story-tag">grounded in</span> {it.story}</p>}
      <div className="sheets">
        <DecisionSheet it={it} plan={plan} horizon={horizon} samples={cm.fc.samples} />
        <Sheet no="02" name="What will sell" right={`${it.real ? "● real" : "○ illustrative"} · ${it.series.length}mo`}>
          <div className="fcgrid">
            <div><ForecastChart it={it} fc={cm.fc} horizon={horizon} /></div>
            <div><Seasonality it={it} /><div className="fp-cap">seasonality fingerprint · monthly index</div></div>
          </div>
        </Sheet>
        <div className="topics">
          <div className="topics-cap">Dig deeper — tap a question</div>
          {topics.filter((t) => t.show !== false).map((t) => {
            const isOpen = open === t.id;
            return (
              <div key={t.id} className={"topic" + (isOpen ? " open" : "")}>
                <button className="topic-head" aria-expanded={isOpen}
                  onClick={() => { setOpen(isOpen ? null : t.id); vib(6); }}>
                  <span className="tq">{t.q}<span className="tt">{t.t}</span></span>
                  <span className="tic" aria-hidden="true"><Plus size={15} /></span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div className="topic-body" key="b"
                      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}>
                      {t.body()}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
        <Drawer.Root>
          <Drawer.Trigger asChild>
            <button className="btn" style={{ alignSelf: "flex-start" }}><BookOpen size={14} /> Methodology &amp; what&apos;s real</button>
          </Drawer.Trigger>
          <Drawer.Portal>
            <Drawer.Overlay className="voverlay" />
            <Drawer.Content className="vcontent">
              <div className="vhandle" aria-hidden="true" />
              <Drawer.Title className="sr-only">Methodology and what is real</Drawer.Title>
              <div className="vbody"><MethodologyBody /></div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      </div>
    </>
  );
}

function DataScreen({ source, items, upload, onPick, onFile, onReset }: {
  source: Source; items: SkuItem[]; upload: { error: string | null; warnings: string[]; okay: string | null };
  onPick: (kind: "apparel" | "real" | "shopify" | "defense" | "dtc") => void; onFile: (e: React.ChangeEvent<HTMLInputElement>) => void; onReset: () => void;
}) {
  return (
    <div className="screen">
      <section className="intro" style={{ padding: "4px 2px 4px" }}>
        <h1>Choose your <em>data</em></h1>
        <p>Same engine, your choice of data. Try a sample, or bring your own sales.</p>
      </section>
      <div className="datacards">
        <button className={"datacard" + (source === "apparel" ? " on" : "")} onClick={() => onPick("apparel")}>
          <span className="ic"><Layers size={17} /></span>
          <span><span className="dn">Apparel catalog</span><span className="dd" style={{ display: "block" }}>10 illustrative SKUs with seasonality, promo &amp; price drivers — labeled sample data.</span></span>
          <span className="go">{source === "apparel" && items.length ? "active" : "load →"}</span>
        </button>
        <button className={"datacard" + (source === "defense" ? " on" : "")} onClick={() => onPick("defense")}>
          <span className="ic"><Shield size={17} /></span>
          <span><span className="dn">Defense programs</span><span className="dd" style={{ display: "block" }}>5 SKUs modeled on real DLA &amp; SOCOM situations — option-year gambles, surge orders, size tariffs. Each cites its source.</span></span>
          <span className="go">{source === "defense" && items.length ? "active" : "load →"}</span>
        </button>
        <button className={"datacard" + (source === "dtc" ? " on" : "")} onClick={() => onPick("dtc")}>
          <span className="ic"><Shirt size={17} /></span>
          <span><span className="dn">DTC brand stories</span><span className="dd" style={{ display: "block" }}>4 SKUs modeled on documented gluts &amp; sellouts — the FIGS cliff, Allbirds&apos; miss, the Old Navy size-curve failure.</span></span>
          <span className="go">{source === "dtc" && items.length ? "active" : "load →"}</span>
        </button>
        <button className={"datacard" + (source === "real" ? " on" : "")} onClick={() => onPick("real")}>
          <span className="ic"><Database size={17} /></span>
          <span><span className="dn">Real public datasets</span><span className="dd" style={{ display: "block" }}>Genuine published demand series (champagne, cars, paper) — verify the brain on real history.</span></span>
          <span className="go">{source === "real" && items.length ? "active" : "load →"}</span>
        </button>
        <button className="datacard" onClick={() => onPick("shopify")}>
          <span className="ic"><ShoppingBag size={17} /></span>
          <span><span className="dn">Sample Shopify export</span><span className="dd" style={{ display: "block" }}>261 sample orders POSTed to <code>/api/ingest</code> — aggregated to demand server-side.</span></span>
          <span className="go">ingest →</span>
        </button>
        <label className={"datacard" + (source === "upload" && items.length ? " on" : "")}>
          <span className="ic"><Upload size={17} /></span>
          <span><span className="dn">Your own sales</span><span className="dd" style={{ display: "block" }}>CSV (sku, date, units — daily/weekly auto-aggregate) or a Shopify orders .json.</span></span>
          <span className="go">browse →</span>
          <input type="file" accept=".csv,text/csv,.txt,.json,application/json" onChange={onFile} />
        </label>
      </div>
      {(upload.error || upload.okay || upload.warnings.length > 0) && (
        <div className="uplist" role="status" style={{ marginTop: 12 }}>
          {upload.error && <div className="upmsg err"><TriangleAlert size={13} style={{ flexShrink: 0, marginTop: 1 }} />{upload.error}</div>}
          {upload.okay && <div className="upmsg okay">✓ {upload.okay}</div>}
          {upload.warnings.map((w, i) => <div key={i} className="upmsg warn"><TriangleAlert size={13} style={{ flexShrink: 0, marginTop: 1 }} />{w}</div>)}
        </div>
      )}
      <div className="actions"><button className="btn" onClick={onReset}><RotateCcw size={13} /> Reset session</button></div>
    </div>
  );
}

function MethodScreen() {
  return (
    <div className="screen">
      <section className="intro" style={{ padding: "4px 2px 4px" }}>
        <h1>Built to be <em>checked</em></h1>
        <p>A planning tool you can&apos;t audit isn&apos;t a planning tool. Everything below runs in your browser or in this app&apos;s API — nothing is mocked.</p>
      </section>
      <div className="sheet" style={{ marginTop: 12 }}><MethodologyBody /></div>
      <div className="linkrow">
        <a className="btn primary" href="/pitch">Why I built this — for Anatar <ArrowUpRight size={13} /></a>
        <a className="btn" href="https://github.com/maxmoneycash/loom-reach" target="_blank" rel="noopener noreferrer">Source on GitHub <ArrowUpRight size={13} /></a>
      </div>
      <p className="mt" style={{ marginTop: 16 }}>Built by <b>Max Mohammadi</b> · independent concept for the Anatar / Loom team · not affiliated with Anatar.</p>
    </div>
  );
}

/* =============================== app shell =============================== */

const TABS: { id: Tab; lab: string; Icon: typeof ClipboardList }[] = [
  { id: "plan", lab: "Plan", Icon: ClipboardList },
  { id: "data", lab: "Data", Icon: Database },
  { id: "method", lab: "Method", Icon: BookOpen },
];

export default function LoomReach() {
  const rm = useReducedMotion();
  const [source, setSource] = useState<Source>("apparel");
  const [items, setItems] = useState<SkuItem[]>(() => loadApparel());
  const [horizon, setHorizon] = useState(12);
  const [econOverride, setEconOverride] = useState<Record<string, Econ>>({});
  const [sizes, setSizes] = useState<Record<string, number[]>>({});
  const [upload, setUpload] = useState<{ error: string | null; warnings: string[]; okay: string | null }>({ error: null, warnings: [], okay: null });
  const [view, setView] = useState<View>({ tab: "plan", sku: null });
  const hydrated = useRef(false);

  const econFor = useCallback((it: SkuItem): Econ => econOverride[it.id] || it.econ, [econOverride]);

  /* ---- URL <-> view sync (deep-linkable screens) ---- */
  const navigate = useCallback((next: View, push = true) => {
    setView(next);
    if (typeof window === "undefined") return;
    const u = new URL(window.location.href);
    if (next.tab === "plan") u.searchParams.delete("t"); else u.searchParams.set("t", next.tab);
    if (next.sku) u.searchParams.set("s", next.sku); else u.searchParams.delete("s");
    const url = u.pathname + (u.search || "") + u.hash;
    if (push) window.history.pushState(next, "", url); else window.history.replaceState(next, "", url);
  }, []);
  useEffect(() => {
    const onPop = () => {
      const p = new URLSearchParams(window.location.search);
      const t = (p.get("t") as Tab) || "plan";
      setView({ tab: ["plan", "data", "method"].includes(t) ? t : "plan", sku: p.get("s") });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /* ---- session restore (post-mount; hydration-safe) ---- */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const p = loadState();
    if (p) {
      if (p.source === "upload" && p.uploaded?.length) {
        setSource("upload"); setItems(p.uploaded);
        setUpload({ error: null, warnings: [], okay: p.uploaded.length + " SKU" + (p.uploaded.length > 1 ? "s" : "") + " restored from your last session." });
      } else if (p.source === "real") { setSource("real"); setItems(loadReal()); }
      else if (p.source === "defense") { setSource("defense"); setItems(loadDefense()); }
      else if (p.source === "dtc") { setSource("dtc"); setItems(loadDtc()); }
      if (p.econOverride) setEconOverride(p.econOverride);
      if (p.sizes) setSizes(p.sizes);
      if (p.horizon >= 1 && p.horizon <= 24) setHorizon(p.horizon);
    }
    // adopt the URL's view (deep link)
    const sp = new URLSearchParams(window.location.search);
    const t = (sp.get("t") as Tab) || "plan";
    const initial: View = { tab: ["plan", "data", "method"].includes(t) ? t : "plan", sku: sp.get("s") };
    setView(initial);
    window.history.replaceState(initial, "");
    hydrated.current = true;
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!hydrated.current) return;
    saveState({ source, horizon, econOverride, sizes, uploaded: source === "upload" ? items : null, selectedId: view.sku });
  }, [source, horizon, econOverride, sizes, items, view.sku]);

  /* ---- compute ---- */
  const compute = useMemo(() => {
    const map = new Map<string, Compute>();
    items.forEach((it) => {
      if (it.series.length < M + 2) return;
      const fc = runForecast(it.series, M, horizon, { drivers: it.drivers, seed: 7, nSamples: 5000 });
      const holdouts: Holdout[] = [];
      const step = Math.max(3, Math.floor(horizon / 2));
      for (let t = it.series.length - horizon; t >= 2 * M && holdouts.length < 5; t -= step) {
        const train = it.series.slice(0, t);
        const hf = runForecast(train, M, horizon, { drivers: it.drivers, seed: 7, nSamples: 5000 });
        holdouts.push({ samples: hf.samples, actual: it.series.slice(t, t + horizon).reduce((a, b) => a + b, 0) });
      }
      map.set(it.id, { fc, holdouts });
    });
    return map;
  }, [items, horizon]);

  const scoreHoldout = useCallback((it: SkuItem, h: Holdout, econ: Econ) => {
    const nv = newsvendor(econ);
    const Qstar = Math.round(quantile(h.samples, nv.criticalRatio));
    const QtoMean = Math.round(avg(h.samples));
    const train = it.series.slice(0, it.series.length - horizon);
    const prevSeason = train.slice(train.length - horizon).reduce((a, b) => a + b, 0);
    const QlastPlus = Math.round(prevSeason * 1.1);
    const QrunRate = Math.round(avg(train.slice(train.length - horizon)) * horizon);
    return { actual: h.actual, scored: {
      newsvendor: realizedCost(Qstar, h.actual, nv.Cu, nv.Co),
      makeToMean: realizedCost(QtoMean, h.actual, nv.Cu, nv.Co),
      lastSeasonPlus10: realizedCost(QlastPlus, h.actual, nv.Cu, nv.Co),
      runRate: realizedCost(QrunRate, h.actual, nv.Cu, nv.Co),
    } };
  }, [horizon]);

  const portfolio = useMemo(() => {
    let totNV = 0, totMean = 0, wins = 0, n = 0;
    items.forEach((it) => {
      const cm = compute.get(it.id); if (!cm) return;
      const nv = newsvendor(econFor(it));
      cm.holdouts.forEach((h) => {
        const cNV = realizedCost(Math.round(quantile(h.samples, nv.criticalRatio)), h.actual, nv.Cu, nv.Co).total;
        const cM = realizedCost(Math.round(avg(h.samples)), h.actual, nv.Cu, nv.Co).total;
        totNV += cNV; totMean += cM; if (cNV <= cM) wins++; n++;
      });
    });
    return { totNV, totMean, wins, n, savedVsMean: totMean - totNV };
  }, [compute, items, econFor]);

  /* ---- data flows ---- */
  function switchSource(s: Source) {
    setSource(s); setEconOverride({}); setHorizon(12);
    setUpload({ error: null, warnings: [], okay: null });
    setItems(s === "apparel" ? loadApparel() : s === "real" ? loadReal() : s === "defense" ? loadDefense() : s === "dtc" ? loadDtc() : []);
  }
  function applyIngest(items2: SkuItem[], warnings: string[], src: string) {
    const longest = Math.max(...items2.map((i) => i.series.length));
    setSource("upload"); setItems(items2); setEconOverride({}); setHorizon(Math.min(12, Math.max(1, longest - 2 * M)));
    setUpload({ error: null, warnings, okay: items2.length + " SKU" + (items2.length > 1 ? "s" : "") + " loaded from " + src + " — review unit economics per SKU." });
    navigate({ tab: "plan", sku: null });
  }
  async function ingestOrders(json: unknown, srcLabel: string) {
    setUpload({ error: null, warnings: [], okay: "Ingesting on the server…" });
    try {
      const res = await fetch("/api/ingest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(json) });
      const data = (await res.json()) as { items: SkuItem[]; warnings: string[]; error: string | null };
      if (data.error || !data.items?.length) { setUpload({ error: data.error ?? "Nothing ingested.", warnings: data.warnings ?? [], okay: null }); return; }
      applyIngest(data.items, data.warnings, srcLabel);
    } catch (err) { setUpload({ error: "Ingestion failed: " + (err as Error).message, warnings: [], okay: null }); }
  }
  function onPickData(kind: "apparel" | "real" | "shopify" | "defense" | "dtc") {
    vib(6);
    if (kind === "shopify") {
      void (async () => {
        try { const r = await fetch("/sample-orders.json"); await ingestOrders(await r.json(), "the sample Shopify export"); }
        catch (err) { setUpload({ error: "Could not load the sample export: " + (err as Error).message, warnings: [], okay: null }); }
      })();
      return;
    }
    switchSource(kind);
    navigate({ tab: "plan", sku: null });
  }
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const isJson = /\.json$/i.test(f.name);
    const rd = new FileReader();
    rd.onload = () => {
      try {
        if (isJson) { void ingestOrders(JSON.parse(String(rd.result)), "your Shopify export"); return; }
        const res = parseCSV(String(rd.result));
        if (res.error || !res.items.length) { setUpload({ error: res.error ?? "No rows parsed.", warnings: res.warnings, okay: null }); return; }
        applyIngest(res.items, res.warnings, "your CSV");
      } catch (err) { setUpload({ error: "Could not parse the file: " + (err as Error).message, warnings: [], okay: null }); }
    };
    rd.readAsText(f);
  }
  function resetAll() {
    clearState();
    switchSource("apparel");
    setUpload({ error: null, warnings: [], okay: "Saved session cleared." });
  }

  /* ---- navigation helpers ---- */
  const openSku = (id: string) => { vib(6); navigate({ tab: "plan", sku: id }); };
  const closeSku = () => { vib(6); navigate({ tab: view.tab, sku: null }); };
  const goTab = (t: Tab) => { if (view.tab === t && !view.sku) return; vib(6); navigate({ tab: t, sku: null }); };

  const skuItem = view.sku ? items.find((i) => i.id === view.sku) ?? null : null;
  const skuCompute = skuItem ? compute.get(skuItem.id) ?? null : null;
  const showDetail = !!(skuItem && skuCompute);

  const screenTrans = rm ? { duration: 0 } : { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const };
  const pushTrans = rm ? { duration: 0 } : { type: "spring" as const, stiffness: 420, damping: 42 };

  return (
    <div className="app">
      <header className="bar">
        <div className="bar-in">
          <AnimatePresence mode="wait" initial={false}>
            {showDetail ? (
              <motion.div key="back" className="brand" style={{ flex: 1, minWidth: 0 }}
                initial={rm ? false : { opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={screenTrans}>
                <button className="backbtn" onClick={closeSku} aria-label="Back to plan"><ChevronLeft size={17} /> plan</button>
                <span className="bartitle">{skuItem!.nm}</span>
              </motion.div>
            ) : (
              <motion.div key="brand" className="brand" style={{ flex: 1 }}
                initial={rm ? false : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={screenTrans}>
                <span className="mk">Loom<b>/</b>Reach</span>
                <span className="sub">demand-driven production</span>
              </motion.div>
            )}
          </AnimatePresence>
          <span className="tag">prototype</span>
        </div>
      </header>

      <main>
        <AnimatePresence mode="wait" initial={false}>
          {showDetail ? (
            <motion.div key={"sku-" + skuItem!.id}
              initial={rm ? false : { x: "60%", opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={rm ? { opacity: 0 } : { x: "70%", opacity: 0 }}
              transition={pushTrans}
              drag={rm ? false : "x"} dragConstraints={{ left: 0, right: 0 }} dragElastic={{ left: 0, right: 0.5 }} dragDirectionLock
              onDragEnd={(_, info) => { if (info.offset.x > 110 || info.velocity.x > 600) { vib(8); closeSku(); } }}
              className="screen">
              <SkuScreen it={skuItem!} cm={skuCompute!} items={items}
                econ={econFor(skuItem!)} horizon={horizon} sizes={sizes[skuItem!.id]}
                onEcon={(k, v) => setEconOverride((p) => ({ ...p, [skuItem!.id]: { ...econFor(skuItem!), [k]: Math.max(0, v || 0) } }))}
                onHorizon={(v) => setHorizon(Math.max(1, Math.min(v, skuItem!.series.length - 2 * M)))}
                onSizes={(w) => setSizes((p) => ({ ...p, [skuItem!.id]: w }))}
                switchSku={(id) => navigate({ tab: "plan", sku: id }, false)}
                score={scoreHoldout} />
            </motion.div>
          ) : (
            <motion.div key={"tab-" + view.tab}
              initial={rm ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={screenTrans}>
              {view.tab === "plan" && <PlanScreen items={items} compute={compute} econFor={econFor} horizon={horizon} portfolio={portfolio} openSku={openSku} />}
              {view.tab === "data" && <DataScreen source={source} items={items} upload={upload} onPick={onPickData} onFile={onFile} onReset={resetAll} />}
              {view.tab === "method" && <MethodScreen />}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <nav className="tabbar" aria-label="Primary">
        <div className="tabbar-in">
          {TABS.map(({ id, lab, Icon }) => {
            const on = view.tab === id && !showDetail;
            return (
              <button key={id} className={"tabbtn" + (on ? " on" : "")} onClick={() => goTab(id)} aria-current={on ? "page" : undefined}>
                {on && <motion.span layoutId="tabpill" className="pill" transition={rm ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }} />}
                <Icon size={18} />
                <span className="tlab">{lab}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
