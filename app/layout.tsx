import type { Metadata, Viewport } from "next";
import { PreferredModelProvider } from "@/components/account/use-preferred-model";
import { AuthProvider } from "@/components/auth-provider";
import { ThemeProvider } from "@/components/workspace/theme-provider";
import "./fonts/google-sans.css";
import "./globals.css";

  const THEME_BOOT =
  "(function(){try{var p=location.pathname.replace(/\\/+$/,'')||'/';var m=p==='/'||p==='/login'||p==='/privacy'||p==='/terms';var r=document.documentElement;var old=['dark','light','coffee','razer','crimson','contrast','high-contrast','marketing'];r.classList.remove.apply(r.classList,old);var raw=localStorage.getItem('tv.theme');var t=raw==='light'||raw==='coffee'?'light':'dark';if(m)r.classList.add('dark','marketing');else r.classList.add(t);var palettes={default:{light:'#1d1d1f',dark:'#ffffff'},blue:{light:'#007aff',dark:'#007aff'},red:{light:'#ff3b30',dark:'#ff453a'},yellow:{light:'#ffcc00',dark:'#ffd600'},green:{light:'#248a3d',dark:'#30d158'},orange:{light:'#ff8d28',dark:'#ff9230'},purple:{light:'#8944ab',dark:'#bf5af2'}};var a={};try{a=JSON.parse(localStorage.getItem('tv.theme.accents')||'{}')}catch(e){}var id=a[t];var accent=palettes[id]&&palettes[id][t]||palettes.default[t];r.style.setProperty('--accent',m?'#0091ff':accent);r.style.setProperty('--pick',m?'#0091ff':accent);var hc=!m&&t==='dark'&&localStorage.getItem('tv.highContrast')==='1';r.classList.toggle('high-contrast',hc);r.dataset.theme=m?'dark':t;var standalone=window.navigator.standalone===true||(window.matchMedia&&window.matchMedia(\"(display-mode: standalone)\").matches);if(standalone)r.classList.add('ios-standalone');var color=m?'#111111':hc?'#000000':t==='light'?'#ececee':'#1d1d1f';var theme=document.querySelector('meta[name=\"theme-color\"]');if(theme)theme.setAttribute('content',color);var bar=document.querySelector('meta[name=\"apple-mobile-web-app-status-bar-style\"]');if(bar)bar.setAttribute('content',(!m&&t==='light')?'default':'black')}catch(e){document.documentElement.classList.add('dark')}})();";

export const metadata: Metadata = {
  title: "TobyVerse",
  description: "Build worlds with AI.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
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
  themeColor: "#1d1d1f",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark font-sans" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="bg-background font-sans text-foreground antialiased">
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <AuthProvider>
          <ThemeProvider>
            <PreferredModelProvider>{children}</PreferredModelProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
