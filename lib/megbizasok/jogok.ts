import type { verifySession } from "@/lib/auth/dal";

type Session = Extract<Awaited<ReturnType<typeof verifySession>>, { isAuth: true }>;

/** A megbízásnézet műveletei a meglévő moduljogokból (2026-10-06). */
export function megbizasJogok(session: Pick<Session, "can">) {
  const fuvarozas = session.can("fuvarozas");
  const elszamolas = session.can("elszamolas");
  return {
    latja: fuvarozas.view || elszamolas.view,
    szerkeszti: fuvarozas.edit,
    elszamol: fuvarozas.edit || elszamolas.edit,
    torolhet: fuvarozas.edit,
  };
}

export async function requireMegbizasSzerkesztes() {
  const { requireEditPermission } = await import("@/lib/auth/require-permission");
  return requireEditPermission("fuvarozas");
}
export async function requireMegbizasElszamolas() {
  const { requireAnyEditPermission } = await import("@/lib/auth/require-permission");
  return requireAnyEditPermission(["fuvarozas", "elszamolas"]);
}
export async function requireMegbizasMegtekintes() {
  const { requireAnyViewPermission } = await import("@/lib/auth/require-permission");
  return requireAnyViewPermission(["fuvarozas", "elszamolas"]);
}
