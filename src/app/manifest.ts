import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Contact AI",
    short_name: "Contact AI",
    description: "AI-powered contacts",
    start_url: "/",
    display: "standalone",
    background_color: "#faf8f4",
    theme_color: "#4f46e5",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
