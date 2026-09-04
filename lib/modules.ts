import type { LucideIcon } from "lucide-react";
import { Truck, Package, Receipt, Users, Car } from "lucide-react";

// Központi modul-nyilvántartás a főoldal (Info) számára.
//
// Amikor egy modult a saját ablakában kifejlesztünk, ide csak annyi tér
// vissza, hogy a lenti bejegyzését frissítjük (status, description) —
// a modul saját funkcióit ez a fájl nem tartalmazza.

export type ModuleStatus = "elkeszult" | "fejlesztes-alatt" | "tervezes-alatt";

export const MODULE_STATUS_LABEL: Record<ModuleStatus, string> = {
  elkeszult: "Élesben",
  "fejlesztes-alatt": "Fejlesztés / tesztelés alatt",
  "tervezes-alatt": "Tervezés alatt",
};

export type ModuleInfo = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  status: ModuleStatus;
  description: string;
};

export const MODULES: ModuleInfo[] = [
  {
    key: "keszlet",
    label: "Készlet",
    href: "/keszlet",
    icon: Package,
    status: "fejlesztes-alatt",
    description:
      "Telephelyenkénti raklap- és eszközkészlet, mozgások, felvásárlás, kassza, leltár.",
  },
  {
    key: "fuvarozas",
    label: "Fuvarozás",
    href: "/fuvarozas",
    icon: Truck,
    status: "fejlesztes-alatt",
    description: "Ecofleet GPS-pozíció élesben. Fuvarkezelés, ütemezés kidolgozás alatt, saját beszélgetésben.",
  },
  {
    key: "jarmuvek",
    label: "Járművek",
    href: "/jarmuvek",
    icon: Car,
    status: "tervezes-alatt",
    description: "A modul funkciói még nincsenek kidolgozva.",
  },
  {
    key: "szamlak",
    label: "Számlák",
    href: "/szamlak",
    icon: Receipt,
      status: "fejlesztes-alatt",
    description: "A modul funkciói kidolgozás alatt, saját beszélgetésben.",
  },
  {
    key: "dolgozok",
    label: "Dolgozók",
    href: "/dolgozok",
    icon: Users,
    status: "tervezes-alatt",
    description: "A modul funkciói még nincsenek kidolgozva.",
  },
];
