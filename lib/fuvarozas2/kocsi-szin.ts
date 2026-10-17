// Kocsiszín a Hét nézethez (docs/het-b1-terv.md): a jármű törzsadat színe
// (fuvar_jarmuvek.szin) → alapszín, halvány háttér, sötét szöveg. Tiszta.

export type KocsiSzin = { c: string; l: string; d: string };

const PALETTA: Record<string, KocsiSzin> = {
  blue: { c: "#2f6fa8", l: "#e6eef8", d: "#1f4f7a" },
  yellow: { c: "#c99a1a", l: "#faf2da", d: "#7a5c0c" },
  green: { c: "#2f9e5a", l: "#e4f4ea", d: "#1d6b3c" },
  purple: { c: "#8b5cc7", l: "#f0e9f9", d: "#5e3a91" },
};

export const SZURKE_SZIN: KocsiSzin = { c: "#8a948f", l: "#eef0ee", d: "#4a5450" };

export function kocsiSzin(szin: string | null | undefined): KocsiSzin {
  return (szin && PALETTA[szin]) || SZURKE_SZIN;
}
