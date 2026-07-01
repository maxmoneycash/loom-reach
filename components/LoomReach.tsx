"use client";

import { useMemo, useState, type CSSProperties } from "react";
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
interface Compute { fc: ForecastResult; holdouts: Holdout[]; }

function Sheet({ no, name, right, children }: { no: string; name: string; right?: string; children: React.ReactNode }) {
  return (
    <section className="sheet">
      <div className="tblock"><span className="no">{no}</span><span className="sig">{name}</span>{right && <span className="r">{right}</span>}</div>
      {children}
    </section>
  );
}

function Sparkline({ series }: { series: number[] }) {
  const w = 100, h = 30;
  const min = Math.min(...series), max = Math.max(...series), rng = max - min || 1;
  const d = series.map((v, i) => { const x = (i / (series.length - 1)) * w; const y = h - ((v - min) / rng) * h; return (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1); }).join(" ");
  return <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"><path d={d} fill="none" stroke="var(--signal)" strokeWidth={1.4} strokeLinejoin="round" /></svg>;
}

function ForecastChart({ it, fc, horizon }: { it: SkuItem; fc: ForecastResult; horizon: number }) {
  const hist = it.series, H = horizon, n = hist.length, bands = fc.bands;
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
  return (
    <>
      <svg className="chart" viewBox={`0 0 ${W} ${Ht}`}>
        {gridV.map((v, i) => (<g key={i}><line x1={padL} y1={Y(v)} x2={W - padR} y2={Y(v)} stroke="var(--line-2)" /><text x={padL - 7} y={Y(v) + 3} textAnchor="end" fontSize={9} fill="var(--faint)" fontFamily="var(--mono)">{fmt(v)}</text></g>))}
        <line x1={sep} y1={padT} x2={sep} y2={Ht - padB} stroke="var(--line)" strokeDasharray="2 3" />
        <polygon points={bandPts} fill="var(--blue)" fillOpacity={0.13} stroke="none" />
        <path d={histPath} fill="none" stroke="var(--ink)" strokeWidth={1.8} />
        <path className="fpath" style={{ ["--len" as string]: 1400 } as CSSProperties} d={medPath} fill="none" stroke="var(--signal)" strokeWidth={2.1} strokeLinecap="round" />
        {labIdx.map((i, k) => it.labels[i] ? <text key={k} x={X(i)} y={Ht - 7} textAnchor="middle" fontSize={9} fill="var(--faint)" fontFamily="var(--mono)">{it.labels[i]}</text> : null)}
        <text x={X(n + H - 1)} y={Ht - 7} textAnchor="end" fontSize={9} fill="var(--signal-ink)" fontFamily="var(--mono)">+{H}mo</text>
      </svg>
      <div className="legend">
        <span><i style={{ background: "var(--ink)" }} />actual</span>
        <span><i style={{ background: "var(--signal)" }} />forecast · {fc.selectedLabel}</span>
        <span><i style={{ background: "var(--blue)", opacity: 0.4 }} />P10–P90 interval</span>
      </div>
    </>
  );
}

const CLASS_BLURB: Record<string, string> = {
  smooth: "regular, stable demand — classical time-series models fit well.",
  erratic: "regular timing but volatile size — lean on the distribution, not the point.",
  intermittent: "many zero periods — point accuracy misleads, so Croston/SBA is used.",
  lumpy: "sporadic and volatile — hardest case; Croston/SBA + a wide interval.",
  new: "short history — limited model choice until more data accrues.",
};

