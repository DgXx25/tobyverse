import type { Metadata, Viewport } from "next";
import "lenis/dist/lenis.css";
import "./globals.css";
import { LenisProvider } from "@/components/lenis-provider";

  const THEME_BOOT =
  "(function(){try{var p=location.pathname.replace(/\\/+$/,'')||'/';var m=p==='/'||p==='/login'||p==='/privacy'||p==='/terms'||p==='/refunds'||p==='/pricing';var r=document.documentElement;if(/Mac|iPhone|iPad/.test(navigator.platform)||/Mac OS/.test(navigator.userAgent))r.classList.add('platform-mac');var old=['dark','light','coffee','razer','crimson','contrast','high-contrast','marketing'];r.classList.remove.apply(r.classList,old);var raw=localStorage.getItem('tv.theme');var t=raw==='light'||raw==='coffee'?'light':'dark';if(m)r.classList.add('dark','marketing');else r.classList.add(t);var palettes={default:{light:'#1d1d1f',dark:'#ffffff'},red:{light:'#FF383C',dark:'#FF4245'},orange:{light:'#FF8D28',dark:'#FF9230'},yellow:{light:'#FFCC00',dark:'#FFD600'},green:{light:'#34C759',dark:'#30D158'},mint:{light:'#00C8B3',dark:'#00DAC3'},teal:{light:'#00C3D0',dark:'#00D2E0'},cyan:{light:'#00C0E8',dark:'#3CD3FE'},blue:{light:'#0088FF',dark:'#0091FF'},indigo:{light:'#6155F5',dark:'#6D7CFF'},purple:{light:'#CB30E0',dark:'#DB34F2'},pink:{light:'#FF2D55',dark:'#FF375F'},brown:{light:'#AC7F5E',dark:'#B78A66'}};var a={};try{a=JSON.parse(localStorage.getItem('tv.theme.accents')||'{}')}catch(e){}var id=a[t];var accent=palettes[id]&&palettes[id][t]||palettes.default[t];r.style.setProperty('--accent',m?'#0091ff':accent);r.style.setProperty('--pick',m?'#0091ff':accent);var hc=!m&&t==='dark'&&localStorage.getItem('tv.highContrast')==='1';r.classList.toggle('high-contrast',hc);r.dataset.theme=m?'dark':t;var standalone=window.navigator.standalone===true||(window.matchMedia&&window.matchMedia(\"(display-mode: standalone)\").matches);if(standalone)r.classList.add('ios-standalone');var color=m?'#141414':hc?'#000000':t==='light'?'#f5f5f7':'#141414';var theme=document.querySelector('meta[name=\"theme-color\"]');if(theme)theme.setAttribute('content',color);var bar=document.querySelector('meta[name=\"apple-mobile-web-app-status-bar-style\"]');if(bar)bar.setAttribute('content',(!m&&t==='light')?'default':'black')}catch(e){document.documentElement.classList.add('dark')}})();";

export const metadata: Metadata = {
  title: "TobyVerse",
  description: "Build worlds with AI.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/logo.svg", sizes: "any", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180" },
      { url: "/apple-touch-icon-167x167.png", sizes: "167x167" },
      { url: "/apple-touch-icon-152x152.png", sizes: "152x152" },
      { url: "/apple-touch-icon-120x120.png", sizes: "120x120" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "TobyVerse",
    statusBarStyle: "black",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#141414",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark font-sans" suppressHydrationWarning>
      <body className="bg-background font-sans text-foreground antialiased">
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <LenisProvider>{children}</LenisProvider>
      </body>
    </html>
  );
}
