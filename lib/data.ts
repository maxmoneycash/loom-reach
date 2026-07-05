import { makeRng, type Econ } from "./engine";
import type { Drivers } from "./forecast";

export interface Bom {
  fabric: string;          // primary material, named like a tech pack
  ydsPerUnit: number;      // yards (or m² for filter media) per finished unit
  sewMin: number;          // sewing/assembly minutes per unit
  cutMin: number;          // cutting minutes per unit
  leadWeeks: number;       // material lead time (Berry NYCO ~24-36wk; commercial ~6-10wk)
  origin: string;          // where the material comes from
}
export interface SkuItem {
  id: string; nm: string; cat: string; labels: string[]; series: number[];
  econ: Econ; real: boolean; src: string; drivers?: Drivers;
  story?: string;          // one-line real-world grounding, shown in the SKU screen
  sizeW?: number[];        // default size-curve weights (e.g. a deliberately broken curve)
  bom?: Bom;               // materials & labor spec — the factory side of the plan
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
  opts: { priceBase: number; promoLift?: number; elasticity?: number; intermittent?: boolean; noMarkdown?: boolean; stepAt?: number; stepMul?: number; steps?: { at: number; mul: number }[] }): Gen {
  const rng = makeRng(seed);
  const promoLift = opts.promoLift ?? 0.5, elasticity = opts.elasticity ?? 1.1;
  const promoSet = new Set<number>();
  for (let y = 0; y < Math.ceil(n / 12); y++) for (let c = 0; c < 2; c++) promoSet.add(y * 12 + Math.floor(rng() * 12)); // ~2 promos/yr, year-varying
  const series: number[] = [], price: number[] = [], promo: number[] = [];
  for (let i = 0; i < n; i++) {
    const mo = i % 12, s = shape[mo], tr = 1 + trendPerYr * (i / 12);
    const pr = !opts.noMarkdown && mo === 7 ? opts.priceBase * 0.75 : opts.priceBase; // mid-year clearance markdown
    price.push(Math.round(pr));
    const isP = promoSet.has(i) ? 1 : 0; promo.push(isP);
    let lvl = opts.stepAt != null && i >= opts.stepAt ? (opts.stepMul ?? 1) : 1;   // e.g. option-year plus-up or demand cliff
    if (opts.steps) for (const st of opts.steps) if (i >= st.at) lvl *= st.mul;    // multi-step: surge THEN cliff, etc.
    let v = base * s * tr * lvl * (1 + (rng() - 0.5) * noise) * (1 + promoLift * isP) * Math.pow(opts.priceBase / pr, elasticity);
    if (opts.intermittent && rng() > 0.28) v = 0; // sparse, lumpy demand (contract cadence)
    series.push(Math.max(0, Math.round(v)));
  }
  return { series, price, promo };
}
const SHAPES = {
  winter: [1.55, 1.25, 0.8, 0.55, 0.4, 0.35, 0.4, 0.55, 0.95, 1.35, 1.7, 1.85],
  summer: [0.5, 0.55, 0.75, 1.05, 1.4, 1.65, 1.7, 1.55, 1.15, 0.8, 0.55, 0.45],
  steady: [0.95, 0.9, 1.0, 1.05, 1.05, 1.0, 0.9, 0.85, 1.05, 1.1, 1.15, 1.0],
  holiday: [0.7, 0.65, 0.75, 0.8, 0.85, 0.8, 0.8, 0.9, 1.05, 1.2, 1.7, 2.0],
  smoke: [0.8, 0.75, 0.8, 0.85, 0.9, 1.0, 1.2, 1.55, 1.7, 1.25, 0.95, 0.85], // western wildfire season peaks Aug–Sep
};
const N_MO = 48, START = "2021-01";
const APPAREL = [
  { id: "AN-FJ", nm: "Heritage Field Jacket", cat: "Outerwear · seasonal", price: 240, unitCost: 96, salvage: 30, g: genSku(11, N_MO, 420, 0.18, SHAPES.winter, 0.16, { priceBase: 240, promoLift: 0.5, elasticity: 1.2 }) },
  { id: "AN-TEE", nm: "Everyday Organic Tee", cat: "Core basic · promo-driven", price: 38, unitCost: 14, salvage: 4, g: genSku(22, N_MO, 2600, 0.05, SHAPES.steady, 0.1, { priceBase: 38, promoLift: 0.8, elasticity: 1.6 }) },
  { id: "AN-ML", nm: "Merino Base Layer", cat: "Performance · winter", price: 130, unitCost: 52, salvage: 16, g: genSku(33, N_MO, 640, 0.1, SHAPES.winter, 0.18, { priceBase: 130, promoLift: 0.4, elasticity: 1.0 }) },
  { id: "AN-LIN", nm: "Linen Camp Shirt", cat: "Seasonal · summer", price: 88, unitCost: 33, salvage: 10, g: genSku(44, N_MO, 780, 0.06, SHAPES.summer, 0.17, { priceBase: 88, promoLift: 0.45, elasticity: 1.3 }) },
  { id: "AN-SS", nm: "Tactical Softshell", cat: "Defense contract · lumpy", price: 320, unitCost: 140, salvage: 40, g: genSku(55, N_MO, 1100, 0.12, SHAPES.steady, 0.2, { priceBase: 320, intermittent: true }) },
  { id: "AN-HD", nm: "Limited-Run Hoodie", cat: "Trend · volatile", price: 96, unitCost: 36, salvage: 8, g: genSku(66, N_MO, 900, -0.1, SHAPES.holiday, 0.28, { priceBase: 96, promoLift: 0.7, elasticity: 1.4 }) },
  { id: "AN-PK", nm: "Expedition Down Parka", cat: "Outerwear · deep winter", price: 480, unitCost: 210, salvage: 60, g: genSku(77, N_MO, 190, 0.22, SHAPES.winter, 0.22, { priceBase: 480, promoLift: 0.3, elasticity: 0.8 }) },
  { id: "AN-SK", nm: "Trail Sock 3-Pack", cat: "Accessory · high volume", price: 24, unitCost: 7, salvage: 2, g: genSku(88, N_MO, 5200, 0.08, SHAPES.steady, 0.09, { priceBase: 24, promoLift: 0.9, elasticity: 1.8 }) },
  { id: "AN-DR", nm: "Garment-Dyed Midi Dress", cat: "Seasonal · summer", price: 148, unitCost: 55, salvage: 18, g: genSku(99, N_MO, 520, 0.14, SHAPES.summer, 0.21, { priceBase: 148, promoLift: 0.5, elasticity: 1.25 }) },
  { id: "AN-CP", nm: "Waxed Field Cap", cat: "Accessory · gift season", price: 42, unitCost: 15, salvage: 5, g: genSku(111, N_MO, 1400, 0.03, SHAPES.holiday, 0.24, { priceBase: 42, promoLift: 0.75, elasticity: 1.5 }) },
];

