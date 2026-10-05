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
    description: "Megbízások (bér- és saját fuvarok két oszlopban, szakaszonként), kalkulátor (útdíj, üzemanyag, önköltség, ajánlat), tervezés, élő GPS és kimutatás.",
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
