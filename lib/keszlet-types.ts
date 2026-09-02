// A teljes típuskatalógus a meglévő árlistából (24 tétel).
// Telephelyenként külön állítható be, mely típusok aktívak ott.
export const PALLET_TYPES = [
  "EUR világos",
  "EUR szürke",
  "EUR új",
  "800x1200 új",
  "800x1200 használt",
  "1000x1200 új",
  "1000x1200 használt",
  "Színes",
  "Gitterbox",
  "Raklap magasító",
  "Emili raklap",
  "1600-as",
  "1700-as",
  "670-es",
  "740-es",
  "IBC",
  "Egyutas 80-as",
  "Egyutas 100-as",
  "Egyutas gyenge",
  "Csere",
  "EUR törött",
  "H1 raklap",
  "1000x1200-as körtalpas",
  "BIG-BAG",
  "Vegyes EUR",
] as const;

export type PalletType = (typeof PALLET_TYPES)[number];
