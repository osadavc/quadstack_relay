import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Relay",
    short_name: "Relay",
    description: "Delivery planning for Waypoint Group",
    start_url: "/driver",
    display: "standalone",
    background_color: "#f7f5f3",
    theme_color: "#201e1b",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