export function loadApparel(): SkuItem[] {
  return APPAREL.map((a) => ({
    id: a.id, nm: a.nm, cat: a.cat, labels: monthsFrom(START, N_MO), series: a.g.series,
    econ: { price: a.price, unitCost: a.unitCost, salvage: a.salvage }, real: false, src: "Illustrative sample data",
    drivers: { price: a.g.price, promo: a.g.promo },
    bom: BOMS[a.id],
  }));
}
/* ---- GROUNDED catalogs: illustrative demand, but every SKU is modeled on a
   cited real program or public filing (see docs/research-grounding.md). ---- */
const DEFENSE = [
  { id: "DL-IHW", nm: "Hot-Weather Combat Coat", cat: "DLA IDIQ · steady + option years", price: 78, unitCost: 70, salvage: 8,
    g: genSku(211, N_MO, 19500, 0.02, SHAPES.steady, 0.1, { priceBase: 78, promoLift: 0, elasticity: 0, noMarkdown: true, stepAt: 24, stepMul: 1.35 }),
    story: "Modeled on DLA's 2021 solicitation: ~240,000 hot-weather uniforms a year at ~$150/set on a 5-year IDIQ — option-year quantities are the gamble. FFP margins run 8–12%." },
  { id: "DL-SPK", nm: "Assault Pack (SOCOM channel)", cat: "Surge orders · lumpy", price: 420, unitCost: 290, salvage: 80,
    g: genSku(222, N_MO, 9000, 0.05, SHAPES.steady, 0.3, { priceBase: 420, promoLift: 0, elasticity: 0, noMarkdown: true, intermittent: true }),
    story: "Modeled on USSOCOM SPEAR pack buys through the $33B SOE TLS vehicle — near-zero baseline, then episodic 5–10k-unit delivery orders (Soldier Systems, 2016/2021)." },
  { id: "DL-FRB", nm: "FR Base Layer (Safe-to-Fly)", cat: "Certified · no substitution", price: 95, unitCost: 52, salvage: 30,
    g: genSku(233, N_MO, 950, 0.08, SHAPES.winter, 0.18, { priceBase: 95, promoLift: 0, elasticity: 0, noMarkdown: true }),
    story: "Modeled on DRIFIRE / Massif Berry-compliant FR layers: aircrew certification bars substitution, so a forecast miss is a stockout — it can't be papered over with another vendor." },
  { id: "DL-AWC", nm: "All-Weather Coat (Selma line)", cat: "Small contractor · seasonal", price: 62, unitCost: 55, salvage: 6,
    g: genSku(244, N_MO, 2400, 0.03, SHAPES.winter, 0.15, { priceBase: 62, promoLift: 0, elasticity: 0, noMarkdown: true }),
    story: "Modeled on American Apparel Inc.'s (Selma, AL) $31.7M DLA all-weather coat IDIQ (Nov 2023) — one plant, several concurrent lines, fabric committed before option years are exercised." },
  { id: "DT-FSR", nm: "FSR Crew Kit (defense-tech)", cat: "Tiny volumes · fast turns", price: 180, unitCost: 95, salvage: 25,
    g: genSku(255, N_MO, 140, 0.15, SHAPES.steady, 0.25, { priceBase: 180, promoLift: 0, elasticity: 0, noMarkdown: true }),
    story: "Illustrative: field-service crew kit for a defense-tech firm (Epirus-style) — a handful of sizes, 4-week turns. Modeled, not a claimed relationship." },
];
const DTC = [
  { id: "DC-SCR", nm: "Performance Scrub Top", cat: "Glut regime · demand cliff", price: 38, unitCost: 14, salvage: 5,
    g: genSku(311, N_MO, 3200, -0.06, SHAPES.steady, 0.14, { priceBase: 38, promoLift: 0.5, elasticity: 1.3, stepAt: 20, stepMul: 0.7 }),
    story: "Modeled on FIGS 2022: inventory ordered into the boom landed as demand normalized — storage costs alone added 2.5pts of revenue to selling expense (SEC Q3 2022 8-K)." },
  { id: "DC-WRA", nm: "Wool Apparel Line", cat: "New category · fading", price: 98, unitCost: 42, salvage: 12,
    g: genSku(322, N_MO, 1400, -0.35, SHAPES.steady, 0.3, { priceBase: 98, promoLift: 0.6, elasticity: 1.4 }),
    story: "Modeled on Allbirds' 2022 apparel expansion: a new category with no history missed hard — $11.6M written down in one quarter (SEC 8-K, Aug 2022)." },
  { id: "DC-ALN", nm: "Studio Legging", cat: "Sellout regime · hero product", price: 118, unitCost: 46, salvage: 20,
    g: genSku(333, N_MO, 2100, 0.3, SHAPES.steady, 0.15, { priceBase: 118, promoLift: 0.35, elasticity: 1.1 }),
    story: "Modeled on Lululemon 2013: a recall pulled ~17% of bottoms and the hero product sold out for months — the understock side of the same coin (corporate.lululemon.com)." },
  { id: "DC-BPD", nm: "Inclusive-Sizing Denim", cat: "Size-curve risk", price: 89, unitCost: 34, salvage: 11,
    g: genSku(344, N_MO, 1800, 0.06, SHAPES.holiday, 0.18, { priceBase: 89, promoLift: 0.5, elasticity: 1.3 }),
    sizeW: [14, 19, 24, 19, 13, 11],
    story: "Modeled on Old Navy's 2022 BODEQUALITY rollout: extended sizes over-bought while core sizes stocked out — merch margin fell ~5pts (SEC Q2 2022). The size curve below starts flat, like theirs did. Fix it." },
];

