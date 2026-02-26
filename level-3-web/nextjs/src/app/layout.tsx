import type { Metadata } from "next";
import "./globals.css";

/**
 * Root Layout
 * -----------
 * Every page in the app is wrapped by this layout.
 * We load the Inter font from Google Fonts and set
 * page-level metadata (title, description) that Next.js
 * uses to generate <head> tags automatically.
 */

export const metadata: Metadata = {
  title: "Duke ML Chatbot",
  description:
    "A web-based chat interface powered by Azure AI Foundry and the OpenAI Responses API",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Load Inter font from Google Fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
