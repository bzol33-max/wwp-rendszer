// PDF szövegelemek OLDALKOORDINÁTÁKKAL — a hasábos sablonokhoz.
//
// A pdf-parse sima szövege a tartalomfolyam sorrendjében adja a darabokat,
// ami két egymás melletti hasábnál nem a látott sorrend: a SpediTrans
// (BB-Logistic) megbízásán a JOBB hasáb (Lerakás helye) blokkja került a
// BAL (Felrakás helye) elé, és mind a nyelvi modell, mind egy csak
// szövegre épülő olvasó fordítva vette a felrakót és a lerakót
// (02215-2026.pdf, 2026-09-18). A koordináta egyértelmű: ami a "Felrakás
// helye:" címke alatt, annak x-énél áll, az a felrakó.
//
// Ugyanazt a pdfjs-t használjuk, amire a pdf-parse is épül (a next.config.ts
// serverExternalPackages-ben mindkettő kint van a bundlingből a worker-fájl
// miatt). NEM "use server" fájl.

export type SzovegElem = {
  /** Az oldal sorszáma, 1-től. */
  oldal: number;
  /** Bal alsó sarok az oldal koordináta-rendszerében (pont), egészre kerekítve. */
  x: number;
  y: number;
  str: string;
};

export async function pdfSzovegElemek(buffer: Buffer): Promise<SzovegElem[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  try {
    const elemek: SzovegElem[] = [];
    for (let oldal = 1; oldal <= doc.numPages; oldal++) {
      const page = await doc.getPage(oldal);
      const tartalom = await page.getTextContent();
      for (const item of tartalom.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        elemek.push({ oldal, x: Math.round(item.transform[4]), y: Math.round(item.transform[5]), str: item.str });
      }
    }
    return elemek;
  } finally {
    await doc.destroy();
  }
}
