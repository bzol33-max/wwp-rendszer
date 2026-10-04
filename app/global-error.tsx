"use client";

// Ha maga a gyökér-layout hasal el (pl. a munkamenet-ellenőrzés DB-hibája),
// az app/error.tsx sem tud megjelenni — ez a végső hibaoldal, saját
// <html>/<body>-val, stílusfüggőség nélkül (audit FE-1).

export default function GlobalHiba({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="hu">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: 24, textAlign: "center" }}>
        <p style={{ fontWeight: 600, marginTop: "30vh" }}>A rendszer most nem érhető el.</p>
        <p style={{ color: "#666", fontSize: 14 }}>Próbáld újra egy perc múlva — ha nem megy, szólj Zoltánnak.</p>
        {error.digest && <p style={{ color: "#999", fontSize: 12 }}>Hibakód: {error.digest}</p>}
        <button
          type="button"
          onClick={() => retry()}
          style={{ marginTop: 12, padding: "8px 16px", fontSize: 14, borderRadius: 6, border: "1px solid #ccc" }}
        >
          Újra
        </button>
      </body>
    </html>
  );
}
