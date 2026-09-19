import type { LucideIcon } from "lucide-react";
import {
  Truck,
  Package,
  Receipt,
  Users,
  Car,
  LayoutDashboard,
  MessageSquare,
} from "lucide-react";
import type { ModuleKey } from "@/lib/auth/permissions";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  key: ModuleKey;
  /** További kulcsok, amelyek bármelyike is megjeleníti a menüpontot (pl. az Elszámolás hatóköre). */
  altKeys?: ModuleKey[];
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Info", icon: LayoutDashboard, key: "info" },
  { href: "/fuvarozas", label: "Fuvarozás", icon: Truck, key: "fuvarozas" },
  // Fuvarozás 2 — a flag (lib/fuvarozas2/flag.ts) dönti, látszik-e; az
  // AppShell a hiddenHrefs alapján rejti. Szabina az "elszamolas" kulccsal látja.
  { href: "/fuvarozas2", label: "Fuvarozás 2", icon: Truck, key: "fuvarozas", altKeys: ["elszamolas"] },
  { href: "/keszlet", label: "Készlet", icon: Package, key: "keszlet" },
  { href: "/szamlak", label: "Számlák", icon: Receipt, key: "szamlak" },
  { href: "/dolgozok", label: "Dolgozók", icon: Users, key: "dolgozok" },
  {
    href: "/jelenlet",
    label: "Jelenléti/üzenőfal",
    icon: MessageSquare,
    key: "jelenlet",
  },
  { href: "/jarmuvek", label: "Járművek", icon: Car, key: "jarmuvek" },
];

export const SITES = ["Szakoly", "Balkány", "Nyíregyháza"] as const;
export type Site = (typeof SITES)[number];
