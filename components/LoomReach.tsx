"use client";

import { useMemo, useRef, useState } from "react";
import { Upload, TriangleAlert } from "lucide-react";
import { newsvendor, quantile, avg, expectedCost, realizedCost, type Econ } from "@/lib/engine";
import { runForecast, type ForecastResult } from "@/lib/forecast";
import { loadApparel, loadReal, parseCSV, type SkuItem } from "@/lib/data";

const M = 12;
type Source = "apparel" | "real" | "upload";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const money = (n: number) => (n < 0 ? "-" : "") + "$" + fmt(Math.abs(n));
const pct = (n: number) => (n >= 0 ? "+" : "") + (n * 100).toFixed(1) + "%";

interface Decision { nv: ReturnType<typeof newsvendor>; Qstar: number; QtoMean: number; meanDemand: number; expectedCostStar: number; expectedCostMean: number; }
function decide(samples: number[], econ: Econ): Decision {
  const nv = newsvendor(econ);
  const Qstar = Math.round(quantile(samples, nv.criticalRatio));
  const meanDemand = avg(samples);
  const QtoMean = Math.round(meanDemand);
  return { nv, Qstar, QtoMean, meanDemand, expectedCostStar: expectedCost(Qstar, samples, nv.Cu, nv.Co), expectedCostMean: expectedCost(QtoMean, samples, nv.Cu, nv.Co) };
}

interface Holdout { samples: number[]; actual: number; }
interface Compute { fc: ForecastResult; holdout: Holdout | null; }

function Sparkline({ series }: { series: number[] }) {
  const w = 74, h = 34;
  const min = Math.min(...series), max = Math.max(...series), rng = max - min || 1;
  const d = series.map((v, i) => { const x = (i / (series.length - 1)) * w; const y = h - ((v - min) / rng) * h; return (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1); }).join(" ");
  return <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"><path d={d} fill="none" stroke="var(--ind)" strokeWidth={1.4} strokeLinejoin="round" /></svg>;
}

