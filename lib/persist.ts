/* localStorage persistence — your catalog, economics, and settings survive reloads.
   Loaded after mount (never during SSG render) to keep hydration deterministic. */
import type { Econ } from "./engine";
import type { SkuItem } from "./data";

const KEY = "loom-reach-v1";

export interface Persisted {
  source: "apparel" | "real" | "upload";
  horizon: number;
  econOverride: Record<string, Econ>;
  uploaded: SkuItem[] | null;
  selectedId: string | null;
  sizes?: Record<string, number[]>;   // per-SKU size-curve weights
}

export function saveState(p: Persisted): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* quota/private mode — non-fatal */ }
}

export function loadState(): Persisted | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Persisted;
    if (!p || typeof p !== "object" || !p.source) return null;
    return p;
  } catch { return null; }
}

export function clearState(): void {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
}
