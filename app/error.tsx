"use client";

// Hibahatár az összes oldalhoz (audit 2026-10-04, FE-1): eddig egy
// szerveroldali hiba (DB-kiesés, külső szolgáltatás) a Next alapértelmezett
// hibaoldalát adta, újrapróbálás nélkül. Itt egy "Újra" gomb van, ami a
// szegmenst újra lekéri, és egy link a kezdőlapra.

import Link from "next/link";
import { useEffect } from "react";

export default function HibaOldal({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-base font-semibold">Valami hiba történt az oldal betöltésekor.</p>
      <p className="text-sm text-muted-foreground">
        Lehet, hogy csak átmeneti (gyenge térerő, frissítés közben). Próbáld újra — ha nem megy, szólj Zoltánnak.
      </p>
      {error.digest && <p className="text-xs text-muted-foreground">Hibakód: {error.digest}</p>}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background"
        >
          Újra
        </button>
        <Link href="/" className="rounded-md border px-4 py-2 text-sm">
          Kezdőlap
        </Link>
      </div>
    </div>
  );
}
