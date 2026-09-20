export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { inditSzamlaPollScheduler } = await import("@/lib/szamlak/poll-scheduler");
  inditSzamlaPollScheduler();
  const { inditTeljesitesFigyelesScheduler } = await import(
    "@/lib/fuvarozas/teljesites-figyeles-scheduler"
  );
  inditTeljesitesFigyelesScheduler();
  const { inditModellSzinkronScheduler } = await import("@/lib/fuvarozas2/modell-szinkron-scheduler");
  inditModellSzinkronScheduler();
}
