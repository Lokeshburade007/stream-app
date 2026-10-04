import "./globals.css";

export const metadata = {
  title: "StreamHub — Private Cinema & Multi-Device Watch Party",
  description: "Next-generation streaming platform with cross-device sync, HLS video player, and real-time synchronized watch party with friends powered by SecurePool.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body>{children}</body>
    </html>
  );
}
