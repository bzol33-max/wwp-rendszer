// IDEIGLENES adatfájl — a Drive "Fuvarmegbizások" mappájában lévő
// megbízásokból (és a hozzájuk tartozó e-mailekből) egyszer kinyert
// partner-kapcsolatok. Csak az egyszeri feltöltéshez kell (lásd
// seedKapcsolatok() a lib/fuvarozas/kapcsolatok.ts-ben) — utána mindkettő
// törölhető.
import type { AddKapcsolatInput } from "@/lib/fuvarozas/kapcsolatok-constants";

export const KAPCSOLATOK_SEED: AddKapcsolatInput[] = [
  { ceg: "Trans-Sped Kft.", kapcsolattarto: "Pelle Kitti", email: "pelle.kitti@trans-sped.hu", forras: "48940_1788426129_order.pdf" },
  { ceg: "Trans-Sped Kft.", kapcsolattarto: "Kovács Gyöngyi", email: "kovacs.gyongyi@trans-sped.hu", forras: "email cc: Alvállalkozói megbízás 37941" },
  { ceg: "Trans-Sped Kft.", kapcsolattarto: "Tálas Viktória", email: "talas.viktoria@trans-sped.hu", forras: "MGB/26 fuvarfeladat 33313.pdf" },
  { ceg: "Trans-Sped Kft.", kapcsolattarto: "Végh András", email: "vegh.andras@trans-sped.hu", forras: "42448_1786441568_order.pdf" },
  { ceg: "Trans-Sped Kft.", kapcsolattarto: "Gerhard Edina", email: "gerhard.edina@trans-sped.hu", forras: "email cc: Alvállalkozói megbízás 30357" },
  { ceg: "Trans-Sped Kft.", email: "v-szamlak@trans-sped.hu", forras: "számlázási email (több fuvarmegbízás)" },

  { ceg: "RBT Europe Kft.", kapcsolattarto: "Orsós Dorottya", telefon: "+36 20 355 8797 / +36 70 313 9674", email: "dori.orsos@rbteurope.com", forras: "Megbízás (poz 2844/2683/2688).pdf" },

  { ceg: "Hajdúspedíció Kft.", kapcsolattarto: "Hajdu János", telefon: "30/9786-781, 36/545-110", email: "hajduspedicio@t-online.hu", forras: "Well-Worn Pallet 09.02/09.03 Nyírjákó-Ikrény / Pázmándfalu-Nagyhegyes" },

  { ceg: "Flott-Trans Kft.", kapcsolattarto: "Podlóczky Andrea", telefon: "+36 70 933 1533 / +36 70 933 1698", email: "flott@flott.hu", forras: "2026-01084 / 2026-01024 / 2026-00931-WELLWORNPA.pdf" },
  { ceg: "Flott-Trans Kft.", telefon: "+36 (36) 512-500", email: "szallitolevel@flott.hu", forras: "2026-01084-WELLWORNPA.pdf (dokumentum visszaküldési email)" },

  { ceg: "HAPP Kft.", kapcsolattarto: "Burkus Árpád", telefon: "+36 30 946 2726", email: "burkus.arpad@happ.eu", forras: "Fuvarmegbízás_0000129953/129356/128971/128972/128828/128468/128216.pdf" },
  { ceg: "HAPP Kft.", telefon: "+36 20 347 6882", email: "faktor@happ.eu", forras: "Fuvarmegbízás_0000129953.pdf (faktoring info)" },
  { ceg: "HAPP Kft.", email: "finance@happ.eu", forras: "Fuvarmegbízás_0000129953.pdf (számlázási email)" },

  { ceg: "ÁB Speed Szállítmányozási Kft.", kapcsolattarto: "Németh Ákos", telefon: "+36 20 594 2296", email: "akos.nemeth@abspeed.hu / akos@abspeed.hu", forras: "26-3456/3368/3367/3384/3198/3319/3318/3289/3102.pdf" },

  { ceg: "SG Transport Kft.", telefon: "+36 30 865 3166", email: "sgtransportkft@gmail.com", forras: "SG_Transport_fuvarmegbizas_20260810_11-HB-S-756.pdf" },

  { ceg: "HRT Spedition Kft.", kapcsolattarto: "Pretsner József Ádám", telefon: "+36 30 1532 793", email: "adam.pretsner@hrtsped.hu", forras: "_20260825_102300.pdf" },
  { ceg: "HRT Spedition Kft.", email: "iroda@hrtsped.hu / penzugy@hrtsped.hu / cmr@hrtsped.hu", forras: "_20260825_102300.pdf" },

  { ceg: "Pro Line Speed Kft.", kapcsolattarto: "Prostyák Tamás", telefon: "+36 70 776 5349", forras: "Well worn.pdf" },

  { ceg: "K+K Spedit Kft.", kapcsolattarto: "Novák Nikoletta", telefon: "+36 30 088 1442", email: "fuvarszervezes@kkspedit.hu", forras: "Megbiz.pdf" },
  { ceg: "K+K Spedit Kft.", telefon: "06-42/310-084", email: "iroda@kkspedit.hu", forras: "Megbiz.pdf" },

  { ceg: "Alpok-Trans Kft.", kapcsolattarto: "Borhi Szilárd", telefon: "+36 70 611 2552", forras: "MGB 26 1754 2026 08 18 Well-Worn Pallet.pdf" },

  { ceg: "Well Pack Hungaria Kft.", kapcsolattarto: "Sági Fanni", telefon: "+36 30 839 8114", email: "sagi.fanni@wellpack.hu", forras: "196 AUG Well worn pallet kft 110e 3402621138 WAB-BÜK.pdf" },
  { ceg: "Well Pack Hungaria Kft.", email: "transport@wellpack.hu", forras: "196 AUG Well worn pallet kft 110e 3402621138 WAB-BÜK.pdf" },

  { ceg: "Pannoniacoop Logisztikai Kft.", email: "pannoniacoop@gmail.com", forras: "A268 26 - well-worn pallet kft.pdf" },

  { ceg: "VOXOV Logistics Kft.", forras: "P26380SoroksárlNyíregyházaWELL-WORN.pdf (csak postacím: 1601 Budapest Pf. 131)" },
];
