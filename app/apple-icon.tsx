import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{
        width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#1c2434",
      }}>
        <svg width="128" height="128" viewBox="0 0 64 64">
          <path d="M14 44 L26 24 L36 36 L50 14" fill="none" stroke="#e8622c" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="50" cy="14" r="5" fill="#e8622c" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
