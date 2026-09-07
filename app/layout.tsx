import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
];

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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

  return (
    <html
      lang="hu"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <AppShell isAdmin={isAdmin} visibleModuleKeys={visibleModuleKeys}>
          {children}
        </AppShell>
        <Toaster />
      </body>
    </html>
  );
}
