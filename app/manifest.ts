import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Loom Reach — demand-driven production",
    short_name: "Loom Reach",
    description: "Forecast demand with honest uncertainty and decide the production quantity that minimizes the cost of being wrong.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f8fa",
    theme_color: "#f7f8fa",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
