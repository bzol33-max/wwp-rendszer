import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { query } from "@/lib/db";

export async function GET() {
  const rows = await query<{ username: string; password_hash: string; active: boolean }>(
    `select username, password_hash, active from users where username = $1`,
    ["OszlanszkiTamás"]
  );
  const user = rows[0];
  if (!user) return NextResponse.json({ found: false });
  const matches = await bcrypt.compare("Tunde20/A", user.password_hash);
  return NextResponse.json({ found: true, active: user.active, passwordMatches: matches });
}
