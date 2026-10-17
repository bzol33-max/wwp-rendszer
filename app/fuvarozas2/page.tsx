import { getMaVaszon } from "@/lib/fuvarozas2/ma-vaszon";
import { elotoltKocsiSavok, getKocsiSavok } from "@/lib/fuvarozas2/kocsi-sav";
import { Fuvarozas2Fulek } from "@/components/fuvarozas2/fulek";
import { MaVaszonNezet } from "@/components/fuvarozas2/ma-vaszon";
import { DontesreVarSor, VisszfuvarRiasztasok } from "@/components/fuvarozas2/kocsi-savok";

export const dynamic = "force-dynamic";

// 2026-10-12 (Budaházi Zoltán: „csak a Részletek kell”): a Ma lap a megállók
// és a csempék nézete. Az élő térkép (Most), a Diszpécser és a GPS lap megszűnt.
// 2026-10-17 (2. kör, B változat — docs/fuvarozas-2-kor-terv.md): fölül a
// „Döntésre vár” sor és a kocsi-sávok, alattuk a részletes mai nézet
// (a bérfuvar-csempék a Pénz → Áttekintés lapra kerültek).
// 2026-10-17 (Budaházi Zoltán: „csak az új maradjon”): a régi kocsi-sávok kikerültek,
// a kocsikat csak az N1 kártyák mutatják (docs/ma-n1-terv.md).
export default async function Page() {
  // A hét (szabad nap, rés) és a bejövő-szám a Ma-vászonnal párhuzamosan töltődik.
  const elotoltes = elotoltKocsiSavok();
  const adat = await getMaVaszon();
  const { dontesreVar, riasztasok } = await getKocsiSavok(adat, elotoltes);
  return (
    <div className="flex flex-col gap-3">
      <Fuvarozas2Fulek aktiv="/fuvarozas2" cim="Kocsik" />
      <DontesreVarSor bejovo={dontesreVar.bejovo} kocsiraVar={dontesreVar.kocsiraVar} />
      <VisszfuvarRiasztasok riasztasok={riasztasok} ma={adat.ma} />
      <MaVaszonNezet adat={adat} />
    </div>
  );
}
