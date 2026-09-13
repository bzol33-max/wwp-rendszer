import "server-only";
import { verifySession } from "@/lib/auth/dal";

export type SessionType = Awaited<ReturnType<typeof verifySession>> & { isAuth: true };

export function withSession<T extends any[], R>(
  handler: (req: Request, session: SessionType, ...args: T) => Promise<R>
) {
  return (req: Request, ...args: T): Promise<R | Response> => {
    return verifyAndHandle(handler, req, args);
  };
}

async function verifyAndHandle<T extends any[], R>(
  handler: (req: Request, session: SessionType, ...args: T) => Promise<R>,
  req: Request,
  args: T
): Promise<R | Response> {
  try {
    const session = await verifySession();
    if (!session.isAuth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    return handler(req, session as SessionType, ...args);
  } catch (err) {
    console.error("[withSession] Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
