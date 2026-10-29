import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { AppShell } from "@/components/layout/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { verifySession } from "@/lib/auth/dal";
import type { ModuleKey } from "@/lib/auth/permissions";
import "./globals.css";

const MODULES_FOR_NAV: ModuleKey[] = [
  "info",
  "fuvarozas",
  "keszlet",
  "szamlak",
  "dolgozok",
  "jelenlet",
  "jarmuvek",
  "elszamolas",
];

// Redesign 0 (2026-10-29): a törzsbetű Geist helyett Inter (Apple HIG-közeli
// karakter, jó magyar ékezetes lefedettséggel — ezért a `latin-ext` subset is).
// A CSS-változó neve szándékosan marad `--font-geist-sans`: így a globals.css
// `--font-sans` kötése és minden rá hivatkozó modul változatlan maradhat.
const interSans = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Well-Worn Pallet — Vállalatirányítás",
  description: "Well-Worn Pallet Kft. belső vállalatirányítási rendszere",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await verifySession();
  const isAdmin = session.isAuth && session.role === "admin";
  const visibleModuleKeys = session.isAuth
    ? MODULES_FOR_NAV.filter((key) => session.can(key).view)
    : [];
  const hiddenHrefs: string[] = [];

  return (
    <html
      lang="hu"
      className={`${interSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <AppShell isAdmin={isAdmin} visibleModuleKeys={visibleModuleKeys} hiddenHrefs={hiddenHrefs}>
          {children}
        </AppShell>
        <Toaster />
      </body>
    </html>
  );
}
