import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ArwesProvider } from "@/components/providers/ArwesProvider";
import { Toaster } from "sonner";
import { validateEnv } from "@/lib/env-check";

// Validate environment variables at startup
validateEnv();

const inter = Inter({ subsets: ["latin"], variable: "--font-body" });
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Exoskull - Adaptive Life Operating System",
  description: "Self-optimizing multi-tenant AI assistant for life management",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} ${inter.className} bg-background text-foreground`}
      >
        <ThemeProvider>
          <ArwesProvider>
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-lg focus:text-sm"
            >
              Przejdź do treści
            </a>
            {children}
            <Toaster richColors position="top-right" />
          </ArwesProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