const FILTRATION = [
  { id: "FL-N95", nm: "N95 Respirator (meltblown)", cat: "Surge → cliff · cases of 100", price: 95, unitCost: 68, salvage: 6,
    g: genSku(411, N_MO, 4000, 0, SHAPES.steady, 0.22, { priceBase: 95, promoLift: 0, elasticity: 0, noMarkdown: true, steps: [{ at: 10, mul: 4.2 }, { at: 26, mul: 0.08 }] }),
    story: "Modeled on DemeTech (Miami), 2020–22: scaled to 1,500 workers making up to 5M masks a day, then laid off nearly all of them with 20M+ unsold N95s when buyers returned to ~$0.30 imports (WLRN)." },
  { id: "FL-SMS", nm: "Surgical Mask (SMS nonwoven)", cat: "Steady · import pressure", price: 28, unitCost: 21, salvage: 2,
    g: genSku(422, N_MO, 9000, -0.08, SHAPES.steady, 0.12, { priceBase: 28, promoLift: 0, elasticity: 0, noMarkdown: true }),
    story: "Modeled on the 2021 US mask glut: AMMA members sat on 260M unsold masks against $0.26–0.50 imports. The Make PPE in America Act now mandates 2-year domestic contracts (Congress.gov, Al Jazeera)." },
  { id: "FL-MRV", nm: "MERV-13 HVAC Filter Media", cat: "Growth + smoke season", price: 18, unitCost: 9, salvage: 4,
    g: genSku(433, N_MO, 5200, 0.12, SHAPES.smoke, 0.2, { priceBase: 18, promoLift: 0.3, elasticity: 1.1 }),
    story: "Modeled on the post-COVID MERV-13 shift plus wildfire season: demand steps up every smoke season, and the US purifier market is growing ~7%/yr on PM2.5 awareness (Grand View Research)." },
  { id: "FL-BAG", nm: "Baghouse Filter Bags (needlefelt)", cat: "Replacement cycle · batchy", price: 42, unitCost: 24, salvage: 5,
    g: genSku(444, N_MO, 950, 0.04, SHAPES.steady, 0.38, { priceBase: 42, promoLift: 0, elasticity: 0, noMarkdown: true }),
    story: "Modeled on baghouse consumables: bags last 1–3 years (aramid/PPS up to 5) with ~10–15% replaced yearly — 100,000+ bags installed globally per year (Baghouse America)." },
  { id: "FL-CBN", nm: "CBRN Adsorptive Fabric", cat: "Defense · episodic", price: 310, unitCost: 205, salvage: 40,
    g: genSku(455, N_MO, 2600, 0.06, SHAPES.steady, 0.3, { priceBase: 310, promoLift: 0, elasticity: 0, noMarkdown: true, intermittent: true }),
    story: "Modeled on JSLIST/UIPE carbon-sphere liners: JPEO-CBRND buys on ~$500M IDIQs (1 base + 4 option years) and nothing ships without recertification — no substitutes (Army.mil, Safeware)." },
  { id: "FL-WLD", nm: "Smoke Mask (retail 10-pack)", cat: "Wildfire spikes · volatile", price: 12, unitCost: 5, salvage: 1,
    g: genSku(466, N_MO, 2200, 0.1, SHAPES.smoke, 0.4, { priceBase: 12, promoLift: 0.6, elasticity: 1.4 }),
    story: "Modeled on retail smoke masks: demand tracks the fire map — near zero in spring, sellouts each August–September as smoke events hit (Grand View Research)." },
];