export default function LoomReach() {
  const [source, setSource] = useState<Source>("apparel");
  const [items, setItems] = useState<SkuItem[]>(() => loadApparel());
  const [selected, setSelected] = useState(0);
  const [horizon, setHorizon] = useState(12);
  const [econOverride, setEconOverride] = useState<Record<string, Econ>>({});

  const econFor = (it: SkuItem): Econ => econOverride[it.id] || it.econ;

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

  const scoreHoldout = (it: SkuItem, h: Holdout, econ: Econ) => {
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
  };

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compute, econOverride, items]);

  function switchSource(s: Source) {
    setSource(s); setSelected(0); setEconOverride({}); setHorizon(12);
    setItems(s === "apparel" ? loadApparel() : s === "real" ? loadReal() : []);
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
  const setEcon = (it: SkuItem, key: keyof Econ, value: number) => setEconOverride((p) => ({ ...p, [it.id]: { ...econFor(it), [key]: Math.max(0, value || 0) } }));

  const it = items[Math.min(selected, Math.max(0, items.length - 1))];
  const cm = it ? compute.get(it.id) : undefined;
  const showRoll = portfolio.n > 0;

  return (
    <>
      <header className="bar">
        <div className="bar-in">
          <div className="brand"><span className="mk">Loom<b>/</b>Reach</span><span className="sub">demand-driven production</span></div>
          <span className="tag">prototype</span>
          <div className="grow" />
          <div className="seg">
            {(["apparel", "real", "upload"] as Source[]).map((s) => (
              <button key={s} className={s === source ? "on" : ""} onClick={() => switchSource(s)}>{s === "apparel" ? "Catalog" : s === "real" ? "Real data" : "Upload"}</button>
            ))}
          </div>
        </div>
      </header>

      <div className="shell">
        <section className="intro">
          <h1>How many do you <em>actually</em> make?</h1>
          <p>Loom Reach runs a competition of forecasting models, picks the best per SKU by cross-validation, quantifies the uncertainty, and solves the production quantity that minimizes the cost of being wrong.</p>
          <span className="warn"><TriangleAlert size={13} /> $70–140B of apparel is overproduced yearly · McKinsey / BoF 2025</span>
        </section>

        {showRoll && (
          <div className="summary">
            <div className="strip"><span>Portfolio backtest — rolling held-out seasons</span><span className="r">{portfolio.wins}/{portfolio.n} improved</span></div>
            <div className="body">
              <span className="big">{money(portfolio.savedVsMean)}</span>
              <span className="txt">saved vs. make-to-forecast across <b>{portfolio.n}</b> held-out season{portfolio.n > 1 ? "s" : ""} ({items.length} SKUs × rolling origins). Newsvendor wins at portfolio scale, not on every one — it minimizes <b>expected</b> cost.</span>
            </div>
          </div>
        )}

        <div className="railhead">
          <span className="t">{source === "real" ? "Real public series" : source === "upload" ? "Your SKUs" : "Catalog"}</span>
          <span className="t mono">{items.length ? "◂ swipe · " + items.length + " ▸" : ""}</span>
        </div>
        {source === "upload" && (
          <label className="drop">
            <Upload size={18} style={{ color: "var(--blue)" }} /><br />
            <b>Drop a CSV</b> or click to browse — plan your own SKUs.
            <div className="ex">columns: sku, date (YYYY-MM), units · ≥ 24 months</div>
            <input type="file" accept=".csv,text/csv" onChange={onFile} />
          </label>
        )}
        {items.length > 0 && (
          <div className="rail">
            {items.map((s, i) => {
              const c = compute.get(s.id);
              const d = c ? decide(c.fc.samples, econFor(s)) : null;
              const diff = d ? d.Qstar - d.QtoMean : 0;
              return (
                <button key={s.id} className={"card" + (i === selected ? " on" : "")} onClick={() => setSelected(i)}>
                  <span className="id">{s.id ?? ""} · {c ? c.fc.selectedLabel.split(" ")[0] : ""}</span>
                  <span className="nm">{s.nm}</span>
                  <Sparkline series={s.series} />
                  <span className="qq"><span className="n">{d ? fmt(d.Qstar) : "—"}</span><span className="u">units</span>{d && <span className="m">{diff >= 0 ? "+" : ""}{fmt(diff)}</span>}</span>
                </button>
              );
            })}
          </div>
        )}

        {!it && <div className="sheet" style={{ marginTop: 14 }}><h3 className="st">Upload a CSV to begin</h3><p className="ph">Provide <code>sku, date (YYYY-MM), units</code> with ~24+ months of history.</p></div>}

        {it && cm && (
          <div className="sheets reveal" key={it.id + ":" + horizon}>
            <DecisionSheet it={it} plan={decide(cm.fc.samples, econFor(it))} horizon={horizon} />
            <Sheet no="02" name="Forecast" right={`${it.real ? "● real" : "○ illustrative"} · ${it.series.length}mo`}>
              <ForecastChart it={it} fc={cm.fc} horizon={horizon} />
            </Sheet>
            <BrainSheet fc={cm.fc} />
            {cm.fc.drivers.filter((d) => isFinite(d.coef)).length > 0 && <DriverSheet fc={cm.fc} />}
            <EconSheet it={it} econ={econFor(it)} horizon={horizon} onEcon={(k, v) => setEcon(it, k, v)} onHorizon={(v) => setHorizon(Math.max(1, Math.min(v, it.series.length - 2 * M)))} />
            <Sheet no="06" name="Cost curve" right="why Q* is optimal"><CostCurveChart samples={cm.fc.samples} plan={decide(cm.fc.samples, econFor(it))} /></Sheet>
            <BacktestSheet it={it} cm={cm} econ={econFor(it)} horizon={horizon} score={scoreHoldout} />
            <Methodology />
          </div>
        )}
        {it && !cm && <div className="sheet" style={{ marginTop: 14 }}><h3 className="st">Not enough history</h3><p className="ph">Needs ≥ {M + 2} months; this has {it.series.length}.</p></div>}
      </div>

      <p className="foot">
        <b>Real:</b> the model competition (seasonal-naive · Holt-Winters ETS · multiplicative ETS · Croston/SBA · driver regression · combination), the rolling-origin cross-validation that selects the winner, the demand classification, driver coefficients, and the newsvendor optimization all run in your browser. <b>Illustrative:</b> the default catalog is labeled sample data with realistic drivers; <b>Real data</b> runs the identical brain on published series; <b>Upload</b> runs it on yours. Built by <b>[your name]</b> · independent concept for the Anatar / Loom team.
      </p>
    </>
  );
}

