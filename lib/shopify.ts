/* ============================================================================
 * Shopify-orders → demand adapter. Pure and dependency-free so it runs in the
 * /api/ingest route handler (server-side aggregation) and in tests.
 *
 * Accepts the shape of a Shopify Admin API orders export (orders.json):
 *   { orders: [{ created_at, cancelled_at?, line_items: [{ sku?, title?,
 *     quantity, price? }] }] }  — or a bare array of orders.
 * Unknown/extra fields are ignored; cancelled orders are skipped.
 * ==========================================================================*/

export interface ShopifyLineItem { sku?: string; title?: string; quantity?: number; price?: string | number; }
export interface ShopifyOrder { created_at?: string; processed_at?: string; cancelled_at?: string | null; line_items?: ShopifyLineItem[]; }
export interface IngestSku {
  id: string; nm: string; cat: string; labels: string[]; series: number[];
  econ: { price: number; unitCost: number; salvage: number };
  real: boolean; src: string;
}
export interface IngestResult { items: IngestSku[]; warnings: string[]; error: string | null; }

const monthKey = (iso: string): string | null => {
  const m = iso?.match(/^(\d{4})-(\d{2})/);
  return m ? m[1] + "-" + m[2] : null;
};
const nextMonth = (k: string): string => {
  const [y, mo] = k.split("-").map(Number);
  return mo === 12 ? y + 1 + "-01" : y + "-" + String(mo + 1).padStart(2, "0");
};

export function ordersToSkus(input: unknown): IngestResult {
  const warnings: string[] = [];
  const orders: ShopifyOrder[] = Array.isArray(input)
    ? (input as ShopifyOrder[])
    : (input as { orders?: ShopifyOrder[] })?.orders ?? [];
  if (!Array.isArray(orders) || !orders.length) {
    return { items: [], warnings, error: "No orders found. Expected a Shopify orders export ({ orders: [...] })." };
  }

  type Agg = { bucket: Map<string, number>; title: string; revenue: number; units: number };
  const bySku = new Map<string, Agg>();
  let skippedNoDate = 0, cancelled = 0, lineItems = 0;

  for (const o of orders) {
    if (o.cancelled_at) { cancelled++; continue; }
    const mk = monthKey(o.created_at ?? o.processed_at ?? "");
    if (!mk) { skippedNoDate++; continue; }
    for (const li of o.line_items ?? []) {
      const qty = Math.max(0, Math.round(Number(li.quantity) || 0));
      if (!qty) continue;
      lineItems++;
      const sku = (li.sku || li.title || "UNKNOWN").trim() || "UNKNOWN";
      const a = bySku.get(sku) ?? { bucket: new Map<string, number>(), title: li.title || sku, revenue: 0, units: 0 };
      a.bucket.set(mk, (a.bucket.get(mk) ?? 0) + qty);
      a.revenue += (Number(li.price) || 0) * qty;
      a.units += qty;
      bySku.set(sku, a);
    }
  }
  if (cancelled) warnings.push(`${cancelled} cancelled order${cancelled > 1 ? "s" : ""} excluded.`);
  if (skippedNoDate) warnings.push(`${skippedNoDate} order${skippedNoDate > 1 ? "s" : ""} skipped (no parseable date).`);
  if (!bySku.size) return { items: [], warnings, error: "No sellable line items found in the export." };

  let gaps = 0;
  const items: IngestSku[] = [...bySku.entries()].map(([sku, a]) => {
    const keys = [...a.bucket.keys()].sort();
    const labels: string[] = [], series: number[] = [];
    for (let k = keys[0]; ; k = nextMonth(k)) {
      labels.push(k);
      if (a.bucket.has(k)) series.push(a.bucket.get(k)!); else { series.push(0); gaps++; }
      if (k === keys[keys.length - 1] || labels.length > 600) break;
    }
    // avg selling price from the orders themselves; cost/salvage as editable defaults
    const asp = a.units ? Math.round(a.revenue / a.units) : 100;
    const price = Math.max(1, asp);
    return {
      id: "shop-" + sku, nm: a.title, cat: `Shopify orders · ${series.length} months · ${a.units.toLocaleString("en-US")} u sold`,
      labels, series,
      econ: { price, unitCost: Math.max(1, Math.round(price * 0.4)), salvage: Math.max(0, Math.round(price * 0.12)) },
      real: true, src: "Shopify orders export",
    };
  }).sort((x, y) => y.series.reduce((a, b) => a + b, 0) - x.series.reduce((a, b) => a + b, 0));

  if (gaps) warnings.push(`${gaps} zero-sales month${gaps > 1 ? "s" : ""} inferred — verify they're real gaps, not missing data.`);
  warnings.push(`Prices inferred from order revenue (avg selling price); unit cost defaulted to 40% of price — adjust in Economics.`);
  if (!lineItems) return { items: [], warnings, error: "Orders contained no line items." };
  return { items, warnings, error: null };
}
