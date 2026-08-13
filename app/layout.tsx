import type { Metadata } from "next";
import NavBar from "@/components/NavBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Poker with AI",
  description: "A No-Limit Hold'em table where AI characters play against you — and talk.",
};

const THEME_INIT = `try{var t=localStorage.getItem('poker-theme');if(t&&['parlor','pixel','neon','sumi','bauhaus','terminal','sketch'].indexOf(t)>-1)document.documentElement.dataset.theme=t;}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* all seven theme font families */}
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Instrument+Serif:ital@0;1&family=Silkscreen&family=Pixelify+Sans:wght@400;600&family=JetBrains+Mono:wght@400;700&family=Caveat:wght@400;600&family=Kalam:wght@400;700&family=Chakra+Petch:wght@400;500;600&family=Space+Mono:wght@400;700&family=Zen+Kaku+Gothic+New:wght@300;400;500&family=Zen+Old+Mincho:wght@400;600&family=Archivo:wght@400;500;700&display=swap"
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