function DecisionSheet({ it, plan, horizon }: { it: SkuItem; plan: Decision; horizon: number }) {
  const nv = plan.nv, save = plan.expectedCostMean - plan.expectedCostStar, buffer = plan.Qstar - plan.QtoMean;
  return (
    <Sheet no="01" name="Decision" right={it.nm}>
      <div className="hero">
        <div className="cut">
          <div className="lab">Cut for next {horizon}-mo season · newsvendor optimum</div>
          <div className="num">{fmt(plan.Qstar)} <small>units</small></div>
          <div className="dim"><span>mean {fmt(plan.QtoMean)}</span><span className="seg2" /><span style={{ color: "var(--signal-ink)" }}>{buffer >= 0 ? "+" : ""}{fmt(buffer)} buffer</span></div>
          <div className="cmp">
            <div className="row"><span className="k">Make-to-forecast (mean)</span><span className="v">{fmt(plan.QtoMean)} u</span></div>
            <div className="row"><span className="k">Expected cost saved vs mean</span><span className="v" style={{ color: "var(--good)" }}>{money(save)}</span></div>
          </div>
        </div>
        <div className="gauge">
          <div className="lab">Critical ratio · Cu / (Cu+Co)</div>
          <div className="crbar"><div className="pin" style={{ left: (nv.criticalRatio * 100).toFixed(1) + "%" }} /></div>
          <div className="crrow"><span>overstock-averse</span><span className="mono" style={{ color: "var(--ink)", fontWeight: 600 }}>{(nv.criticalRatio * 100).toFixed(1)}%</span><span>stockout-averse</span></div>
          <div className="cuco">
            <div><div className="k">Cu · lost margin/u</div><div className="v">${fmt(nv.Cu)}</div></div>
            <div><div className="k">Co · overstock/u</div><div className="v">${fmt(nv.Co)}</div></div>
          </div>
          <div className="mt">Stockouts cost {nv.Co > 0 ? (nv.Cu / nv.Co).toFixed(1) : "∞"}× an overstock here, so the optimal plan {plan.Qstar >= plan.QtoMean ? "builds a buffer above" : "trims below"} the mean forecast.</div>
        </div>
      </div>
    </Sheet>
  );
}