/* ---- tech-pack specs: material, consumption, labor, lead time ---- */
const BOMS: Record<string, Bom> = {
  "AN-FJ": { fabric: "10oz waxed cotton canvas", ydsPerUnit: 2.6, sewMin: 46, cutMin: 6, leadWeeks: 10, origin: "US-woven, Georgia" },
  "AN-TEE": { fabric: "180gsm organic cotton jersey", ydsPerUnit: 1.1, sewMin: 8, cutMin: 2, leadWeeks: 8, origin: "Carolina circular knit" },
  "AN-ML": { fabric: "18.5-micron merino jersey", ydsPerUnit: 1.3, sewMin: 14, cutMin: 3, leadWeeks: 14, origin: "AU merino, US-knit" },
  "AN-LIN": { fabric: "5.5oz washed linen", ydsPerUnit: 1.8, sewMin: 22, cutMin: 4, leadWeeks: 12, origin: "EU flax, US cut & sew" },
  "AN-SS": { fabric: "NYCO 50/50 ripstop + membrane", ydsPerUnit: 2.9, sewMin: 58, cutMin: 7, leadWeeks: 30, origin: "Berry-compliant NYCO" },
  "AN-HD": { fabric: "12oz cotton fleece", ydsPerUnit: 1.9, sewMin: 18, cutMin: 4, leadWeeks: 9, origin: "US circular knit" },
  "AN-PK": { fabric: "70D nylon + 700FP down", ydsPerUnit: 3.4, sewMin: 78, cutMin: 9, leadWeeks: 18, origin: "imported shell, US fill" },
  "AN-SK": { fabric: "cushioned merino blend yarn", ydsPerUnit: 0.15, sewMin: 4, cutMin: 1, leadWeeks: 12, origin: "US sock knitter" },
  "AN-DR": { fabric: "cotton poplin, garment-dyed", ydsPerUnit: 2.2, sewMin: 34, cutMin: 5, leadWeeks: 11, origin: "US-woven + dye house" },
  "AN-CP": { fabric: "10oz waxed duck", ydsPerUnit: 0.5, sewMin: 12, cutMin: 2, leadWeeks: 10, origin: "US-woven, waxed in-house" },
  "DL-IHW": { fabric: "NYCO 50/50 IHWCU twill", ydsPerUnit: 2.4, sewMin: 38, cutMin: 5, leadWeeks: 32, origin: "Berry fiber-to-fabric" },
  "DL-SPK": { fabric: "1000D Cordura + laminate", ydsPerUnit: 3.1, sewMin: 95, cutMin: 8, leadWeeks: 26, origin: "Berry-compliant mill" },
  "DL-FRB": { fabric: "FR modacrylic blend knit", ydsPerUnit: 1.4, sewMin: 16, cutMin: 3, leadWeeks: 24, origin: "certified FR spinner" },
  "DL-AWC": { fabric: "3-layer laminated shell", ydsPerUnit: 2.8, sewMin: 52, cutMin: 6, leadWeeks: 28, origin: "Berry laminator" },
  "DT-FSR": { fabric: "NYCO twill + FR panels", ydsPerUnit: 2.5, sewMin: 44, cutMin: 6, leadWeeks: 20, origin: "Berry NYCO" },
  "DC-SCR": { fabric: "4-way stretch polyester", ydsPerUnit: 1.5, sewMin: 18, cutMin: 3, leadWeeks: 9, origin: "imported knit" },
  "DC-WRA": { fabric: "merino French terry", ydsPerUnit: 1.7, sewMin: 20, cutMin: 4, leadWeeks: 16, origin: "traceable merino" },
  "DC-ALN": { fabric: "nylon-lycra warp knit", ydsPerUnit: 1.4, sewMin: 22, cutMin: 3, leadWeeks: 12, origin: "technical knitter" },
  "DC-BPD": { fabric: "11oz stretch denim", ydsPerUnit: 2.3, sewMin: 40, cutMin: 5, leadWeeks: 14, origin: "US denim mill" },
  "FL-N95": { fabric: "meltblown PP + spunbond, m²", ydsPerUnit: 0.6, sewMin: 1.2, cutMin: 0.3, leadWeeks: 20, origin: "US meltblown line" },
  "FL-SMS": { fabric: "SMS nonwoven, m²", ydsPerUnit: 0.4, sewMin: 0.5, cutMin: 0.2, leadWeeks: 12, origin: "US spunbond line" },
  "FL-MRV": { fabric: "electret filter media, m²", ydsPerUnit: 1.6, sewMin: 2, cutMin: 0.5, leadWeeks: 10, origin: "US media plant" },
  "FL-BAG": { fabric: "PPS needlefelt, m²", ydsPerUnit: 2.4, sewMin: 9, cutMin: 2, leadWeeks: 16, origin: "US needlepunch line" },
  "FL-CBN": { fabric: "carbon-sphere laminate, m²", ydsPerUnit: 1.8, sewMin: 25, cutMin: 4, leadWeeks: 36, origin: "certified CBRN line" },
  "FL-WLD": { fabric: "electrostatic nonwoven, m²", ydsPerUnit: 0.3, sewMin: 0.8, cutMin: 0.2, leadWeeks: 14, origin: "US converter" },
};

function toItems(list: typeof DEFENSE, src: string): SkuItem[] {
  return list.map((a) => ({
    id: a.id, nm: a.nm, cat: a.cat, labels: monthsFrom(START, N_MO), series: a.g.series,
    econ: { price: a.price, unitCost: a.unitCost, salvage: a.salvage }, real: false, src,
    drivers: { price: a.g.price, promo: a.g.promo },
    story: a.story, sizeW: (a as { sizeW?: number[] }).sizeW,
    bom: BOMS[a.id],
  }));
}
export function loadDefense(): SkuItem[] { return toItems(DEFENSE, "Grounded sample · defense"); }
export function loadDtc(): SkuItem[] { return toItems(DTC, "Grounded sample · DTC"); }
export function loadFiltration(): SkuItem[] { return toItems(FILTRATION, "Grounded sample · filtration"); }

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
