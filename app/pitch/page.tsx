import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Why I built this · Loom Reach",
  description: "How this working build maps to Anatar's Loom platform — and what it would take to ship it for real.",
};

const rows: [string, string, string][] = [
  ["00 · Production plan", "Loom OS — production planning", "Every SKU's cut quantity in one exportable order sheet."],
  ["02 · Forecast", "Loom Reach — demand sensing", "Cross-validated model competition per SKU, with honest uncertainty."],
  ["03 · Model competition", "Loom Reach — demand sensing", "Seasonal-naive, ETS ×2, Croston/SBA, driver regression, combination — scored by MASE/WAPE."],
  ["04 · Demand drivers", "Loom Reach — demand signals", "Price elasticity and promo lift learned from history — the 'POS + promo calendar' signals Loom describes."],
  ["01 / 06 · Decision + Risk", "Loom OS — demand-driven manufacturing", "The newsvendor cut quantity, and a draggable explorer showing exactly what any other quantity costs."],
  ["08 · Size run", "Loom OS — production orchestration", "The cut split into a factory-ready size curve, integer-exact."],
  ["/api/ingest", "Loom — supply-chain integrations", "Server-side ingestion of a Shopify orders export → per-SKU monthly demand. The same handler sits behind Shopify OAuth in production."],
  ["09 · Quick response", "Anatar's core thesis", "Simulates cut → read sell-through → re-cut vs. a single offshore commit, with hit-or-miss uncertainty estimated from the SKU's own history. Puts a dollar value on weeks-not-months lead times — the number that justifies domestic manufacturing."],
];

export default function Pitch() {
  return (
    <div className="shell" style={{ paddingTop: 28 }}>
      <section className="intro">
        <h1>Why this exists</h1>
        <p>
          Anatar&apos;s Loom OS announcement names <b>Loom Reach — demand sensing</b> as a core module, and the thesis of
          demand-driven U.S. manufacturing depends on it: knowing <em>how many units to cut</em>. There was no public demo,
          so I built a working one — against the stack Anatar already runs (Next.js on Vercel), styled after the technical
          drawings apparel manufacturing speaks in.
        </p>
      </section>

      <section className="sheet" style={{ marginTop: 4 }}>
        <div className="tblock"><span className="no">A</span><span className="sig">Module map</span><span className="r">this build ↔ Loom</span></div>
        <div className="planwrap">
          <table className="plan" style={{ minWidth: 560 }}>
            <thead><tr><th>Here</th><th style={{ textAlign: "left" }}>Loom pillar</th><th style={{ textAlign: "left" }}>What it does</th></tr></thead>
            <tbody>
              {rows.map(([a, b, c]) => (
                <tr key={a}><td>{a}</td><td style={{ textAlign: "left", fontFamily: "var(--sans)" }}>{b}</td><td style={{ textAlign: "left", fontFamily: "var(--sans)", whiteSpace: "normal" }}>{c}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="sheet" style={{ marginTop: 14 }}>
        <div className="tblock"><span className="no">B</span><span className="sig">What&apos;s real</span><span className="r">no faked infrastructure</span></div>
        <p className="ph" style={{ maxWidth: "72ch" }}>
          The forecasting (five-model competition selected by rolling-origin cross-validation), the demand classification
          (ADI/CV²), the driver coefficients, the newsvendor optimization, the risk metrics, the size allocation, and the
          server-side Shopify ingestion all genuinely run — 37 headless tests cover the math. The default catalog is
          <b> labeled illustrative data</b>; the &quot;Real public data&quot; tab and the upload/ingest paths run the identical engine
          on genuine history. Where a naive baseline wins, the app says so — a planning tool you can&apos;t trust to admit
          that isn&apos;t a planning tool.
        </p>
      </section>

      <section className="sheet" style={{ marginTop: 14 }}>
        <div className="tblock"><span className="no">C</span><span className="sig">Path to production</span><span className="r">what I&apos;d build next</span></div>
        <div className="ph" style={{ maxWidth: "72ch" }}>
          <p style={{ margin: "0 0 8px" }}>
            <b>1.</b> Put <code className="mono">/api/ingest</code> behind Shopify OAuth + webhooks so demand syncs continuously
            (the adapter already speaks the orders schema). <b>2.</b> Accounts + Postgres so catalogs, economics, and plans are
            durable and shared. <b>3.</b> Reforecast on a schedule; alert when actuals break the prediction interval.
            <b> 4.</b> Emit the plan into the production schedule — the Loom Core handoff.
          </p>
          <p style={{ margin: 0 }}>
            The hard part — turning noisy sell-through into a defensible cut quantity with its uncertainty — is already
            built and tested.
          </p>
        </div>
      </section>

      <div className="actions" style={{ margin: "18px 0 40px" }}>
        <Link className="btn primary" href="/">Open the planner</Link>
        <a className="btn" href="https://github.com/maxmoneycash/loom-reach" target="_blank" rel="noopener noreferrer">Source on GitHub</a>
      </div>

      <p className="foot" style={{ padding: 0 }}>
        Built by <b>Max Mohammadi</b> · maxmohammadi@gmail.com · independent concept — not affiliated with Anatar.
      </p>
    </div>
  );
}
