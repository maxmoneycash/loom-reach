import { makeRng, type Econ } from "./engine";

export interface SkuItem {
  id: string; nm: string; cat: string; labels: string[]; series: number[];
  econ: Econ; real: boolean; src: string;
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

/* ---- ILLUSTRATIVE apparel catalog: deterministic seeded sample, clearly labeled. NOT real sales. ---- */
function genSeries(seed: number, n: number, base: number, trendPerYr: number, shape: number[], noise: number, intermittent: number): number[] {
  const rng = makeRng(seed);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const mo = i % 12; const s = shape[mo]; const tr = 1 + trendPerYr * (i / 12);
    let v = base * s * tr * (1 + (rng() - 0.5) * noise);
    if (intermittent && rng() < intermittent) v *= rng() * 0.3;
    out.push(Math.max(0, Math.round(v)));
  }
  return out;
}
const SHAPES = {
  winter: [1.55, 1.25, 0.8, 0.55, 0.4, 0.35, 0.4, 0.55, 0.95, 1.35, 1.7, 1.85],
  summer: [0.5, 0.55, 0.75, 1.05, 1.4, 1.65, 1.7, 1.55, 1.15, 0.8, 0.55, 0.45],
  steady: [0.95, 0.9, 1.0, 1.05, 1.05, 1.0, 0.9, 0.85, 1.05, 1.1, 1.15, 1.0],
  holiday: [0.7, 0.65, 0.75, 0.8, 0.85, 0.8, 0.8, 0.9, 1.05, 1.2, 1.7, 2.0],
};
const N_MO = 48, START = "2021-01";
const APPAREL = [
  { id: "AN-FJ", nm: "Heritage Field Jacket", cat: "Outerwear · seasonal", price: 240, unitCost: 96, salvage: 30, series: genSeries(11, N_MO, 420, 0.18, SHAPES.winter, 0.18, 0) },
  { id: "AN-TEE", nm: "Everyday Organic Tee", cat: "Core basic · high volume", price: 38, unitCost: 14, salvage: 4, series: genSeries(22, N_MO, 2600, 0.05, SHAPES.steady, 0.12, 0) },
  { id: "AN-ML", nm: "Merino Base Layer", cat: "Performance · winter", price: 130, unitCost: 52, salvage: 16, series: genSeries(33, N_MO, 640, 0.1, SHAPES.winter, 0.2, 0) },
  { id: "AN-LIN", nm: "Linen Camp Shirt", cat: "Seasonal · summer", price: 88, unitCost: 33, salvage: 10, series: genSeries(44, N_MO, 780, 0.06, SHAPES.summer, 0.19, 0) },
  { id: "AN-SS", nm: "Tactical Softshell", cat: "Defense contract · lumpy", price: 320, unitCost: 140, salvage: 40, series: genSeries(55, N_MO, 300, 0.12, SHAPES.steady, 0.25, 0.22) },
  { id: "AN-HD", nm: "Limited-Run Hoodie", cat: "Trend · volatile", price: 96, unitCost: 36, salvage: 8, series: genSeries(66, N_MO, 900, -0.1, SHAPES.holiday, 0.3, 0) },
];

export function loadApparel(): SkuItem[] {
  return APPAREL.map((a) => ({ id: a.id, nm: a.nm, cat: a.cat, labels: monthsFrom(START, N_MO), series: a.series, econ: { price: a.price, unitCost: a.unitCost, salvage: a.salvage }, real: false, src: "Illustrative sample data" }));
}
export function loadReal(): SkuItem[] {
  return Object.keys(REAL).map((k) => { const d = REAL[k]; return { id: k, nm: d.name, cat: d.cite, labels: monthsFrom(d.start, d.vals.length), series: d.vals.slice(), econ: { ...REAL_ECON[k] }, real: true, src: "Real public dataset" }; });
}

export function parseCSV(text: string): SkuItem[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const head = lines[0].toLowerCase();
  const hasHeader = /sku|date|month|unit|qty|sales|demand|product/.test(head);
  const rows = (hasHeader ? lines.slice(1) : lines).map((l) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, "")));
  let skuCol = -1, dateCol = -1, valCol = -1;
  if (hasHeader) {
    const h = lines[0].split(",").map((c) => c.trim().toLowerCase());
    h.forEach((c, i) => {
      if (/sku|product|item|style/.test(c) && skuCol < 0) skuCol = i;
      if (/date|month|period|week/.test(c) && dateCol < 0) dateCol = i;
      if (/unit|qty|quantity|sales|demand|volume/.test(c) && valCol < 0) valCol = i;
    });
  }
  const nc = rows[0] ? rows[0].length : 0;
  if (valCol < 0) valCol = nc - 1;
  if (nc >= 3) { if (skuCol < 0) skuCol = 0; if (dateCol < 0) dateCol = 1; }
  else if (nc === 2) { if (dateCol < 0) dateCol = 0; valCol = 1; }
  else { valCol = 0; }
  const groups: Record<string, { labels: string[]; series: number[] }> = {};
  rows.forEach((r, idx) => {
    const sku = skuCol >= 0 && nc >= 3 ? r[skuCol] : "Series";
    const v = parseFloat(r[valCol]); if (isNaN(v)) return;
    const date = dateCol >= 0 ? r[dateCol] : String(idx);
    (groups[sku] = groups[sku] || { labels: [], series: [] });
    groups[sku].labels.push(date); groups[sku].series.push(Math.max(0, v));
  });
  return Object.keys(groups).map((sku) => ({ id: "csv-" + sku, nm: sku, cat: "Uploaded · " + groups[sku].series.length + " periods", labels: groups[sku].labels, series: groups[sku].series, econ: { price: 100, unitCost: 45, salvage: 15 }, real: true, src: "Your data" }));
}
