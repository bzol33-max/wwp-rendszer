export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { inditSzamlaPollScheduler } = await import("@/lib/szamlak/poll-scheduler");
  inditSzamlaPollScheduler();
}
