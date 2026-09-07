"use client";

import { createContext, useContext } from "react";

const EditPermissionContext = createContext(true);

export function EditPermissionProvider({
  canEdit,
  children,
}: {
  canEdit: boolean;
  children: React.ReactNode;
}) {
  return (
    <EditPermissionContext.Provider value={canEdit}>
      {children}
    </EditPermissionContext.Provider>
  );
}

// Kliens komponensekben: ha false, a mentés/rögzítés/jóváhagyás gombokat el
// kell rejteni vagy letiltani, mert a felhasználónak csak megtekintési joga
// van ehhez a modulhoz. A szerver oldali akciók (lib/*/actions.ts) NEM
// ellenőrzik ezt — ez egyelőre csak felületi (UX) tiltás, lásd a
// Felhasználók oldal figyelmeztetését is.
export function useCanEdit(): boolean {
  return useContext(EditPermissionContext);
}
