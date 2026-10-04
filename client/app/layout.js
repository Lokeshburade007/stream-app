import "./globals.css";

export const metadata = {
  title: "StreamHub — Private Cinema & Multi-Device Watch Party",
  description: "Next-generation streaming platform with cross-device sync, HLS video player, and real-time synchronized watch party with friends powered by SecurePool.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon.png", sizes: "64x64", type: "image/png" }
    ],
    apple: [
      { url: "/icon.png", sizes: "64x64", type: "image/png" }
    ]
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icon.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
