import { ImageResponse } from "next/og";

export const alt = "Loom Reach — demand-driven production planning";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";


export default function OGImage() {
  return new ImageResponse(
    (
      <div style={{
        width: "100%", height: "100%", display: "flex", flexDirection: "column",
        background: "#f7f8fa", padding: 64, fontFamily: "sans-serif",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", width: 44, height: 44, borderRadius: 10, background: "#1c2434", alignItems: "center", justifyContent: "center" }}>
            <svg width="30" height="30" viewBox="0 0 64 64">
              <path d="M14 44 L26 24 L36 36 L50 14" fill="none" stroke="#e8622c" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: "#1c2434" }}>
            Loom<span style={{ color: "#e8622c" }}>/</span>Reach
          </div>
          <div style={{ display: "flex", marginLeft: "auto", fontSize: 16, color: "#7a8494", letterSpacing: 3, textTransform: "uppercase" }}>
            demand-driven production
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 800, color: "#1c2434", lineHeight: 1.05, letterSpacing: -2 }}>
            How many do you
          </div>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 800, color: "#e8622c", lineHeight: 1.05, letterSpacing: -2 }}>
            actually make?
          </div>
          <div style={{ display: "flex", marginTop: 26, fontSize: 25, color: "#525c6b", maxWidth: 900, lineHeight: 1.45 }}>
            Cross-validated forecasts, priced uncertainty, the optimal cut quantity, and the dollar value of a fast second cut — for every SKU.
          </div>
        </div>
        <div style={{ display: "flex", marginTop: 42, gap: 34, fontSize: 18, color: "#7a8494" }}>
          <span>model competition · MASE / WAPE</span>
          <span>newsvendor Q*</span>
          <span>quick response</span>
          <span>Shopify ingest</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
