import { ordersToSkus } from "@/lib/shopify";

/* POST /api/ingest — server-side supply-chain ingestion.
   Body: a Shopify Admin API orders export ({ orders: [...] } or a bare array).
   Aggregates order lines into per-SKU monthly demand on the server and returns
   the catalog payload the planner consumes. In production this same handler
   sits behind a Shopify OAuth app pulling /admin/api/orders.json directly. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ items: [], warnings: [], error: "Body must be JSON (a Shopify orders export)." }, { status: 400 });
  }
  const result = ordersToSkus(body);
  return Response.json(result, { status: result.error ? 422 : 200 });
}
