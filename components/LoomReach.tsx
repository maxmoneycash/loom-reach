"use client";

import { useMemo, useRef, useState } from "react";
import { Upload, TriangleAlert } from "lucide-react";
import {
  makeRng, planSku, backtest, expectedCost, quantile, perStepBands,
  type Plan, type Econ,
} from "@/lib/engine";
import {
  loadApparel, loadReal, parseCSV, type SkuItem,
} from "@/lib/data";

const M = 12;
type Source = "apparel" | "real" | "upload";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const money = (n: number) => (n < 0 ? "-" : "") + "$" + fmt(Math.abs(n));

function Sparkline({ series }: { series: number[] }) {
  const w = 74, h = 34;
  const min = Math.min(...series), max = Math.max(...series), rng = max - min || 1;
  const d = series
    .map((v, i) => {
      const x = (i / (series.length - 1)) * w;
      const y = h - ((v - min) / rng) * h;
      return (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
    })
    .join(" ");
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <path d={d} fill="none" stroke="var(--ind)" strokeWidth={1.4} strokeLinejoin="round" />
    </svg>
  );
}

function ForecastChart({ it, plan, horizon }: { it: SkuItem; plan: Plan; horizon: number }) {
  const bands = perStepBands(plan.pointForecast, plan.residuals, makeRng(7), 3000);
  const hist = it.series, H = horizon, n = hist.length;
  const W = 720, Ht = 240, padL = 46, padR = 14, padT = 12, padB = 26;
  const maxV = Math.max(...hist.concat(bands.map((b) => b.p90))) * 1.06 || 1;
  const minV = 0;
  const totalX = n + H;
  const X = (i: number) => padL + (i / (totalX - 1)) * (W - padL - padR);
  const Y = (v: number) => padT + (1 - (v - minV) / (maxV - minV)) * (Ht - padT - padB);
  const histPath = hist.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1)).join(" ");
  const up = bands.map((b, k) => [X(n + k), Y(b.p90)] as const);
  const lo = bands.map((b, k) => [X(n + k), Y(b.p10)] as const).reverse();
  const bandPts = up.concat(lo).map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  const medPath = bands.map((b, k) => (k ? "L" : "M") + X(n + k).toFixed(1) + " " + Y(b.p50).toFixed(1)).join(" ");
  const connector = "M" + X(n - 1).toFixed(1) + " " + Y(hist[n - 1]).toFixed(1) + " L" + X(n).toFixed(1) + " " + Y(bands[0].p50).toFixed(1);
  const sep = X(n - 0.5);
  const gridV = [0, 1, 2, 3, 4].map((g) => minV + (g / 4) * (maxV - minV));
  const labIdx = [0, Math.floor(n / 2), n - 1];

  return (
    <div className="panel">
      <div className="fhead">
        <span className="nm">{it.nm}</span>
        <span className="src2">
          {it.real ? "● real" : "○ illustrative"} · {it.src} · {n} months · HW α={plan.fit.alpha} β={plan.fit.beta} γ={plan.fit.gamma} · RMSE {fmt(plan.fit.rmse)}
        </span>
      </div>
      <svg className="chart" viewBox={`0 0 ${W} ${Ht}`}>
        {gridV.map((v, i) => (
          <g key={i}>
            <line x1={padL} y1={Y(v)} x2={W - padR} y2={Y(v)} stroke="var(--line-2)" />
            <text x={padL - 7} y={Y(v) + 3} textAnchor="end" fontSize={9} fill="var(--faint)" fontFamily="var(--font-mono)">{fmt(v)}</text>
          </g>
        ))}
        <line x1={sep} y1={padT} x2={sep} y2={Ht - padB} stroke="var(--line)" strokeDasharray="3 3" />
        <polygon points={bandPts} fill="rgba(46,74,134,.13)" stroke="none" />
        <path d={histPath} fill="none" stroke="var(--ink)" strokeWidth={1.7} />
        <path d={connector} fill="none" stroke="var(--ind)" strokeWidth={1.7} strokeDasharray="4 3" />
        <path d={medPath} fill="none" stroke="var(--ind)" strokeWidth={1.7} strokeDasharray="4 3" />
        {labIdx.map((i, k) =>
          it.labels[i] ? (
            <text key={k} x={X(i)} y={Ht - 7} textAnchor="middle" fontSize={9} fill="var(--faint)" fontFamily="var(--font-mono)">{it.labels[i]}</text>
          ) : null
        )}
        <text x={X(n + H - 1)} y={Ht - 7} textAnchor="end" fontSize={9} fill="var(--ind)" fontFamily="var(--font-mono)">+{H}mo</text>
      </svg>
      <div className="legend">
        <span><i style={{ background: "var(--ink)" }} />Actual demand</span>
        <span><i style={{ background: "var(--ind)" }} />Forecast (median)</span>
        <span><i style={{ background: "rgba(46,74,134,.2)" }} />80% prediction interval (P10–P90)</span>
      </div>
    </div>
  );
}

