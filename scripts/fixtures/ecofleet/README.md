Anonimizált Ecofleet JSON-minták (a 2026-10-16-i élő válaszok mezőnevei és nagyságrendjei;
sofőrnév, kártyaszám, telefon, eszköz-sorozatszám kicserélve). A getRawData-sorok
szintetikus órás mintavétellel készültek az élő mezőnevekkel:
- getRawData-NMZ.json: 12 mozgó óra (+18,2 l, +62 km / óra), a 7. indexű mintánál álló helyzetben +600 l tankolás.
- getRawData-AOPU.json: CANServiceDistance mindenhol −5 (a kocsi nem küldi megbízhatóan), tengely nincs.
- getRawData-szamlalo-hiba.json: a CANFuelUsed számláló a 3. mintánál 0-ra esik (hibás nap → literCan null).
- getLastData.json: 2 kocsi tcoData-val + 1 GPS/tachó nélküli objektum (tcoData: null).