function BrainSheet({ fc }: { fc: ForecastResult }) {
  const c = fc.classification, skillGood = fc.skillVsNaive > 0.001;
  return (
    <Sheet no="03" name="Model competition" right="cross-validated">
      <p className="ph">Five methods compete; the winner is chosen per-SKU by rolling-origin cross-validation, measured against a seasonal-naive benchmark.</p>
      <div className="metrics">
        <div className="metric"><div className={"v " + (skillGood ? "good" : "amber")}>{skillGood ? pct(fc.skillVsNaive) : "≈ naive"}</div><div className="k">vs seasonal-naive</div></div>
        <div className="metric"><div className="v sig">{isFinite(fc.accuracy.mase) ? fc.accuracy.mase.toFixed(2) : "—"}</div><div className="k">MASE</div></div>
        <div className="metric"><div className="v sig">{isFinite(fc.accuracy.wape) ? (fc.accuracy.wape * 100).toFixed(1) + "%" : "—"}</div><div className="k">WAPE</div></div>
        <div className="metric"><div className="v sig">{isFinite(fc.accuracy.bias) ? pct(fc.accuracy.bias) : "—"}</div><div className="k">bias</div></div>
        <div className="metric"><span className={"pill " + c.label}>{c.label}{isFinite(c.adi) ? ` · ADI ${c.adi.toFixed(1)}` : ""}</span></div>
      </div>
      <table className="lead">
        <thead><tr><th>Model</th><th>MASE</th><th>WAPE</th><th>Bias</th></tr></thead>
        <tbody className="stagger">
          {fc.candidates.map((cd, i) => (
            <tr key={cd.key} className={cd.key === fc.selectedKey ? "sel" : ""} style={{ animationDelay: i * 40 + "ms" }}>
              <td>{cd.label}{cd.key === fc.selectedKey && <span className="win">chosen</span>}</td>
              <td>{isFinite(cd.mase) ? cd.mase.toFixed(3) : "—"}</td>
              <td>{isFinite(cd.wape) ? (cd.wape * 100).toFixed(1) + "%" : "—"}</td>
              <td>{isFinite(cd.bias) ? pct(cd.bias) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt">Pattern: <b>{c.label}</b> — {CLASS_BLURB[c.label]}</div>
    </Sheet>
  );
}

function DriverSheet({ fc }: { fc: ForecastResult }) {
  const drivers = fc.drivers.filter((d) => isFinite(d.coef));
  const maxAbs = Math.max(1e-6, ...drivers.map((d) => Math.abs(d.coef)));
  return (
    <Sheet no="04" name="Demand drivers" right="standardized effect">
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
  const field = (k: keyof Econ, label: string, pre: string) => (
    <div className="f"><label>{label}</label><div className="inp"><span>{pre}</span>
      <input type="number" min={0} step={1} value={econ[k]} onChange={(e) => onEcon(k, parseFloat(e.target.value))} inputMode="decimal" /></div></div>
  );
  return (
    <Sheet no="05" name="Economics" right="cost of being wrong">
      <p className="ph">These set Cu and Co — the only thing that separates the optimal quantity from a naive forecast.</p>
      <div className="econ">
        {field("price", "Retail $", "$")}
        {field("unitCost", "Unit cost", "$")}
        {field("salvage", "Salvage $", "$")}
        <div className="f"><label>Season (mo)</label><div className="inp"><span></span>
          <input type="number" min={1} max={Math.max(1, it.series.length - 2 * M)} step={1} value={horizon} onChange={(e) => onHorizon(parseInt(e.target.value) || 12)} inputMode="numeric" /></div></div>
      </div>
      <div className="mt">Cu = price − unit cost (margin lost on a stockout) · Co = unit cost − salvage (lost on overstock).{it.real ? "" : " Defaults reflect typical apparel economics; change them to your numbers."}</div>
    </Sheet>
  );
}

function CostCurveChart({ samples, plan }: { samples: number[]; plan: Decision }) {
  const nv = plan.nv, lo = quantile(samples, 0.01), hi = quantile(samples, 0.99), STEPS = 60;
  const qs: number[] = [], cs: number[] = [];
  for (let i = 0; i <= STEPS; i++) { const Q = lo + (i / STEPS) * (hi - lo); qs.push(Q); cs.push(expectedCost(Q, samples, nv.Cu, nv.Co)); }
  const W = 720, Ht = 200, padL = 52, padR = 14, padT = 12, padB = 26;
  const maxC = Math.max(...cs) * 1.05 || 1, minC = 0;
  const X = (q: number) => padL + ((q - lo) / (hi - lo || 1)) * (W - padL - padR);
  const Y = (c: number) => padT + (1 - (c - minC) / (maxC - minC)) * (Ht - padT - padB);
  const path = qs.map((q, i) => (i ? "L" : "M") + X(q).toFixed(1) + " " + Y(cs[i]).toFixed(1)).join(" ");
  const gridC = [0, 1, 2, 3].map((g) => minC + (g / 3) * (maxC - minC));
  const mark = (Q: number, col: string, lab: string, dash: boolean, key: string) => (
    <g key={key}><line x1={X(Q)} y1={padT} x2={X(Q)} y2={Ht - padB} stroke={col} strokeWidth={1.4} strokeDasharray={dash ? "4 3" : undefined} /><text x={X(Q)} y={padT + 9} textAnchor="middle" fontSize={9} fill={col} fontFamily="var(--mono)">{lab}</text></g>
  );
  return (
    <>
      <p className="ph">Expected cost of each quantity over 5,000 demand draws from the winning model. The minimum is exactly the newsvendor Q* — not the mean.</p>
      <svg className="chart" viewBox={`0 0 ${W} ${Ht}`}>
        {gridC.map((c, i) => (<g key={i}><line x1={padL} y1={Y(c)} x2={W - padR} y2={Y(c)} stroke="var(--line-2)" /><text x={padL - 7} y={Y(c) + 3} textAnchor="end" fontSize={9} fill="var(--faint)" fontFamily="var(--mono)">{money(c)}</text></g>))}
        <path d={path} fill="none" stroke="var(--blue)" strokeWidth={2} />
        {mark(plan.QtoMean, "var(--faint)", "mean", true, "m")}
        {mark(plan.Qstar, "var(--signal)", "Q* " + fmt(plan.Qstar), false, "q")}
        <circle cx={X(plan.Qstar)} cy={Y(plan.expectedCostStar)} r={4} fill="var(--signal)" />
      </svg>
    </>
  );
}

function BacktestSheet({ it, cm, econ, horizon, score }: { it: SkuItem; cm: Compute; econ: Econ; horizon: number; score: (it: SkuItem, h: Holdout, econ: Econ) => { actual: number; scored: Record<string, ReturnType<typeof realizedCost>> }; }) {
  const holdout = cm.holdouts[0];
  if (!holdout) return <Sheet no="07" name="Backtest"><p className="ph">Needs ≥ {2 * M + horizon} months (two seasons to learn + one to hold out). This has {it.series.length}.</p></Sheet>;
  const bt = score(it, holdout, econ);
  const rows: [string, string][] = [["newsvendor", "Loom Reach"], ["makeToMean", "Make-to-forecast"], ["lastSeasonPlus10", "Last season +10%"], ["runRate", "Recent run-rate"]];
  const maxCost = Math.max(...rows.map(([k]) => bt.scored[k].total)) || 1;
  const nvWon = bt.scored.newsvendor.total <= bt.scored.makeToMean.total;
  return (
    <Sheet no="07" name="Backtest" right={`held-out ${horizon}mo`}>
      <p className="ph">Train the whole brain on history up to the last season, decide a quantity, then score each strategy against what actually sold.</p>
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

function Methodology() {
  return (
    <details className="meth">
      <summary>Methodology — what&apos;s real, and how it maps to production</summary>
      <div className="body">
        <p><span className="real">Real (runs in your browser):</span></p>
        <ul>
          <li><b>Model competition</b> — Seasonal-Naive, Holt-Winters ETS (additive + log/multiplicative), Croston/SBA for intermittent demand, a driver ridge-regression (Fourier seasonality + trend + price + promo), and a forecast combination.</li>
          <li><b>Selection</b> — rolling-origin cross-validation scores each by <b>MASE / WAPE / bias</b>; winner chosen per-SKU. Intermittent/lumpy demand routes to Croston (point metrics mislead there).</li>
          <li><b>Classification</b> — ADI / CV² (Syntetos–Boylan–Croston) labels each SKU smooth / erratic / intermittent / lumpy.</li>
          <li><b>Decision</b> — the winner&apos;s residual-bootstrap distribution feeds the <b>newsvendor</b> optimum Q* = F⁻¹(Cu/(Cu+Co)); a true hold-out backtest scores it vs. naive baselines.</li>
        </ul>
        <p><b>Path to production at Loom:</b> swap the bundled series for Loom&apos;s captured sell-through (POS / Shopify / ERP), keep this exact brain + decision core, and emit the recommended cut quantity per SKU into the production schedule.</p>
      </div>
    </details>
  );
}
