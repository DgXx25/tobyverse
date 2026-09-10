import type { Metadata, Viewport } from "next";
import { PreferredModelProvider } from "@/components/account/use-preferred-model";
import { AuthProvider } from "@/components/auth-provider";
import { ThemeProvider } from "@/components/workspace/theme-provider";
import "./fonts/google-sans.css";
import "./globals.css";

const THEME_BOOT =
  "(function(){try{var p=location.pathname.replace(/\\/+$/,'')||'/';var m=p==='/'||p==='/login'||p==='/privacy'||p==='/terms';var r=document.documentElement;r.classList.remove('dark','light','coffee','razer','crimson','marketing');var t=localStorage.getItem('tv.theme');if(m){r.classList.add('dark','marketing')}else if(t==='light'||t==='coffee'||t==='razer'||t==='crimson'||t==='dark'){r.classList.add(t)}else{r.classList.add('dark')}if(window.navigator.standalone)r.classList.add('ios-standalone');var surfaces={light:'#ffffff',dark:'#1c1b1a',coffee:'#f7eee4',razer:'#111111',crimson:'#111111'};var color=m?'#0a0a0a':(surfaces[t]||surfaces.dark);var theme=document.querySelector('meta[name=\"theme-color\"]');if(theme)theme.setAttribute('content',color);var bar=document.querySelector('meta[name=\"apple-mobile-web-app-status-bar-style\"]');if(bar)bar.setAttribute('content',(!m&&(t==='light'||t==='coffee'))?'default':'black')}catch(e){document.documentElement.classList.add('dark')}})();";

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
  themeColor: "#1c1b1a",
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
        <link
          href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wght@8..144,100..900&family=Noto+Sans+Georgian:wdth,wght@62.5..100,100..900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-background font-sans text-foreground antialiased">
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <ThemeProvider>
          <AuthProvider>
            <PreferredModelProvider>{children}</PreferredModelProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
