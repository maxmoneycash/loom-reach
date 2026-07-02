import { makeRng, type Econ } from "./engine";
import type { Drivers } from "./forecast";

export interface SkuItem {
  id: string; nm: string; cat: string; labels: string[]; series: number[];
  econ: Econ; real: boolean; src: string; drivers?: Drivers;
}

/* ---- REAL public demand series (fetched verbatim; classic published datasets) ---- */
export const REAL: Record<string, { name: string; cite: string; unit: string; start: string; vals: number[] }> = {
  champagne: {
    name: "Perrin et Fils — champagne sales", cite: "Classic monthly series, 1964–72 (105 mo). Public.", unit: "cases", start: "1964-01",
    vals: [2815, 2672, 2755, 2721, 2946, 3036, 2282, 2212, 2922, 4301, 5764, 7312, 2541, 2475, 3031, 3266, 3776, 3230, 3028, 1759, 3595, 4474, 6838, 8357, 3113, 3006, 4047, 3523, 3937, 3986, 3260, 1573, 3528, 5211, 7614, 9254, 5375, 3088, 3718, 4514, 4520, 4539, 3663, 1643, 4739, 5428, 8314, 10651, 3633, 4292, 4154, 4121, 4647, 4753, 3965, 1723, 5048, 6922, 9858, 11331, 4016, 3957, 4510, 4276, 4968, 4677, 3523, 1821, 5222, 6872, 10803, 13916, 2639, 2899, 3370, 3740, 2927, 3986, 4217, 1738, 5221, 6424, 9842, 13076, 3934, 3162, 4286, 4676, 5010, 4874, 4633, 1659, 5951, 6981, 9851, 12670, 4348, 3564, 4577, 4788, 4618, 5312, 4298, 1413, 5877],
  },
  car: {
    name: "Monthly car sales, Quebec", cite: "Classic monthly series, 1960–68 (108 mo). Public.", unit: "vehicles", start: "1960-01",
    vals: [6550, 8728, 12026, 14395, 14587, 13791, 9498, 8251, 7049, 9545, 9364, 8456, 7237, 9374, 11837, 13784, 15926, 13821, 11143, 7975, 7610, 10015, 12759, 8816, 10677, 10947, 15200, 17010, 20900, 16205, 12143, 8997, 5568, 11474, 12256, 10583, 10862, 10965, 14405, 20379, 20128, 17816, 12268, 8642, 7962, 13932, 15936, 12628, 12267, 12470, 18944, 21259, 22015, 18581, 15175, 10306, 10792, 14752, 13754, 11738, 12181, 12965, 19990, 23125, 23541, 21247, 15189, 14767, 10895, 17130, 17697, 16611, 12674, 12760, 20249, 22135, 20677, 19933, 15388, 15113, 13401, 16135, 17562, 14720, 12225, 11608, 20985, 19692, 24081, 22114, 14220, 13434, 13598, 17187, 16119, 13713, 13210, 14251, 20139, 21725, 26099, 21084, 18024, 16722, 14385, 21342, 17180, 14577],
  },
  paper: {
    name: "Monthly paper sales", cite: "Classic monthly series (147 mo). Public.", unit: "reams", start: "2000-01",
    vals: [1360, 1279, 1508, 1420, 1441, 1424, 1248, 495, 1278, 1429, 1221, 1314, 1529, 1487, 1606, 1545, 1489, 1667, 1198, 507, 1351, 1402, 1475, 1459, 1416, 1531, 1761, 1632, 1712, 1665, 1435, 572, 1477, 1623, 1731, 1642, 1555, 1740, 2003, 1649, 1658, 1949, 1292, 556, 1487, 1536, 1651, 1700, 1801, 1799, 1923, 1733, 1724, 1848, 1480, 582, 1564, 1649, 1717, 1691, 1916, 1925, 2007, 1892, 1377, 1749, 1728, 668, 1672, 2113, 1817, 1838, 2031, 1970, 2125, 1909, 1888, 2052, 1569, 811, 1627, 2061, 1637, 2164, 1789, 1991, 2118, 2021, 1667, 2042, 1571, 713, 1642, 1649, 1639, 1946, 1960, 1991, 2207, 1815, 1876, 2305, 1899, 511, 1906, 1799, 1841, 1972, 2012, 2425, 2413, 2080, 2061, 2483, 1808, 832, 1953, 2127, 2148, 2176, 2279, 2357, 2486, 2305, 2502, 2289, 2073, 786, 1996, 2941, 2912, 2680, 2744, 2418, 2650, 2310, 2640, 2366, 2085, 877, 2221, 2254, 1620, 1618, 1488, 1541, 1643],
  },
};
export const REAL_ECON: Record<string, Econ> = {
  champagne: { price: 100, unitCost: 40, salvage: 12 },
  car: { price: 100, unitCost: 55, salvage: 30 },
  paper: { price: 100, unitCost: 45, salvage: 15 },
};

