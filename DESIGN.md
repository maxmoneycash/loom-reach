# DESIGN.md — Loom Reach · "Blueprint Instrument"

## Theme
A technical-drawing / tech-pack aesthetic: pale cool "blueprint paper" ground with a hairline grid, white "sheets" (panels) with corner crop-ticks and mono title-blocks, deep navy ink, and a single **signal-orange** accent for the decision and live selection. Charts are drawn like engineering plots. Light, dense, exact. Mobile-first and native-app in feel (snap-scroll SKU rail, big tactile decision readout, sticky title bar).

Register: **product**. Color strategy: **Restrained** (tinted-neutral surface + navy ink + one accent), with the decision moment allowed to go bold.

## Color (OKLCH)
| Token | Value | Use |
|---|---|---|
| `--bg` | `oklch(0.981 0.006 236)` | blueprint paper (cool, not cream) |
| `--surface` | `oklch(1 0 0)` | sheet/panel |
| `--surface-2` | `oklch(0.985 0.006 236)` | insets, controls |
| `--ink` | `oklch(0.23 0.035 255)` | primary text, history line (~13:1 on bg) |
| `--muted` | `oklch(0.45 0.03 255)` | secondary text (≥4.5:1) |
| `--faint` | `oklch(0.60 0.025 255)` | tertiary labels |
| `--grid` | `oklch(0.93 0.014 240)` | hairline blueprint grid |
| `--line` / `--line-2` | `oklch(0.90 / 0.94 … 245)` | borders |
| `--blue` | `oklch(0.45 0.13 255)` | forecast band / secondary accent |
| `--signal` | `oklch(0.64 0.19 45)` | PRIMARY accent — decision, Q*, selection, forecast median |
| `--signal-ink` | `oklch(0.52 0.18 42)` | small orange text (contrast-safe) |
| `--good` `--red` | `oklch(0.55 0.11 155)` / `oklch(0.55 0.18 27)` | savings / alerts |

Navy + signal-orange is a complementary, high-legibility technical pairing.

## Typography
- **JetBrains Mono** — all data, labels, annotations, coordinates, tabular numbers (carries the "drawing" voice). `font-variant-numeric: tabular-nums`.
- **Space Grotesk** — display: the big CUT quantity, sheet headings.
- **Inter** — running prose only.
Fixed rem scale (product), not fluid. Tight tracking on the display numeral.

## Signature elements
- **Hairline grid** background on the paper; **corner crop-ticks** on every sheet.
- **Title-block** header per sheet (mono: sheet no. / SKU id / scale) like a real drawing.
- **Decision hero:** oversized monospaced/grotesk CUT quantity, dimension-line styling, critical-ratio gauge.
- **SKU rail:** horizontal scroll-snap spec-cards (native on mobile, a drawing-set strip on desktop).
- Charts: ink history, signal-orange forecast median, blue P10–P90 band, faint grid, mono axis ticks.

## Motion (150–250ms, reduced-motion safe)
- Sheet set fades/translates up on SKU change (state change, not decoration).
- Forecast median draws in via `stroke-dashoffset`; leaderboard rows stagger.
- All gated behind `@media (prefers-reduced-motion: reduce)` → instant.

## Responsive
Mobile-first single column, full-bleed sheets, sticky compact title bar, horizontal SKU rail, 2-col economics. ≥900px: centered drawing-set (max ~980px) with the SKU rail as a strip and larger chart heights. Structural breakpoints, not fluid type.
