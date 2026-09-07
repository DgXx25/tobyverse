import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/components/auth-provider";
import { ThemeProvider } from "@/components/workspace/theme-provider";
import "./fonts/google-sans.css";
import "./globals.css";

const THEME_BOOT =
  "(function(){try{var t=localStorage.getItem('tv.theme');var r=document.documentElement;r.classList.remove('dark','light','coffee','razer','crimson');if(t==='light'||t==='coffee'||t==='razer'||t==='crimson'){r.classList.add(t)}else{r.classList.add('dark')}}catch(e){document.documentElement.classList.add('dark')}})();";

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
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
