import type { Metadata } from "next";
import NavBar from "@/components/NavBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Poker with AI",
  description: "A No-Limit Hold'em table where AI characters play against you — and talk.",
};

const THEME_INIT = `try{var t=localStorage.getItem('poker-theme');if(t)document.documentElement.dataset.theme=t;}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* all six theme font families */}
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Instrument+Serif:ital@0;1&family=Space+Grotesk:wght@400;500;700&family=Silkscreen&family=Pixelify+Sans:wght@400;600&family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=JetBrains+Mono:wght@400;700&family=Caveat:wght@400;600&family=Kalam:wght@400;700&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="bg-page flex min-h-full flex-col text-cream">
        <NavBar />
        {children}
      </body>
    </html>
  );
}
