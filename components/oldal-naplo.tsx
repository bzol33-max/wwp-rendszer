"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { naplozando, szurtParameter } from "@/lib/fuvarozas2/oldal-naplo-alap";

// Használati napló (app/api/oldal-naplo): megnyitáskor és minden kliens-
// navigációkor egy sendBeacon — nem vár válaszra, nem blokkolja a
// navigációt, hiba esetén csendben elmarad. A query-stringből már itt is
// csak a nézet-kulcsok mennek el (a szerver újra szűr). Nem renderel semmit.
function Naplo() {
  const utvonal = usePathname();
  const kereses = useSearchParams();
  const param = szurtParameter(kereses);
  useEffect(() => {
    if (!naplozando(utvonal)) return;
    try {
      const test = JSON.stringify({ utvonal, kereses: param ?? "" });
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon("/api/oldal-naplo", new Blob([test], { type: "application/json" }));
      } else {
        void fetch("/api/oldal-naplo", { method: "POST", body: test, keepalive: true }).catch(() => {});
      }
    } catch {
      // csendben
    }
  }, [utvonal, param]);
  return null;
}

export function OldalNaplo() {
  return (
    <Suspense fallback={null}>
      <Naplo />
    </Suspense>
  );
}
