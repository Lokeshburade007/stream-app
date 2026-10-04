export default function manifest() {
  return {
    name: "StreamHub Watch Party",
    short_name: "StreamHub",
    description: "Watch synchronized movies with chat and party voice.",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#141414",
    orientation: "any",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.png", sizes: "64x64", type: "image/png", purpose: "any" }
    ]
  };
}
