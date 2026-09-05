// Kapcsolatok-típusú konstansok — NEM "use server" fájl (lásd
// lib/fuvarozas/fuvar-constants.ts megjegyzését: a "use server" fájlok
// kizárólag async függvényeket exportálhatnak).

export type KapcsolatRow = {
  id: string;
  ceg: string;
  kapcsolattarto: string | null;
  telefon: string | null;
  email: string | null;
  megjegyzes: string | null;
  forras: string | null;
};

export type AddKapcsolatInput = {
  ceg: string;
  kapcsolattarto?: string;
  telefon?: string;
  email?: string;
  megjegyzes?: string;
  forras?: string;
};
