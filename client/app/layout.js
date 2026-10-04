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
  },
  applicationName: "StreamHub",
  appleWebApp: {
    capable: true,
    title: "StreamHub",
    statusBarStyle: "black-translucent"
  },
  formatDetection: {
    telephone: false
  }
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#141414"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icon.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
