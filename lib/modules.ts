import type { LucideIcon } from "lucide-react";
import type { ModuleKey } from "@/lib/auth/permissions";
import { Truck, Package, Receipt, Users, Car, MessageSquare } from "lucide-react";

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
  /** Jogosultsági kulcs — ModuleKey, hogy egy elírt kulcs fordításkor kiderüljön (audit BIZ-14). */
  key: ModuleKey;
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
    status: "elkeszult",
    description:
      "Telephelyenkénti raklap- és eszközkészlet, mozgások, felvásárlás, kassza, leltár.",
  },
  {
    key: "fuvarozas",
    label: "Fuvarozás",
    href: "/fuvarozas2",
    icon: Truck,
    status: "elkeszult",
    description: "Kocsik (kocsinként egy sáv: hol van, tachó, futó fuvar haladása, heti bevétel és üres km, következő szabad nap → ajánlat; kocsi lapja: nap, hét, kihasználtság, telemetria · Ma: mai és holnapi megállók, eltérések · Hét: a hét réseivel és a kocsira váró fuvarokkal · Ajánlat: Timocom + kalkulátor — útdíj, üzemanyag, önköltség, ár; „Megnyertük” egy kattintással megbízást csinál) · Megbízások (bér- és saját fuvarok, pénz-nézet, levelek, partnerek) · Pénz (Áttekintés: bérfuvar havi/heti csempék, kocsi-kihasználtság hét/hónap — rakott nap, bevétel és fedezet kocsinként —, eredmény; Kimutatás; Költségek). Ecofleet telemetria: élő tachó-vezetési idő (Kocsik, Hét, sofőr-app), napi CAN-üzemanyag.",
  },
  {
    key: "jarmuvek",
    label: "Járművek",
    href: "/jarmuvek",
    icon: Car,
    status: "fejlesztes-alatt",
    description: "Járművek törzsadata (új kamion felvétele, rendszám, pótkocsi és raklap-kapacitás, sofőr, Ecofleet GPS, fogyasztás, Euro-osztály; szervizig km, CAN-fogyasztás, tengelyterhelés), pótkocsik, okmányok és sofőr-okmányok lejárat-figyeléssel.",
  },
  {
    key: "szamlak",
    label: "Számlák",
    href: "/szamlak",
    icon: Receipt,
    status: "elkeszult",
    description:
      "Kintlévőség-követő: a Számlázz.hu-ban kiállított számlákat húzza be automatikusan (óránkénti helyett 15 percenkénti szinkron 6–22 óra között), Fuvar/Raklap kategorizálással.",
  },
  {
    key: "dolgozok",
    label: "Dolgozók",
    href: "/dolgozok",
    icon: Users,
    status: "elkeszult",
    description:
      "Alkalmazottak bérszámolása (heti/napi/fix havi bérmód), kifizetés-jelölés, archívum. Előlegek: a felvett összeget itt rögzíted, a fizetéskori levonás a bérkártya Előleg mezőjéből keletkezik, és mindkettőt a dolgozó nyugtázza a telefonján.",
  },
  {
    key: "jelenlet",
    label: "Jelenléti/üzenőfal",
    href: "/jelenlet",
    icon: MessageSquare,
    status: "elkeszult",
    description:
      "Napi érkezés és távozás (naponta többször is), havi napló hetekre bontva a 9 órás mércéhez mért eltéréssel, telephelyi feladat-üzenőfal ismétlődéssel. Szabadság: a dolgozó a telefonján kéri (a mai napra is), az admin a Szabadság oldalon hagyja jóvá vagy rögzíti bárkinek, éves rácson látszik, ki mikor van távol és hol torlódnak; az ünnepnapok és áthelyezett pihenőnapok nem fogyasztják a keretet. Dolgozói mobil: jelenlét, feladatok, Profil (kivehető szabadság, szabadság-kérés, előleg év/hónap bontásban); sofőröknél saját fuvar-nézet is.",
  },
];
