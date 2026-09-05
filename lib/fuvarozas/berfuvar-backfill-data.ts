// IDEIGLENES adatfájl — a Drive "Fuvarmegbizások" mappájában található,
// korábban importált bér fuvar dokumentumokból egyszer kinyert adatok
// (a megbízás beérkezésének dátuma a Drive fájl létrehozási dátuma; a
// fizetési határidő és a lerakás dátuma a dokumentum szövegéből). Csak a
// egyszeri visszatöltéshez kell — a backfillBerFuvarAdatok() használja,
// utána mindkettő törölhető.
export type BerFuvarBackfillEntry = {
  driveFileId: string;
  erkezettDatum: string;
  fizetesiHataridoNap: number | null;
  lerakasDatum: string | null;
};

export const BERFUVAR_BACKFILL: BerFuvarBackfillEntry[] = [
  { driveFileId: "1GeRKm3fiZtHE-O800v1kp8ASh4Ieoebr", erkezettDatum: "2026-09-03", fizetesiHataridoNap: 30, lerakasDatum: "2026-09-04" },
  { driveFileId: "1Z4qdrKXreeRiYf_XKwVJPmf4TfitLFbe", erkezettDatum: "2026-09-02", fizetesiHataridoNap: 30, lerakasDatum: null },
  { driveFileId: "1HuH-3TAbOJYVIQJN9k00Xl3YXUZLQj-y", erkezettDatum: "2026-09-02", fizetesiHataridoNap: 30, lerakasDatum: "2026-09-03" },
  { driveFileId: "1IRLGp_soovtvHIV6ZaEGdmAaFTD2tT15", erkezettDatum: "2026-09-04", fizetesiHataridoNap: 30, lerakasDatum: null },
  { driveFileId: "1yIayap8m_RS-EFrcQ1rvUiUQmcvS5282", erkezettDatum: "2026-09-03", fizetesiHataridoNap: 30, lerakasDatum: "2026-09-04" },
  { driveFileId: "10QPXkXeabuRF8f4omKDFLpYfCTuXTTDK", erkezettDatum: "2026-09-01", fizetesiHataridoNap: 60, lerakasDatum: "2026-09-02" },
  { driveFileId: "1emUCSd87Rv0938VMhdFoEEoopLGK830C", erkezettDatum: "2026-08-31", fizetesiHataridoNap: 60, lerakasDatum: "2026-09-02" },
  { driveFileId: "1WCnoDUHlrTi_xX2J8z6uuuAqlRpOSi75", erkezettDatum: "2026-09-02", fizetesiHataridoNap: 30, lerakasDatum: "2026-09-03" },
  { driveFileId: "1EtsUKqo2gDWCyXrDkObykWskoRJAz9CD", erkezettDatum: "2026-08-12", fizetesiHataridoNap: 30, lerakasDatum: "2026-08-13" },
  { driveFileId: "1HaekaBCNSGyPzR2hrRwTMyN_zEvbRUU2", erkezettDatum: "2026-08-12", fizetesiHataridoNap: 45, lerakasDatum: null },
  { driveFileId: "1_RPRq-9ZzpPNyGzYs7OO2a9rTBHPaWgT", erkezettDatum: "2026-08-17", fizetesiHataridoNap: 45, lerakasDatum: "2026-08-11" },
  { driveFileId: "1PtifbwYvRrDznqPBp2Kd2aRaDCDa4XNj", erkezettDatum: "2026-08-25", fizetesiHataridoNap: 45, lerakasDatum: null },
  { driveFileId: "1Gi9RxdIc1Qw_YSv-0kpDnFAg8K-dKnJe", erkezettDatum: "2026-08-28", fizetesiHataridoNap: 30, lerakasDatum: null },
  { driveFileId: "13QxrGhaG1Eh62KyshoEeBLCLBq3pWERp", erkezettDatum: "2026-08-25", fizetesiHataridoNap: 60, lerakasDatum: "2026-08-27" },
  { driveFileId: "1uPJHbIK5V-b6lh3bCtWoFVhaZCa4MvTj", erkezettDatum: "2026-08-25", fizetesiHataridoNap: 60, lerakasDatum: null },
  { driveFileId: "1mYb8aagDk_bzB2VR5qCU-a5B85Ao4u9x", erkezettDatum: "2026-08-26", fizetesiHataridoNap: 60, lerakasDatum: "2026-08-28" },
  { driveFileId: "1toXNqLJdyoXLTw6fkttD4wiwTlZov9Ar", erkezettDatum: "2026-08-24", fizetesiHataridoNap: 60, lerakasDatum: null },
  { driveFileId: "1VVu5Md_NIxhsxKiggTEah5Y_wNPSS8E4", erkezettDatum: "2026-08-11", fizetesiHataridoNap: 60, lerakasDatum: "2026-08-12" },
  { driveFileId: "1b6TveMHxXATFIswrDY_10Qg8Zi3s1L8O", erkezettDatum: "2026-08-12", fizetesiHataridoNap: 60, lerakasDatum: null },
  { driveFileId: "1euVGnNLS3UrPUfRr8JRFfbw8oQehJscl", erkezettDatum: "2026-08-18", fizetesiHataridoNap: 30, lerakasDatum: null },
  { driveFileId: "1tpaXkdetVlZ1AVpJnIst5WdBnaX7YPx1", erkezettDatum: "2026-07-29", fizetesiHataridoNap: 60, lerakasDatum: "2026-07-30" },
  { driveFileId: "1fCJQll6IHmrQ5EY4N4gwHsKZV-hL8eUu", erkezettDatum: "2026-08-17", fizetesiHataridoNap: 30, lerakasDatum: null },
  { driveFileId: "1ka-Wwib23Ig33wVxUmWPYwADuMMOapwv", erkezettDatum: "2026-08-18", fizetesiHataridoNap: 60, lerakasDatum: null },
  { driveFileId: "1jF28ppsdGw1jYuE6b53mg3mrT3S0d0u2", erkezettDatum: "2026-08-18", fizetesiHataridoNap: 60, lerakasDatum: "2026-08-19" },
  { driveFileId: "1SV6scbl3byNGlJNFRVFtT8yhTIm_HtKQ", erkezettDatum: "2026-08-14", fizetesiHataridoNap: 60, lerakasDatum: "2026-08-18" },
  { driveFileId: "1qtkSv2m2hThyFYdD7Ks5uMnMqSbyuQeX", erkezettDatum: "2026-08-17", fizetesiHataridoNap: 60, lerakasDatum: "2026-08-18" },
  { driveFileId: "1f2yjOX6okRD-dDC_qWZXHpZhTXZxCk6w", erkezettDatum: "2026-08-03", fizetesiHataridoNap: 30, lerakasDatum: "2026-08-06" },
  { driveFileId: "1op2vF2o1nmSR1HEQ8Fxcg0Hb3UEJK8cK", erkezettDatum: "2026-08-12", fizetesiHataridoNap: 30, lerakasDatum: null },
  { driveFileId: "1wDwl5mlPrA1krOVTSEEWwS6q1RBYLnL8", erkezettDatum: "2026-08-17", fizetesiHataridoNap: 30, lerakasDatum: "2026-08-19" },
  { driveFileId: "1BtlkPGpVgxnw6MmtX9avIb0Vlnlo3JwR", erkezettDatum: "2026-08-13", fizetesiHataridoNap: 60, lerakasDatum: null },
  { driveFileId: "1L8fSQTrwT5OGeGH0aTT38AyS-MMbT9TI", erkezettDatum: "2026-08-14", fizetesiHataridoNap: 60, lerakasDatum: "2026-08-17" },
  { driveFileId: "1fTh0iT_I2Lncj7q5k5v5HqF4rMe_xDrm", erkezettDatum: "2026-08-12", fizetesiHataridoNap: 30, lerakasDatum: null },
  { driveFileId: "1xY21pwXhifIG7lCbj4pOkq9RuE6XlnOj", erkezettDatum: "2026-08-11", fizetesiHataridoNap: 60, lerakasDatum: null },
  { driveFileId: "1c1lDqZh1b7lmRml3bpwW4XQteyXkXnFH", erkezettDatum: "2026-08-11", fizetesiHataridoNap: 30, lerakasDatum: null },
  { driveFileId: "1JquKIoWP34M8a146TZ3o9q14Eg9rNvoO", erkezettDatum: "2026-08-05", fizetesiHataridoNap: 60, lerakasDatum: "2026-08-07" },
  { driveFileId: "1topjI29QPnlMRFQALY3kiBSM3LpOwx6b", erkezettDatum: "2026-08-05", fizetesiHataridoNap: 60, lerakasDatum: null },
  { driveFileId: "1yZBst4ZVnl7aOuAm73RZ-kNkCVYOZUKY", erkezettDatum: "2026-08-04", fizetesiHataridoNap: 60, lerakasDatum: "2026-08-06" },
];
