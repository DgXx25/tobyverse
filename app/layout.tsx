import type { Metadata } from "next";
import { AuthProvider } from "@/components/auth-provider";
import { ThemeProvider } from "@/components/workspace/theme-provider";
import "./fonts/google-sans.css";
import "./globals.css";

const THEME_BOOT =
  "(function(){try{var t=localStorage.getItem('tv.theme');var r=document.documentElement;r.classList.remove('dark','light','coffee','razer');if(t==='light'||t==='coffee'||t==='razer'){r.classList.add(t)}else{r.classList.add('dark')}}catch(e){document.documentElement.classList.add('dark')}})();";

export const metadata: Metadata = {
  title: "TobyVerse",
  description: "Build worlds with AI.",
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
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