export function monthsFrom(start: string, n: number): string[] {
  const [y, m] = start.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < n; i++) { const mm = (m - 1 + i) % 12, yy = y + Math.floor((m - 1 + i) / 12); out.push(yy + "-" + String(mm + 1).padStart(2, "0")); }
  return out;
}

/* ---- ILLUSTRATIVE apparel catalog: deterministic seeded sample, clearly labeled. NOT real sales.
   Demand is shaped by real drivers (year-varying promo calendar + price/markdowns) so the
   driver-regression model has genuine signal to find. ---- */
interface Gen { series: number[]; price: number[]; promo: number[]; }
function genSku(seed: number, n: number, base: number, trendPerYr: number, shape: number[], noise: number,
  opts: { priceBase: number; promoLift?: number; elasticity?: number; intermittent?: boolean }): Gen {
  const rng = makeRng(seed);
  const promoLift = opts.promoLift ?? 0.5, elasticity = opts.elasticity ?? 1.1;
  const promoSet = new Set<number>();
  for (let y = 0; y < Math.ceil(n / 12); y++) for (let c = 0; c < 2; c++) promoSet.add(y * 12 + Math.floor(rng() * 12)); // ~2 promos/yr, year-varying
  const series: number[] = [], price: number[] = [], promo: number[] = [];
  for (let i = 0; i < n; i++) {
    const mo = i % 12, s = shape[mo], tr = 1 + trendPerYr * (i / 12);
    const pr = mo === 7 ? opts.priceBase * 0.75 : opts.priceBase; // mid-year clearance markdown
    price.push(Math.round(pr));
    const isP = promoSet.has(i) ? 1 : 0; promo.push(isP);
    let v = base * s * tr * (1 + (rng() - 0.5) * noise) * (1 + promoLift * isP) * Math.pow(opts.priceBase / pr, elasticity);
    if (opts.intermittent && rng() > 0.28) v = 0; // sparse, lumpy demand (defense contract cadence)
    series.push(Math.max(0, Math.round(v)));
  }
  return { series, price, promo };
}
const SHAPES = {
  winter: [1.55, 1.25, 0.8, 0.55, 0.4, 0.35, 0.4, 0.55, 0.95, 1.35, 1.7, 1.85],
  summer: [0.5, 0.55, 0.75, 1.05, 1.4, 1.65, 1.7, 1.55, 1.15, 0.8, 0.55, 0.45],
  steady: [0.95, 0.9, 1.0, 1.05, 1.05, 1.0, 0.9, 0.85, 1.05, 1.1, 1.15, 1.0],
  holiday: [0.7, 0.65, 0.75, 0.8, 0.85, 0.8, 0.8, 0.9, 1.05, 1.2, 1.7, 2.0],
};
const N_MO = 48, START = "2021-01";
const APPAREL = [
  { id: "AN-FJ", nm: "Heritage Field Jacket", cat: "Outerwear · seasonal", price: 240, unitCost: 96, salvage: 30, g: genSku(11, N_MO, 420, 0.18, SHAPES.winter, 0.16, { priceBase: 240, promoLift: 0.5, elasticity: 1.2 }) },
  { id: "AN-TEE", nm: "Everyday Organic Tee", cat: "Core basic · promo-driven", price: 38, unitCost: 14, salvage: 4, g: genSku(22, N_MO, 2600, 0.05, SHAPES.steady, 0.1, { priceBase: 38, promoLift: 0.8, elasticity: 1.6 }) },
  { id: "AN-ML", nm: "Merino Base Layer", cat: "Performance · winter", price: 130, unitCost: 52, salvage: 16, g: genSku(33, N_MO, 640, 0.1, SHAPES.winter, 0.18, { priceBase: 130, promoLift: 0.4, elasticity: 1.0 }) },
  { id: "AN-LIN", nm: "Linen Camp Shirt", cat: "Seasonal · summer", price: 88, unitCost: 33, salvage: 10, g: genSku(44, N_MO, 780, 0.06, SHAPES.summer, 0.17, { priceBase: 88, promoLift: 0.45, elasticity: 1.3 }) },
  { id: "AN-SS", nm: "Tactical Softshell", cat: "Defense contract · lumpy", price: 320, unitCost: 140, salvage: 40, g: genSku(55, N_MO, 1100, 0.12, SHAPES.steady, 0.2, { priceBase: 320, intermittent: true }) },
  { id: "AN-HD", nm: "Limited-Run Hoodie", cat: "Trend · volatile", price: 96, unitCost: 36, salvage: 8, g: genSku(66, N_MO, 900, -0.1, SHAPES.holiday, 0.28, { priceBase: 96, promoLift: 0.7, elasticity: 1.4 }) },
];