function CostCurveChart({ plan }: { plan: Plan }) {
  const nv = plan.newsvendor;
  const lo = quantile(plan.samples, 0.01), hi = quantile(plan.samples, 0.99);
  const STEPS = 60;
  const qs: number[] = [], cs: number[] = [];
  for (let i = 0; i <= STEPS; i++) { const Q = lo + (i / STEPS) * (hi - lo); qs.push(Q); cs.push(expectedCost(Q, plan.samples, nv.Cu, nv.Co)); }
  const W = 720, Ht = 210, padL = 52, padR = 14, padT = 12, padB = 26;
  const maxC = Math.max(...cs) * 1.05 || 1, minC = 0;
  const X = (q: number) => padL + ((q - lo) / (hi - lo || 1)) * (W - padL - padR);
  const Y = (c: number) => padT + (1 - (c - minC) / (maxC - minC)) * (Ht - padT - padB);
  const path = qs.map((q, i) => (i ? "L" : "M") + X(q).toFixed(1) + " " + Y(cs[i]).toFixed(1)).join(" ");
  const gridC = [0, 1, 2, 3].map((g) => minC + (g / 3) * (maxC - minC));
  const mark = (Q: number, col: string, lab: string, dash: boolean, key: string) => (
    <g key={key}>
      <line x1={X(Q)} y1={padT} x2={X(Q)} y2={Ht - padB} stroke={col} strokeWidth={1.4} strokeDasharray={dash ? "4 3" : undefined} />
      <text x={X(Q)} y={padT + 9} textAnchor="middle" fontSize={9} fill={col} fontFamily="var(--font-mono)">{lab}</text>
    </g>
  );
  return (
    <div className="panel">
      <h3>Expected cost vs. production quantity <span className="tg">why Q* is optimal</span></h3>
      <p className="ph">Each quantity&apos;s expected cost over 5,000 simulated demand outcomes. The minimum is exactly the newsvendor quantity — not the mean forecast.</p>
      <svg className="chart" viewBox={`0 0 ${W} ${Ht}`}>
        {gridC.map((c, i) => (
          <g key={i}>
            <line x1={padL} y1={Y(c)} x2={W - padR} y2={Y(c)} stroke="var(--line-2)" />
            <text x={padL - 7} y={Y(c) + 3} textAnchor="end" fontSize={9} fill="var(--faint)" fontFamily="var(--font-mono)">{money(c)}</text>
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--amber)" strokeWidth={2} />
        {mark(plan.QtoMean, "var(--faint)", "make-to-mean", true, "m")}
        {mark(plan.Qstar, "var(--ind)", "Q* = " + fmt(plan.Qstar), false, "q")}
        <circle cx={X(plan.Qstar)} cy={Y(plan.expectedCostStar)} r={4} fill="var(--ind)" />
      </svg>
    </div>
  );
}

export default function LoomReach() {
  const [source, setSource] = useState<Source>("apparel");
  const [items, setItems] = useState<SkuItem[]>(() => loadApparel());
  const [selected, setSelected] = useState(0);
  const [horizon, setHorizon] = useState(12);
  const [econOverride, setEconOverride] = useState<Record<string, Econ>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const econFor = (it: SkuItem): Econ => econOverride[it.id] || it.econ;

  // plan per SKU (memoized) — drives sparkline Q + the focus panels
  const plans = useMemo(() => {
    const map = new Map<string, Plan | null>();
    items.forEach((it) => {
      map.set(it.id, it.series.length >= 2 * M ? planSku(it.series, M, horizon, econFor(it), { seed: 7, nSamples: 5000 }) : null);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, horizon, econOverride]);

  const portfolio = useMemo(() => {
    let totNV = 0, totMean = 0, wins = 0, n = 0;
    items.forEach((it) => {
      if (it.series.length < 2 * M + horizon) return;
      const bt = backtest(it.series, M, horizon, econFor(it), { seed: 7, nSamples: 5000 });
      totNV += bt.scored.newsvendor.total; totMean += bt.scored.makeToMean.total;
      if (bt.scored.newsvendor.total <= bt.scored.makeToMean.total) wins++; n++;
    });
    return { totNV, totMean, wins, n, savedVsMean: totMean - totNV };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, horizon, econOverride]);

  function switchSource(s: Source) {
    setSource(s); setSelected(0); setEconOverride({}); setHorizon(12);
    if (s === "apparel") setItems(loadApparel());
    else if (s === "real") setItems(loadReal());
    else setItems([]);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const parsed = parseCSV(String(rd.result));
        if (!parsed.length) { alert("No numeric rows found. Expected columns like: sku, date, units."); return; }
        const longest = Math.max(...parsed.map((i) => i.series.length));
        setItems(parsed); setSelected(0); setEconOverride({}); setHorizon(Math.min(12, Math.max(1, longest - 2 * M)));
      } catch (err) { alert("Could not parse CSV: " + (err as Error).message); }
    };
    rd.readAsText(f);
  }

  function updateEcon(it: SkuItem, key: keyof Econ, value: number) {
    setEconOverride((prev) => ({ ...prev, [it.id]: { ...econFor(it), [key]: Math.max(0, value || 0) } }));
  }

  const it = items[Math.min(selected, Math.max(0, items.length - 1))];
  const plan = it ? plans.get(it.id) ?? null : null;
  const showRoll = items.length > 0 && items[0].series.length >= 2 * M + horizon;

  return (
    <>
      <header className="top">
        <div className="top-in">
          <div className="logo">
            <span className="mk">Loom<b>/</b>Reach</span>
            <span className="sub">Demand-driven production</span>
          </div>
          <span className="tag">working prototype</span>
          <div className="grow" />
          <div className="src">
            {(["apparel", "real", "upload"] as Source[]).map((s) => (
              <button key={s} className={s === source ? "on" : ""} onClick={() => switchSource(s)}>
                {s === "apparel" ? "Apparel catalog" : s === "real" ? "Real public data" : "Upload CSV"}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="intro">
        <h1>Stop guessing how much to make. <em>Decide it.</em></h1>
        <p>
          Loom Reach turns a SKU&apos;s sales history into a demand forecast with honest uncertainty, then solves the
          production quantity that minimizes the real cost of being wrong — too much (markdowns, deadstock) versus too little
          (lost margin). This is the engine behind &quot;demand-driven manufacturing&quot;: the math that decides the cut order.
        </p>
        <span className="stat"><TriangleAlert size={13} /> $70–140B of apparel is overproduced every year — McKinsey / BoF, State of Fashion 2025</span>
      </section>

      <main className="wrap">
        <aside className="cat">
          {showRoll && (
            <div className="roll">
              <div className="lab">Portfolio backtest · held-out season</div>
              <div className="big">{money(portfolio.savedVsMean)} saved</div>
              <div className="sub">
                vs. make-to-forecast, across <b>{portfolio.n}</b> SKU{portfolio.n > 1 ? "s" : ""} on the held-out season.
                Newsvendor was better on <b>{portfolio.wins}/{portfolio.n}</b> — it wins at portfolio scale, not every SKU.
              </div>
            </div>
          )}
          <div className="cat-head">
            <span className="ti">{source === "real" ? "Real public series" : source === "upload" ? "Your SKUs" : "Apparel catalog"}</span>
            <span className="ti mono">{items.length ? items.length + " SKU" + (items.length > 1 ? "s" : "") : ""}</span>
          </div>
          <div className="skus">
            {items.map((s, i) => {
              const p = plans.get(s.id);
              const diff = p ? p.Qstar - p.QtoMean : 0;
              return (
                <button key={s.id} className={"sku" + (i === selected ? " on" : "")} onClick={() => setSelected(i)}>
                  <div className="nm">{s.nm}</div>
                  <div className="meta">{s.cat}</div>
                  <Sparkline series={s.series} />
                  <div className="q">
                    <span className="mono" style={{ color: "var(--faint)", fontSize: 10 }}>PLAN</span>
                    <span className="qv">{p ? fmt(p.Qstar) + " u" : "—"}</span>
                    {p && <span className={"qd " + (diff >= 0 ? "up" : "dn")}>{diff >= 0 ? "+" : ""}{fmt(diff)} vs mean</span>}
                  </div>
                </button>
              );
            })}
          </div>
          {source === "upload" && (
            <div className="upload">
              <label className="drop">
                <Upload size={18} style={{ color: "var(--ind)" }} /><br />
                <b>Drop a CSV</b> or click to browse.<br />Plan production on your own SKUs.
                <div className="ex">columns: sku, date (YYYY-MM), units · ≥ 24 months recommended</div>
                <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} />
              </label>
            </div>
          )}
        </aside>

        <section className="focus">
          {!it && (
            <div className="panel">
              <h3>Upload a CSV to begin</h3>
              <p className="ph">Provide columns <code>sku, date (YYYY-MM), units</code> with at least ~24 months of history.</p>
            </div>
          )}
          {it && plan && (
            <>
              <ForecastChart it={it} plan={plan} horizon={horizon} />
              <DecisionPanel plan={plan} horizon={horizon} />
              <EconPanel it={it} econ={econFor(it)} horizon={horizon}
                onEcon={(k, v) => updateEcon(it, k, v)}
                onHorizon={(v) => setHorizon(Math.max(1, Math.min(v, it.series.length - 2 * M)))} />
              <CostCurveChart plan={plan} />
              <BacktestPanel it={it} econ={econFor(it)} horizon={horizon} />
              <Methodology />
            </>
          )}
          {it && !plan && (
            <div className="panel">
              <h3>Not enough history</h3>
              <p className="ph">This series needs at least {2 * M} months to fit a seasonal model. It has {it.series.length}.</p>
            </div>
          )}
        </section>
      </main>

      <p className="footnote">
        <b>What&apos;s real vs. illustrative:</b> the forecasting (Holt-Winters), the predictive distribution (residual bootstrap),
        and the newsvendor production-quantity optimization all run for real in your browser — verify with &quot;Real public data&quot; or your own CSV.
        The default <b>Apparel catalog is illustrative sample data</b> (clearly labeled) to tell the apparel story; the
        <b> Real public data</b> tab loads genuine published demand series. Cost assumptions (margin, salvage) are adjustable, not claims.
        <br /><span className="by">Built by <b>[your name]</b> · independent concept for the Anatar / Loom team.</span>
      </p>
    </>
  );
}

function DecisionPanel({ plan, horizon }: { plan: Plan; horizon: number }) {
  const nv = plan.newsvendor;
  const saveVsMean = plan.expectedCostMean - plan.expectedCostStar;
  const buffer = plan.Qstar - plan.QtoMean;
  return (
    <div className="panel">
      <h3>The decision <span className="tg">newsvendor optimum</span></h3>
      <p className="ph">How many units to produce for the next {horizon}-month season — the quantity that minimizes expected cost given demand uncertainty.</p>
      <div className="decgrid">
        <div className="qbox">
          <div className="lab">Recommended production</div>
          <div className="big">{fmt(plan.Qstar)} <small>units</small></div>
          <div className="cmp">
            <div className="row"><span className="k">Make-to-forecast (mean)</span><span className="v">{fmt(plan.QtoMean)}</span></div>
            <div className="row"><span className="k">Buffer for uncertainty</span><span className="v">{buffer >= 0 ? "+" : ""}{fmt(buffer)} u</span></div>
            <div className="row"><span className="k">Expected cost saved vs mean</span><span className="v" style={{ color: "var(--good)" }}>{money(saveVsMean)}</span></div>
          </div>
        </div>
        <div className="gauge">
          <div className="lab">Critical ratio · Cu / (Cu+Co)</div>
          <div className="crbar"><div className="pin" style={{ left: (nv.criticalRatio * 100).toFixed(1) + "%" }} /></div>
          <div className="crrow"><span>overstock-averse</span><span className="mono" style={{ color: "var(--ink)", fontWeight: 600 }}>{(nv.criticalRatio * 100).toFixed(1)}%</span><span>stockout-averse</span></div>
          <div className="cuco">
            <div><div className="k">Cu · lost margin/unit</div><div className="v">${fmt(nv.Cu)}</div></div>
            <div><div className="k">Co · overstock loss/unit</div><div className="v">${fmt(nv.Co)}</div></div>
          </div>
          <div className="mt">Stockouts cost {nv.Co > 0 ? (nv.Cu / nv.Co).toFixed(1) : "∞"}× an overstock here, so the optimal plan {plan.Qstar >= plan.QtoMean ? "builds a buffer above" : "trims below"} the mean forecast.</div>
        </div>
      </div>
    </div>
  );
}

function EconPanel({ it, econ, horizon, onEcon, onHorizon }: {
  it: SkuItem; econ: Econ; horizon: number;
  onEcon: (k: keyof Econ, v: number) => void; onHorizon: (v: number) => void;
}) {
  const field = (k: keyof Econ, label: string, pre: string) => (
    <div className="f">
      <label>{label}</label>
      <div className="inp"><span>{pre}</span>
        <input type="number" min={0} step={1} defaultValue={econ[k]} key={it.id + k + econ[k]}
          onChange={(e) => onEcon(k, parseFloat(e.target.value))} />
      </div>
    </div>
  );
  return (
    <div className="panel">
      <h3>Unit economics <span className="tg">drives the trade-off</span></h3>
      <p className="ph">Adjust the cost of being wrong. These set Cu and Co — the only thing that separates the optimal quantity from a naive forecast.</p>
      <div className="econ">
        {field("price", "Retail price", "$")}
        {field("unitCost", "Unit cost", "$")}
        {field("salvage", "Salvage / markdown recovery", "$")}
        <div className="f">
          <label>Season length (months)</label>
          <div className="inp"><span></span>
            <input type="number" min={1} max={Math.max(1, it.series.length - 2 * M)} step={1} defaultValue={horizon}
              key={it.id + "h" + horizon} onChange={(e) => onHorizon(parseInt(e.target.value) || 12)} />
          </div>
        </div>
      </div>
      <div className="mt">
        Cu = price − unit cost (margin lost on a stockout) · Co = unit cost − salvage (lost when overstock is liquidated).
        {it.real ? "" : " Defaults reflect typical apparel economics (≈60% gross margin, ~30% salvage); change them to your real numbers."}
      </div>
    </div>
  );
}

function BacktestPanel({ it, econ, horizon }: { it: SkuItem; econ: Econ; horizon: number }) {
  if (it.series.length < 2 * M + horizon) {
    return (
      <div className="panel">
        <h3>Backtest</h3>
        <p className="ph">Needs at least {2 * M + horizon} months of history (two seasons to learn + one to hold out). This series has {it.series.length}.</p>
      </div>
    );
  }
  const bt = backtest(it.series, M, horizon, econ, { seed: 7, nSamples: 5000 });
  const rows: [string, string][] = [
    ["newsvendor", "Loom Reach (newsvendor)"],
    ["makeToMean", "Make-to-forecast"],
    ["lastSeasonPlus10", "Last season + 10%"],
    ["runRate", "Recent run-rate"],
  ];
  const totals = rows.map(([k]) => bt.scored[k].total);
  const maxCost = Math.max(...totals) || 1;
  const nvWon = bt.scored.newsvendor.total <= bt.scored.makeToMean.total;
  return (
    <div className="panel">
      <h3>Backtest <span className="tg">held-out last {horizon} months</span></h3>
      <p className="ph">Train on history up to the last season, decide a quantity, then score each strategy against what actually sold.</p>
      <div className="bt">
        <div className="btbars">
          {rows.map(([k, lab]) => {
            const sc = bt.scored[k];
            const w = (sc.total / maxCost) * 100;
            const fill = k === "newsvendor" ? "" : sc.total >= maxCost * 0.999 ? "worst" : k === "makeToMean" ? "neutral" : "bad";
            return (
              <div key={k} className={"btbar" + (k === "newsvendor" ? " best" : "")}>
                <div className="nm">
                  {k === "newsvendor" ? <b>{lab}</b> : lab}<br />
                  <span className="mono" style={{ fontSize: 10, color: "var(--faint)" }}>make {fmt(sc.Q)} u</span>
                </div>
                <div className="track"><i className={fill} style={{ width: w.toFixed(0) + "%" }} /></div>
                <div className="cost">{money(sc.total)}</div>
              </div>
            );
          })}
        </div>
        <div className={"note" + (nvWon ? " good" : "")}>
          {nvWon ? (
            <><b>On this held-out season, Loom Reach was cheapest.</b> Actual demand came in at {fmt(bt.actualDemand)} units; the newsvendor plan absorbed it with the least combined markdown + lost-margin cost.</>
          ) : (
            <><b>On this single season, the naive plan happened to win.</b> Actual demand ({fmt(bt.actualDemand)} u) landed below the forecast, so the uncertainty buffer cost money here. That&apos;s expected — newsvendor minimizes <em>expected</em> cost and wins across the portfolio (see the rollup), not on every individual coin-flip. Showing this honestly is the point.</>
          )}
        </div>
      </div>
    </div>
  );
}

function Methodology() {
  return (
    <details className="meth">
      <summary>Methodology — what&apos;s real, what&apos;s illustrative, and how it maps to production</summary>
      <div className="body">
        <p><span className="real">Real (runs in your browser):</span></p>
        <ul>
          <li><b>Forecast</b> — Holt-Winters additive (level/trend/seasonal), with a coarse grid search over smoothing parameters to minimize in-sample RMSE.</li>
          <li><b>Uncertainty</b> — a predictive distribution of season demand via <b>residual bootstrap</b> (5,000 draws), not a point guess.</li>
          <li><b>Decision</b> — the <b>newsvendor</b> optimum: Q* = F⁻¹(Cu/(Cu+Co)), the quantity minimizing expected overage + underage cost. Verified against standard references.</li>
          <li><b>Backtest</b> — true hold-out: train on all but the last season, decide, score on realized demand vs. three naive baselines a planner actually uses.</li>
        </ul>
        <p><span className="ill">Illustrative:</span> the default <b>Apparel catalog</b> is seeded sample data with realistic seasonal patterns — used only to demonstrate the engine on apparel. The <b>Real public data</b> tab runs the identical engine on genuine published demand series so you can confirm it works on real numbers. <b>Cost inputs</b> (margin, salvage) are adjustable assumptions, not claims.</p>
        <p><b>Path to production at Loom:</b> swap the bundled series for Loom&apos;s captured sell-through (POS / Shopify / ERP), keep this exact decision core, and emit the recommended cut quantity per SKU into the production schedule. The hard part — turning noisy demand into a defensible quantity with its uncertainty — is what&apos;s already built here.</p>
      </div>
    </details>
  );
}
