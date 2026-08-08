import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeApplicator } from "@/components/providers/theme-applicator";
import "./globals.css";

export const metadata: Metadata = {
  title: "Family Financial OS",
  description: "Ekonomiskt operativsystem för hushållet",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sv" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Source+Sans+3:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var a=localStorage.getItem("ffos-appearance");var d=a==="dark"||(a!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark");}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <QueryProvider>
          <ThemeApplicator />
          <AuthShell>{children}</AuthShell>
        </QueryProvider>
      </body>
    </html>
  );
}