export function loadApparel(): SkuItem[] {
  return APPAREL.map((a) => ({
    id: a.id, nm: a.nm, cat: a.cat, labels: monthsFrom(START, N_MO), series: a.g.series,
    econ: { price: a.price, unitCost: a.unitCost, salvage: a.salvage }, real: false, src: "Illustrative sample data",
    drivers: { price: a.g.price, promo: a.g.promo },
  }));
}
export function loadReal(): SkuItem[] {
  return Object.keys(REAL).map((k) => { const d = REAL[k]; return { id: k, nm: d.name, cat: d.cite, labels: monthsFrom(d.start, d.vals.length), series: d.vals.slice(), econ: { ...REAL_ECON[k] }, real: true, src: "Real public dataset" }; });
}

export interface ParseResult { items: SkuItem[]; warnings: string[]; error: string | null; }

/* Parse a real-world sales CSV: comma/semicolon/tab delimited; daily, weekly, or
   monthly rows; any of sku,date,units / date,units / bare units. Daily/weekly rows
   are aggregated into calendar months; month gaps are zero-filled with a warning. */
export function parseCSV(text: string): ParseResult {
  const warnings: string[] = [];
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { items: [], warnings, error: "The file is empty." };

  const delim = [",", ";", "\t"].reduce((a, b) => (lines[0].split(b).length > lines[0].split(a).length ? b : a));
  const split = (l: string) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));

  const head = lines[0].toLowerCase();
  const hasHeader = /sku|date|month|week|period|unit|qty|sales|demand|product|item|style/.test(head);
  const rows = (hasHeader ? lines.slice(1) : lines).map(split).filter((r) => r.some((c) => c !== ""));
  if (!rows.length) return { items: [], warnings, error: "No data rows found under the header." };

  let skuCol = -1, dateCol = -1, valCol = -1;
  if (hasHeader) {
    split(lines[0]).map((c) => c.toLowerCase()).forEach((c, i) => {
      if (/sku|product|item|style/.test(c) && skuCol < 0) skuCol = i;
      if (/date|month|week|period/.test(c) && dateCol < 0) dateCol = i;
      if (/unit|qty|quantity|sales|demand|volume/.test(c) && valCol < 0) valCol = i;
    });
  }
  const nc = rows[0].length;
  if (valCol < 0) valCol = nc - 1;
  if (nc >= 3) { if (skuCol < 0) skuCol = 0; if (dateCol < 0) dateCol = 1; }
  else if (nc === 2) { if (dateCol < 0) dateCol = 0; valCol = 1; }
  else { dateCol = -1; valCol = 0; }

  // month key from a date string, or null if unparseable
  const monthOf = (s: string): string | null => {
    let m = s.match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/);           // 2024-03, 2024-03-15, 2024/3
    if (m) { const mo = +m[2]; return mo >= 1 && mo <= 12 ? m[1] + "-" + String(mo).padStart(2, "0") : null; }
    m = s.match(/^(\d{1,2})[-/](?:\d{1,2})[-/](\d{4})$/);               // 3/15/2024 (US month-first)
    if (m) { const mo = +m[1]; return mo >= 1 && mo <= 12 ? m[2] + "-" + String(mo).padStart(2, "0") : null; }
    m = s.match(/^([A-Za-z]{3,9})[ -](\d{4})$/);                        // Mar 2024 / March-2024
    if (m) { const mo = "janfebmaraprmayjunjulaugsepoctnovdec".indexOf(m[1].slice(0, 3).toLowerCase()) / 3; return mo >= 0 ? m[2] + "-" + String(mo + 1).padStart(2, "0") : null; }
    return null;
  };

  type Bucket = Map<string, number>;                                     // month -> units
  const bySku = new Map<string, { bucket: Bucket; seq: number[]; seqLabels: string[]; rowsSeen: number }>();
  let badVals = 0, datedRows = 0;
  rows.forEach((r, idx) => {
    const sku = skuCol >= 0 && nc >= 3 ? r[skuCol] || "Series" : "Series";
    const v = parseFloat((r[valCol] ?? "").replace(/[$,\s]/g, ""));
    if (isNaN(v)) { badVals++; return; }
    const g = bySku.get(sku) ?? { bucket: new Map<string, number>(), seq: [] as number[], seqLabels: [] as string[], rowsSeen: 0 };
    g.rowsSeen++;
    const mk = dateCol >= 0 ? monthOf(r[dateCol] ?? "") : null;
    if (mk) { datedRows++; g.bucket.set(mk, (g.bucket.get(mk) ?? 0) + Math.max(0, v)); }
    else { g.seq.push(Math.max(0, v)); g.seqLabels.push(dateCol >= 0 ? r[dateCol] : String(idx + 1)); }
    bySku.set(sku, g);
  });
  if (badVals) warnings.push(`${badVals} row${badVals > 1 ? "s" : ""} skipped (non-numeric units).`);
  if (!bySku.size) return { items: [], warnings, error: "No numeric rows found. Expected columns like: sku, date, units." };

  const nextMonth = (k: string) => { const [y, mo] = k.split("-").map(Number); return mo === 12 ? (y + 1) + "-01" : y + "-" + String(mo + 1).padStart(2, "0"); };
  let gapsFilled = 0, aggregated = false;
  const items: SkuItem[] = [...bySku.entries()].map(([sku, g]) => {
    let labels: string[], series: number[];
    if (g.bucket.size >= 2 && g.bucket.size >= g.seq.length) {
      const keys = [...g.bucket.keys()].sort();
      if (g.rowsSeen > g.bucket.size) aggregated = true;
      labels = []; series = [];
      for (let k = keys[0]; ; k = nextMonth(k)) {
        labels.push(k);
        if (g.bucket.has(k)) series.push(g.bucket.get(k)!); else { series.push(0); gapsFilled++; }
        if (k === keys[keys.length - 1]) break;
        if (labels.length > 600) break;                                  // runaway-gap guard
      }
    } else { labels = g.seqLabels; series = g.seq; }
    return {
      id: "csv-" + sku, nm: sku, cat: "Uploaded · " + series.length + " months",
      labels, series, econ: { price: 100, unitCost: 45, salvage: 15 }, real: true, src: "Your data",
    };
  });
  if (aggregated) warnings.push("Daily/weekly rows were aggregated into calendar months.");
  if (gapsFilled) warnings.push(`${gapsFilled} missing month${gapsFilled > 1 ? "s" : ""} filled with 0 — check for data gaps.`);
  if (datedRows === 0 && dateCol >= 0) warnings.push("Dates weren't recognized — rows were kept in file order.");
  const short = items.filter((i) => i.series.length < 24);
  if (short.length) warnings.push(`${short.length} SKU${short.length > 1 ? "s have" : " has"} under 24 months — forecasts will be weaker.`);
  return { items, warnings, error: null };
}
