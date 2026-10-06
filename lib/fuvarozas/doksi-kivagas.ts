import "server-only";

// A fuvarlevél-fotó „szkennelése" — a tényleges képfeldolgozás a
// doksi-kivagas-mag.ts-ben van, szerver-őr nélkül, hogy a tesztek
// (scripts/teszt-fuvarlevel-minoseg.ts) közvetlenül futtathassák. (2026-10-06)
export { szkennelj } from "@/lib/fuvarozas/doksi-kivagas-mag";
