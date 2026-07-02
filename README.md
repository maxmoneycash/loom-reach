# Loom Reach — demand-driven production planning

**Live: https://loom-reach.vercel.app** · a mobile-first planning app that answers the question apparel manufacturing actually runs on: *how many units do you cut?*

A working, independent build of the "Loom Reach — demand sensing" module Anatar announced for Loom OS. It forecasts per-SKU demand with a cross-validated model competition, prices the cost of being wrong, and turns that into decisions a factory can execute — including the two problems accessible tools don't solve: **the dollar value of a fast second cut** (quick response) and **optimal allocation of scarce factory capacity**.

## What it does

| Screen / sheet | What you get |
|---|---|
| **Production plan** | Every SKU's optimal cut in one order sheet, exportable CSV, printable as a cut ticket |
| **Factory capacity** | Drag season capacity down and watch scarce units flow to the SKUs whose next unit earns the most — exact allocation (validated vs. brute force), with the $ gain over pro-rata |
| **Forecast** | The winning model's forecast with an 80% interval, press-and-hold scrubbing, and a radial seasonality fingerprint |
| **Model competition** | Seasonal-naive, Holt-Winters ETS (additive + multiplicative), Croston/SBA, driver ridge-regression, and a combination — selected per SKU by rolling-origin cross-validation (MASE/WAPE/bias), honestly reporting when naive is competitive |
| **Decision** | The newsvendor optimum Q\* with fill rate, stockout risk, and expected leftover |
| **Risk explorer** | Drag a cut line through 5,000 simulated season outcomes; live cost/risk readouts and the $ penalty of any non-optimal quantity |
| **Size run** | The cut split into a factory-ready XS–2XL curve; integer allocation always sums exactly |
| **Quick response** | Cut → read sell-through → re-cut fast, vs. a single offshore commit — hit-or-miss uncertainty estimated from the SKU's own year-over-year history. The $ value of weeks-not-months lead times |
| **Backtest** | True hold-out: the whole brain trained on the past, scored against what actually sold, vs. three naive baselines |
| **Data** | Labeled sample catalog · genuine published demand series · your CSV (daily/weekly auto-aggregates) · a Shopify orders export ingested **server-side** via `POST /api/ingest` |

## The app itself

Mobile-first with a bottom tab bar, pushed SKU detail screens (edge-swipe back), deep-linkable state (`?s=AN-FJ`), press-and-hold chart scrubbing, animated numerals, a bottom-sheet methodology drawer, offline-friendly persistence, and an installable PWA. Built with **Next.js 16 · React 19 · TypeScript · Tailwind v4 · motion (Framer) · NumberFlow · vaul** on Vercel — the same stack Anatar runs.

## Honesty as a feature

Everything computational is real and runs in the browser (or in `/api/ingest`): **57 headless tests** cover the forecasting, selection, newsvendor math, risk metrics, size allocation, quick-response simulation, capacity optimizer (checked against brute force), and the CSV/Shopify parsers. The default catalog is *labeled* sample data; the real-data paths run the identical engine. Where a naive baseline wins, the app says so.

```bash
npm install
npm test        # 57 headless engine tests
npm run dev
```

## Production path

`/api/ingest` already speaks the Shopify orders schema — put it behind OAuth + webhooks, add accounts + Postgres, reforecast on a schedule, and emit the plan into the production schedule.

---
_Built by Max Mohammadi · independent concept for the Anatar / Loom team · not affiliated with Anatar. See [/pitch](https://loom-reach.vercel.app/pitch)._
