/* ============================================================================
 * Capacity-constrained allocation across the catalog.
 *
 * With finite factory capacity, the optimal split maximizes total expected
 * profit. The marginal expected profit of SKU i's q-th unit,
 *     m_i(q) = Cu_i · P(D_i ≥ q) − Co_i · P(D_i < q),
 * is decreasing in q, so greedy unit-by-unit allocation is exactly optimal.
 * We solve it in O(n log) by bisecting the threshold λ: each SKU takes units
 * while m_i(q) ≥ λ, i.e. q_i(λ) = F_i⁻¹((Cu_i − λ)/(Cu_i + Co_i)).
 * ==========================================================================*/
import { newsvendor, quantile, type Econ } from "./engine";

export interface CapSku { id: string; samples: number[]; econ: Econ; }
export interface CapAlloc { id: string; q: number; unconstrained: number; }
export interface CapResult {
  binding: boolean; capacity: number; totalUnconstrained: number;
  alloc: CapAlloc[];
  profitOptimal: number; profitProRata: number; gain: number;
}

/* expected profit of committing q units against a demand sample set */
export function expectedProfit(q: number, samples: number[], econ: Econ): number {
  let sold = 0;
  for (let i = 0; i < samples.length; i++) sold += Math.min(q, samples[i]);
  sold /= Math.max(samples.length, 1);
  const leftover = q - sold;
  return econ.price * sold + econ.salvage * leftover - econ.unitCost * q;
}

function qAtLambda(s: CapSku, lambda: number): number {
  const nv = newsvendor(s.econ);
  if (nv.Cu <= lambda) return 0;                     // even the 1st unit's ceiling is below λ
  const p = (nv.Cu - lambda) / (nv.Cu + nv.Co || 1);
  return Math.round(quantile(s.samples, Math.min(1, Math.max(0, p))));
}

export function allocateCapacity(skus: CapSku[], capacity: number): CapResult {
  const un = skus.map((s) => qAtLambda(s, 0));       // λ=0 → each SKU's own newsvendor Q*
  const totalUn = un.reduce((a, b) => a + b, 0);
  const cap = Math.max(0, Math.round(capacity));

  let alloc: number[];
  let binding = false;
  if (cap >= totalUn) {
    alloc = un;                                       // capacity not binding: everyone gets Q*
  } else {
    binding = true;
    let lo = 0, hi = Math.max(...skus.map((s) => newsvendor(s.econ).Cu), 1);
    for (let iter = 0; iter < 48; iter++) {           // bisect λ to hit the capacity
      const mid = (lo + hi) / 2;
      const tot = skus.reduce((a, s) => a + qAtLambda(s, mid), 0);
      if (tot > cap) lo = mid; else hi = mid;
    }
    alloc = skus.map((s) => qAtLambda(s, hi));
    // true greedy on the residual: marginal expected profit of SKU i's next unit
    const marginal = (i: number, q: number): number => {
      const s = skus[i], nv = newsvendor(s.econ), n = s.samples.length || 1;
      let lt = 0, lo2 = 0, hi2 = s.samples.length;               // count samples < q (sorted)
      while (lo2 < hi2) { const m2 = (lo2 + hi2) >> 1; if (s.samples[m2] < q) lo2 = m2 + 1; else hi2 = m2; }
      lt = lo2;
      const pGE = 1 - lt / n;
      return nv.Cu * pGE - nv.Co * (1 - pGE);
    };
    let slack = cap - alloc.reduce((a, b) => a + b, 0);
    while (slack > 0) {                                          // hand each unit to the best current marginal
      let bi = -1, bm = -Infinity;
      for (let i = 0; i < skus.length; i++) { const m2 = marginal(i, alloc[i]); if (m2 > bm) { bm = m2; bi = i; } }
      if (bi < 0 || bm <= -Infinity) break;
      alloc[bi]++; slack--;
    }
    while (slack < 0) {                                          // reclaim units from the worst current marginal
      let wi = -1, wm = Infinity;
      for (let i = 0; i < skus.length; i++) { if (alloc[i] <= 0) continue; const m2 = marginal(i, alloc[i] - 1); if (m2 < wm) { wm = m2; wi = i; } }
      if (wi < 0) break;
      alloc[wi]--; slack++;
    }
    // pairwise-exchange polish: for a concave separable objective this
    // converges to the exact discrete optimum, fixing quantile rounding.
    for (let iter = 0; iter < 20000; iter++) {
      let gi = -1, gm = -Infinity, li = -1, lm = Infinity;
      for (let i = 0; i < skus.length; i++) {
        const g = marginal(i, alloc[i]); if (g > gm) { gm = g; gi = i; }
        if (alloc[i] > 0) { const l = marginal(i, alloc[i] - 1); if (l < lm) { lm = l; li = i; } }
      }
      if (gi < 0 || li < 0 || gi === li || gm <= lm + 1e-9) break;
      alloc[gi]++; alloc[li]--;
    }
  }

  // naive comparison: scale every SKU's Q* by the same factor
  const scale = totalUn > 0 ? Math.min(1, cap / totalUn) : 0;
  const proRata = un.map((q) => Math.round(q * scale));

  const profitOptimal = skus.reduce((a, s, i) => a + expectedProfit(alloc[i], s.samples, s.econ), 0);
  const profitProRata = skus.reduce((a, s, i) => a + expectedProfit(proRata[i], s.samples, s.econ), 0);

  return {
    binding, capacity: cap, totalUnconstrained: totalUn,
    alloc: skus.map((s, i) => ({ id: s.id, q: alloc[i], unconstrained: un[i] })),
    profitOptimal, profitProRata, gain: profitOptimal - profitProRata,
  };
}
