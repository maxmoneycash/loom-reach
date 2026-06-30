# Loom Reach — demand-driven production planning

A working build of the module Anatar describes in **Loom OS** ("Loom Reach — demand sensing") but has no public demo for. It turns a SKU's sales history into a demand forecast *with honest uncertainty*, then solves the **production quantity** that minimizes the real cost of being wrong — too much (markdowns, deadstock) vs. too little (lost margin).

> Apparel overproduction is a **$70–140B/yr** problem (McKinsey / BoF, *State of Fashion 2025*). The decision that prevents it isn't "what will sell?" — it's "**how many do we cut?**" That's the newsvendor problem, and it's what this builds.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · lucide — deployed on Vercel.

## What's real vs. illustrative

Everything that matters is real and runs in the browser:

- **Forecast** — Holt-Winters additive (level/trend/seasonal) with a grid search over smoothing params to minimize in-sample RMSE.
- **Uncertainty** — a predictive distribution of season demand via **residual bootstrap** (5,000 draws), not a point guess.
- **Decision** — the **newsvendor** optimum `Q* = F⁻¹(Cu/(Cu+Co))`, the quantity that minimizes expected overage + underage cost.
- **Backtest** — true hold-out: train on all but the last season, decide, score against realized demand vs. three naive baselines a planner actually uses.

The default **apparel catalog is clearly-labeled illustrative sample data** (to tell the apparel story). The **"Real public data"** tab runs the identical engine on genuine published demand series (e.g. Perrin champagne, monthly car sales), and **"Upload CSV"** runs it on your own sell-through. Cost inputs (margin, salvage) are adjustable assumptions, not claims.

A key honest result: newsvendor planning **wins at portfolio scale, not on every single SKU** — it minimizes *expected* cost, so it can lose on an individual low-demand season. The UI shows that rather than hiding it.

## The engine is validated

The forecasting + newsvendor + backtest core (`lib/engine.ts`) was validated headlessly: 13 engine unit tests (critical-ratio math, monotonicity of `Q*` in the cost ratio, expected-cost optimality, identity checks) plus 17 full-app tests (catalog generation, portfolio aggregation, panel rendering, CSV parsing) — all passing, including on real-world data.

## Run locally

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
```

## Path to production at Loom

Swap the bundled series for Loom's captured sell-through (POS / Shopify / ERP), keep this exact decision core, and emit the recommended cut quantity per SKU into the production schedule. The hard part — turning noisy demand into a defensible quantity *with its uncertainty* — is already here.

---

_Independent concept built for the Anatar / Loom team. Not affiliated with Anatar._