function ForecastChart({ it, fc, horizon }: { it: SkuItem; fc: ForecastResult; horizon: number }) {
  const hist = it.series, H = horizon, n = hist.length;
  const bands = fc.bands;
  const W = 720, Ht = 240, padL = 46, padR = 14, padT = 12, padB = 26;
  const maxV = Math.max(...hist.concat(bands.map((b) => b.p90))) * 1.06 || 1;
  const minV = 0, totalX = n + H;
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
        <span className="src2">{it.real ? "● real" : "○ illustrative"} · {it.src} · {n} months · won by <b style={{ color: "var(--ind-2)" }}>{fc.selectedLabel}</b>{fc.hwParams ? ` · α=${fc.hwParams.alpha} β=${fc.hwParams.beta} γ=${fc.hwParams.gamma}` : ""}</span>
      </div>
      <svg className="chart" viewBox={`0 0 ${W} ${Ht}`}>
        {gridV.map((v, i) => (<g key={i}><line x1={padL} y1={Y(v)} x2={W - padR} y2={Y(v)} stroke="var(--line-2)" /><text x={padL - 7} y={Y(v) + 3} textAnchor="end" fontSize={9} fill="var(--faint)" fontFamily="var(--font-mono)">{fmt(v)}</text></g>))}
        <line x1={sep} y1={padT} x2={sep} y2={Ht - padB} stroke="var(--line)" strokeDasharray="3 3" />
        <polygon points={bandPts} fill="rgba(46,74,134,.13)" stroke="none" />
        <path d={histPath} fill="none" stroke="var(--ink)" strokeWidth={1.7} />
        <path d={connector} fill="none" stroke="var(--ind)" strokeWidth={1.7} strokeDasharray="4 3" />
        <path d={medPath} fill="none" stroke="var(--ind)" strokeWidth={1.7} strokeDasharray="4 3" />
        {labIdx.map((i, k) => it.labels[i] ? <text key={k} x={X(i)} y={Ht - 7} textAnchor="middle" fontSize={9} fill="var(--faint)" fontFamily="var(--font-mono)">{it.labels[i]}</text> : null)}
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

const MODEL_BLURB: Record<string, string> = {
  smooth: "regular, stable demand — classical time-series models fit well.",
  erratic: "regular timing but volatile size — wide intervals, lean on the distribution.",
  intermittent: "many zero periods — point accuracy misleads, so Croston/SBA is used.",
  lumpy: "sporadic and volatile — hardest case; Croston/SBA + a wide distribution.",
  new: "short history — limited model choice until more data accrues.",
};

function BrainPanel({ fc }: { fc: ForecastResult }) {
  const c = fc.classification;
  const drivers = fc.drivers.filter((d) => isFinite(d.coef));
  const maxAbs = Math.max(1e-6, ...drivers.map((d) => Math.abs(d.coef)));
  const skillGood = fc.skillVsNaive > 0.001;
  return (
    <div className="panel">
      <h3>The forecasting brain <span className="tg">model competition</span></h3>
      <p className="ph">Five methods compete; the winner is chosen per-SKU by rolling-origin cross-validation. Accuracy is measured against a seasonal-naive benchmark — the number to beat.</p>
      <div className="metrics">
        <div className="metric"><div className={"v " + (skillGood ? "good" : "amber")}>{skillGood ? pct(fc.skillVsNaive) : "≈ naive"}</div><div className="k">accuracy vs seasonal-naive</div></div>
        <div className="metric"><div className="v ind">{isFinite(fc.accuracy.mase) ? fc.accuracy.mase.toFixed(2) : "—"}</div><div className="k">MASE (lower better)</div></div>
        <div className="metric"><div className="v ind">{isFinite(fc.accuracy.wape) ? (fc.accuracy.wape * 100).toFixed(1) + "%" : "—"}</div><div className="k">WAPE</div></div>
        <div className="metric"><div className="v ind">{isFinite(fc.accuracy.bias) ? pct(fc.accuracy.bias) : "—"}</div><div className="k">forecast bias</div></div>
        <div className="metric" style={{ alignSelf: "center" }}><span className={"pill " + c.label}>{c.label}{isFinite(c.adi) ? ` · ADI ${c.adi.toFixed(1)} · CV² ${c.cv2.toFixed(2)}` : ""}</span></div>
      </div>
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
      <div className="mt">Demand pattern: <b>{c.label}</b> — {MODEL_BLURB[c.label]}</div>
      {drivers.length > 0 && (
        <>
          <h3 style={{ marginTop: 16 }}>Demand drivers <span className="tg">standardized effect</span></h3>
          <p className="ph">What moves this SKU&apos;s sales, holding the rest fixed — learned by the driver-regression model.</p>
          <div className="drv">
            {drivers.map((d) => {
              const w = Math.min(50, (Math.abs(d.coef) / maxAbs) * 50);
              const pos = d.coef >= 0;
              return (
                <div className="drvrow" key={d.name}>
                  <span className="dn">{d.name}</span>
                  <div className="drvbar"><div className="mid" /><i className={pos ? "pos" : "neg"} style={pos ? { left: "50%", width: w + "%" } : { left: 50 - w + "%", width: w + "%" }} /></div>
                  <span className="drvval">{d.coef >= 0 ? "+" : ""}{d.coef.toFixed(1)}</span>
                </div>
              );
            })}
          </div>
          <div className="mt">Positive = lifts demand. Promotions and lower price should push right; a negative price coefficient is price elasticity (cheaper → sells more).</div>
        </>
      )}
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

  // forecasts are expensive and econ-INDEPENDENT → memoize on [items, horizon] only.
  const compute = useMemo(() => {
    const map = new Map<string, Compute>();
    items.forEach((it) => {
      if (it.series.length < M + 2) return;
      const fc = runForecast(it.series, M, horizon, { drivers: it.drivers, seed: 7, nSamples: 5000 });
      let holdout: Holdout | null = null;
      if (it.series.length >= 2 * M + horizon) {
        const train = it.series.slice(0, it.series.length - horizon);
        const hf = runForecast(train, M, horizon, { drivers: it.drivers, seed: 7, nSamples: 5000 });
        holdout = { samples: hf.samples, actual: it.series.slice(it.series.length - horizon).reduce((a, b) => a + b, 0) };
      }
      map.set(it.id, { fc, holdout });
    });
    return map;
  }, [items, horizon]);

  const scoreHoldout = (it: SkuItem, h: Holdout, econ: Econ) => {
    const nv = newsvendor(econ);
    const Qstar = Math.round(quantile(h.samples, nv.criticalRatio));
    const QtoMean = Math.round(avg(h.samples));
    const train = it.series.slice(0, it.series.length - horizon);
    const prevSeason = train.slice(train.length - horizon).reduce((a, b) => a + b, 0);
    const QlastPlus = Math.round(prevSeason * 1.1);
    const QrunRate = Math.round(avg(train.slice(train.length - horizon)) * horizon);
    return {
      actual: h.actual,
      scored: {
        newsvendor: realizedCost(Qstar, h.actual, nv.Cu, nv.Co),
        makeToMean: realizedCost(QtoMean, h.actual, nv.Cu, nv.Co),
        lastSeasonPlus10: realizedCost(QlastPlus, h.actual, nv.Cu, nv.Co),
        runRate: realizedCost(QrunRate, h.actual, nv.Cu, nv.Co),
      },
    };
  };

  const portfolio = useMemo(() => {
    let totNV = 0, totMean = 0, wins = 0, n = 0;
    items.forEach((it) => {
      const cm = compute.get(it.id); if (!cm?.holdout) return;
      const bt = scoreHoldout(it, cm.holdout, econFor(it));
      totNV += bt.scored.newsvendor.total; totMean += bt.scored.makeToMean.total;
      if (bt.scored.newsvendor.total <= bt.scored.makeToMean.total) wins++; n++;
    });
    return { totNV, totMean, wins, n, savedVsMean: totMean - totNV };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compute, econOverride, items]);

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
  const cm = it ? compute.get(it.id) : undefined;
  const showRoll = portfolio.n > 0;

  return (
    <>
      <header className="top">
        <div className="top-in">
          <div className="logo"><span className="mk">Loom<b>/</b>Reach</span><span className="sub">Demand-driven production</span></div>
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
        <p>Loom Reach runs a competition of forecasting models, picks the best one per SKU by cross-validation, quantifies the uncertainty, and solves the production quantity that minimizes the real cost of being wrong — too much (markdowns, deadstock) vs. too little (lost margin).</p>
        <span className="stat"><TriangleAlert size={13} /> $70–140B of apparel is overproduced every year — McKinsey / BoF, State of Fashion 2025</span>
      </section>

      <main className="wrap">
        <aside className="cat">
          {showRoll && (
            <div className="roll">
              <div className="lab">Portfolio backtest · held-out season</div>
              <div className="big">{money(portfolio.savedVsMean)} saved</div>
              <div className="sub">vs. make-to-forecast, across <b>{portfolio.n}</b> SKU{portfolio.n > 1 ? "s" : ""} on the held-out season. Newsvendor was better on <b>{portfolio.wins}/{portfolio.n}</b> — it wins at portfolio scale, not every SKU.</div>
            </div>
          )}
          <div className="cat-head">
            <span className="ti">{source === "real" ? "Real public series" : source === "upload" ? "Your SKUs" : "Apparel catalog"}</span>
            <span className="ti mono">{items.length ? items.length + " SKU" + (items.length > 1 ? "s" : "") : ""}</span>
          </div>
          <div className="skus">
            {items.map((s, i) => {
              const c = compute.get(s.id);
              const d = c ? decide(c.fc.samples, econFor(s)) : null;
              const diff = d ? d.Qstar - d.QtoMean : 0;
              return (
                <button key={s.id} className={"sku" + (i === selected ? " on" : "")} onClick={() => setSelected(i)}>
                  <div className="nm">{s.nm}</div>
                  <div className="meta">{s.cat}{c ? " · " + c.fc.selectedLabel.split(" ")[0] : ""}</div>
                  <Sparkline series={s.series} />
                  <div className="q">
                    <span className="mono" style={{ color: "var(--faint)", fontSize: 10 }}>PLAN</span>
                    <span className="qv">{d ? fmt(d.Qstar) + " u" : "—"}</span>
                    {d && <span className={"qd " + (diff >= 0 ? "up" : "dn")}>{diff >= 0 ? "+" : ""}{fmt(diff)} vs mean</span>}
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
          {!it && (<div className="panel"><h3>Upload a CSV to begin</h3><p className="ph">Provide columns <code>sku, date (YYYY-MM), units</code> with at least ~24 months of history.</p></div>)}
          {it && cm && (
            <>
              <ForecastChart it={it} fc={cm.fc} horizon={horizon} />
              <BrainPanel fc={cm.fc} />
              <DecisionPanel plan={decide(cm.fc.samples, econFor(it))} horizon={horizon} />
              <EconPanel it={it} econ={econFor(it)} horizon={horizon} onEcon={(k, v) => updateEcon(it, k, v)} onHorizon={(v) => setHorizon(Math.max(1, Math.min(v, it.series.length - 2 * M)))} />
              <CostCurveChart samples={cm.fc.samples} plan={decide(cm.fc.samples, econFor(it))} />
              <BacktestPanel it={it} cm={cm} econ={econFor(it)} horizon={horizon} score={scoreHoldout} />
              <Methodology />
            </>
          )}
          {it && !cm && (<div className="panel"><h3>Not enough history</h3><p className="ph">This series needs at least {M + 2} months. It has {it.series.length}.</p></div>)}
        </section>
      </main>

      <p className="footnote">
        <b>What&apos;s real vs. illustrative:</b> the model competition (seasonal-naive, Holt-Winters ETS, multiplicative ETS, Croston/SBA, driver regression, combination), the rolling-origin cross-validation that selects the winner, the demand classification, the driver coefficients, and the newsvendor optimization all run for real in your browser. The default <b>Apparel catalog is illustrative sample data</b> (clearly labeled); <b>Real public data</b> runs the identical brain on genuine published series; <b>Upload CSV</b> runs it on yours. Cost assumptions (margin, salvage) are adjustable, not claims.
        <br /><span className="by">Built by <b>[your name]</b> · independent concept for the Anatar / Loom team.</span>
      </p>
    </>
  );
}

function DecisionPanel({ plan, horizon }: { plan: Decision; horizon: number }) {
  const nv = plan.nv;
  const saveVsMean = plan.expectedCostMean - plan.expectedCostStar;
  const buffer = plan.Qstar - plan.QtoMean;
  return (
    <div className="panel">
      <h3>The decision <span className="tg">newsvendor optimum</span></h3>
      <p className="ph">How many units to produce for the next {horizon}-month season — the quantity that minimizes expected cost given the winning model&apos;s demand distribution.</p>
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

function EconPanel({ it, econ, horizon, onEcon, onHorizon }: { it: SkuItem; econ: Econ; horizon: number; onEcon: (k: keyof Econ, v: number) => void; onHorizon: (v: number) => void; }) {
  const field = (k: keyof Econ, label: string, pre: string) => (
    <div className="f"><label>{label}</label><div className="inp"><span>{pre}</span>
      <input type="number" min={0} step={1} defaultValue={econ[k]} key={it.id + k + econ[k]} onChange={(e) => onEcon(k, parseFloat(e.target.value))} /></div></div>
  );
  return (
    <div className="panel">
      <h3>Unit economics <span className="tg">drives the trade-off</span></h3>
      <p className="ph">Adjust the cost of being wrong. These set Cu and Co — the only thing that separates the optimal quantity from a naive forecast.</p>
      <div className="econ">
        {field("price", "Retail price", "$")}
        {field("unitCost", "Unit cost", "$")}
        {field("salvage", "Salvage / markdown recovery", "$")}
        <div className="f"><label>Season length (months)</label><div className="inp"><span></span>
          <input type="number" min={1} max={Math.max(1, it.series.length - 2 * M)} step={1} defaultValue={horizon} key={it.id + "h" + horizon} onChange={(e) => onHorizon(parseInt(e.target.value) || 12)} /></div></div>
      </div>
      <div className="mt">Cu = price − unit cost (margin lost on a stockout) · Co = unit cost − salvage (lost when overstock is liquidated).{it.real ? "" : " Defaults reflect typical apparel economics (≈60% gross margin, ~30% salvage); change them to your real numbers."}</div>
    </div>
  );
}

function CostCurveChart({ samples, plan }: { samples: number[]; plan: Decision }) {
  const nv = plan.nv;
  const lo = quantile(samples, 0.01), hi = quantile(samples, 0.99);
  const STEPS = 60; const qs: number[] = [], cs: number[] = [];
  for (let i = 0; i <= STEPS; i++) { const Q = lo + (i / STEPS) * (hi - lo); qs.push(Q); cs.push(expectedCost(Q, samples, nv.Cu, nv.Co)); }
  const W = 720, Ht = 210, padL = 52, padR = 14, padT = 12, padB = 26;
  const maxC = Math.max(...cs) * 1.05 || 1, minC = 0;
  const X = (q: number) => padL + ((q - lo) / (hi - lo || 1)) * (W - padL - padR);
  const Y = (c: number) => padT + (1 - (c - minC) / (maxC - minC)) * (Ht - padT - padB);
  const path = qs.map((q, i) => (i ? "L" : "M") + X(q).toFixed(1) + " " + Y(cs[i]).toFixed(1)).join(" ");
  const gridC = [0, 1, 2, 3].map((g) => minC + (g / 3) * (maxC - minC));
  const mark = (Q: number, col: string, lab: string, dash: boolean, key: string) => (
    <g key={key}><line x1={X(Q)} y1={padT} x2={X(Q)} y2={Ht - padB} stroke={col} strokeWidth={1.4} strokeDasharray={dash ? "4 3" : undefined} /><text x={X(Q)} y={padT + 9} textAnchor="middle" fontSize={9} fill={col} fontFamily="var(--font-mono)">{lab}</text></g>
  );
  return (
    <div className="panel">
      <h3>Expected cost vs. production quantity <span className="tg">why Q* is optimal</span></h3>
      <p className="ph">Each quantity&apos;s expected cost over 5,000 simulated demand outcomes from the winning model. The minimum is exactly the newsvendor quantity — not the mean forecast.</p>
      <svg className="chart" viewBox={`0 0 ${W} ${Ht}`}>
        {gridC.map((c, i) => (<g key={i}><line x1={padL} y1={Y(c)} x2={W - padR} y2={Y(c)} stroke="var(--line-2)" /><text x={padL - 7} y={Y(c) + 3} textAnchor="end" fontSize={9} fill="var(--faint)" fontFamily="var(--font-mono)">{money(c)}</text></g>))}
        <path d={path} fill="none" stroke="var(--amber)" strokeWidth={2} />
        {mark(plan.QtoMean, "var(--faint)", "make-to-mean", true, "m")}
        {mark(plan.Qstar, "var(--ind)", "Q* = " + fmt(plan.Qstar), false, "q")}
        <circle cx={X(plan.Qstar)} cy={Y(plan.expectedCostStar)} r={4} fill="var(--ind)" />
      </svg>
    </div>
  );
}

function BacktestPanel({ it, cm, econ, horizon, score }: { it: SkuItem; cm: Compute; econ: Econ; horizon: number; score: (it: SkuItem, h: Holdout, econ: Econ) => { actual: number; scored: Record<string, ReturnType<typeof realizedCost>> }; }) {
  if (!cm.holdout) {
    return (<div className="panel"><h3>Backtest</h3><p className="ph">Needs at least {2 * M + horizon} months of history (two seasons to learn + one to hold out). This series has {it.series.length}.</p></div>);
  }
  const bt = score(it, cm.holdout, econ);
  const rows: [string, string][] = [["newsvendor", "Loom Reach (newsvendor)"], ["makeToMean", "Make-to-forecast"], ["lastSeasonPlus10", "Last season + 10%"], ["runRate", "Recent run-rate"]];
  const totals = rows.map(([k]) => bt.scored[k].total);
  const maxCost = Math.max(...totals) || 1;
  const nvWon = bt.scored.newsvendor.total <= bt.scored.makeToMean.total;
  return (
    <div className="panel">
      <h3>Backtest <span className="tg">held-out last {horizon} months</span></h3>
      <p className="ph">Train the whole brain on history up to the last season, decide a quantity, then score each strategy against what actually sold.</p>
      <div className="bt">
        <div className="btbars">
          {rows.map(([k, lab]) => {
            const sc = bt.scored[k];
            const w = (sc.total / maxCost) * 100;
            const fill = k === "newsvendor" ? "" : sc.total >= maxCost * 0.999 ? "worst" : k === "makeToMean" ? "neutral" : "bad";
            return (
              <div key={k} className={"btbar" + (k === "newsvendor" ? " best" : "")}>
                <div className="nm">{k === "newsvendor" ? <b>{lab}</b> : lab}<br /><span className="mono" style={{ fontSize: 10, color: "var(--faint)" }}>make {fmt(sc.Q)} u</span></div>
                <div className="track"><i className={fill} style={{ width: w.toFixed(0) + "%" }} /></div>
                <div className="cost">{money(sc.total)}</div>
              </div>
            );
          })}
        </div>
        <div className={"note" + (nvWon ? " good" : "")}>
          {nvWon ? (<><b>On this held-out season, Loom Reach was cheapest.</b> Actual demand came in at {fmt(bt.actual)} units; the newsvendor plan absorbed it with the least combined markdown + lost-margin cost.</>)
            : (<><b>On this single season, the naive plan happened to win.</b> Actual demand ({fmt(bt.actual)} u) landed below the forecast, so the uncertainty buffer cost money here. That&apos;s expected — newsvendor minimizes <em>expected</em> cost and wins across the portfolio (see the rollup), not on every individual coin-flip. Showing this honestly is the point.</>)}
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
          <li><b>Model competition</b> — Seasonal-Naive, Holt-Winters ETS (additive + log/multiplicative), Croston/SBA for intermittent demand, a driver ridge-regression (Fourier seasonality + trend + price + promo), and a forecast combination.</li>
          <li><b>Selection</b> — rolling-origin cross-validation scores each model by <b>MASE / WAPE / bias</b>; the winner is chosen per-SKU. Intermittent/lumpy demand is routed to Croston (point metrics mislead there).</li>
          <li><b>Classification</b> — ADI / CV² (Syntetos–Boylan–Croston) labels each SKU smooth / erratic / intermittent / lumpy.</li>
          <li><b>Drivers</b> — standardized regression coefficients quantify price elasticity and promo lift.</li>
          <li><b>Decision</b> — the winning model&apos;s residual-bootstrap predictive distribution feeds the <b>newsvendor</b> optimum Q* = F⁻¹(Cu/(Cu+Co)); a true hold-out backtest scores it vs. naive baselines.</li>
        </ul>
        <p><span className="ill">Illustrative:</span> the default <b>Apparel catalog</b> is seeded sample data with realistic seasonality + promo/price drivers. <b>Real public data</b> runs the identical engine on genuine published demand series; <b>Cost inputs</b> are adjustable assumptions.</p>
        <p><b>Path to production at Loom:</b> swap the bundled series for Loom&apos;s captured sell-through (POS / Shopify / ERP), keep this exact brain + decision core, and emit the recommended cut quantity per SKU into the production schedule.</p>
      </div>
    </details>
  );
}
