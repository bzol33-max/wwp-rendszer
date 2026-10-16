// Ecofleet telemetria ütemező — a szerver-folyamat élettartama alatt fut, az
// `instrumentation.ts` indítja. A lib/fuvarozas/teljesites-figyeles-scheduler.ts
// mintáját követi (egyetlenPeldanyban + futtatRendszerkent, try/catch, inditva-őr,
// késleltetett első futás).
//
// Egyetlen 2 perces kör, egy zárral (ZAR_KULCS.telemetriaGyujto), hogy a
// feladatok ne fussanak egymásra és két példány se duplázzon:
// - minden körben: tachó-pillanat (getLastData);
// - ha az utolsó sikeresen lefutott CAN-kör óta eltelt 1 óra (és induláskor,
//   az első, 60 s-mal késleltetett körben): tegnapi + mai CAN-nap;
// - naponta egyszer (budapesti nap): 30 napnál régebbi tachó-pillanatok törlése.
// Ha a zár foglalt, a kör kimarad — a következő 2 perc múlva pótolja.

import { futtatRendszerkent } from "@/lib/auth/system-context";
import { egyetlenPeldanyban, ZAR_KULCS } from "@/lib/db";
import { maszkoltUzenet } from "@/lib/ecofleet/kliens";
import { budapestNapISO } from "@/lib/fuvarozas/idozona";
import { gyujtCanNapok, gyujtTacho, takaritTacho } from "./gyujto";

const INTERVALL_MS = 2 * 60 * 1000;
const ELSO_FUTAS_MS = 60_000;
const CAN_INTERVALL_MS = 60 * 60 * 1000;
const NAPLO = "[telemetria]";

let inditva = false;
let utolsoCanKor = 0;
let utolsoTakaritasNap: string | null = null;

function hibaSzoveg(e: unknown): string {
  return maszkoltUzenet(e instanceof Error ? e.message : String(e));
}

async function kor() {
  try {
    const tacho = await gyujtTacho();
    if (tacho.uj > 0 && process.env.TELEMETRIA_NAPLO === "1") {
      console.log(`${NAPLO} tachó: ${tacho.uj} új pillanat (${tacho.tachoSor} tachós sor).`);
    }
  } catch (e) {
    console.error(`${NAPLO} tachó-lekérés sikertelen: ${hibaSzoveg(e)}`);
  }

  if (Date.now() - utolsoCanKor >= CAN_INTERVALL_MS) {
    try {
      const can = await gyujtCanNapok();
      utolsoCanKor = Date.now();
      console.log(
        `${NAPLO} CAN-nap: ${can.mentve} mentve, ${can.uresNap} üres, hibák: ${can.hibak.length ? can.hibak.length : "—"}`
      );
    } catch (e) {
      // pl. DB-hiba a járműlista olvasásakor — a következő körben újra próbálja.
      console.error(`${NAPLO} CAN-kör sikertelen: ${hibaSzoveg(e)}`);
    }
  }

  const ma = budapestNapISO();
  if (utolsoTakaritasNap !== ma) {
    try {
      const torolt = await takaritTacho(30);
      utolsoTakaritasNap = ma;
      if (torolt > 0) console.log(`${NAPLO} ${torolt} régi tachó-pillanat törölve.`);
    } catch (e) {
      console.error(`${NAPLO} takarítás sikertelen: ${hibaSzoveg(e)}`);
    }
  }
}

let kulcsHianyJelezve = false;

async function tick() {
  if (!process.env.ECOFLEET_API_KEY) {
    // Kulcs nélkül (pl. helyi fejlesztés) ne írjunk 2 percenként hibát a naplóba.
    if (!kulcsHianyJelezve) console.warn(`${NAPLO} nincs ECOFLEET_API_KEY — a gyűjtés szünetel.`);
    kulcsHianyJelezve = true;
    return;
  }
  try {
    const zar = await egyetlenPeldanyban(ZAR_KULCS.telemetriaGyujto, () =>
      futtatRendszerkent("telemetria-gyujto", kor)
    );
    if (!zar.futott) return; // az előző kör (vagy a másik példány) még fut
  } catch (err) {
    console.error(`${NAPLO} váratlan hiba: ${hibaSzoveg(err)}`);
  }
}

export function inditTelemetriaGyujtoScheduler() {
  if (inditva) return;
  inditva = true;
  // Az első kör (tachó + az induláskori CAN-nap) 60 s-mal késleltetve.
  setTimeout(tick, ELSO_FUTAS_MS);
  setInterval(tick, INTERVALL_MS);
  console.log(`${NAPLO} ütemező elindítva (tachó 2 percenként, CAN-nap óránként).`);
}
