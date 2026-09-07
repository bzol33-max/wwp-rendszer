import { NextResponse } from "next/server";
import { getMobilOsszefoglalo } from "@/lib/dashboard/actions";

export async function GET() {
  const data = await getMobilOsszefoglalo({ showKeszlet: true, showFuvarozas: true });
  return NextResponse.json(data);
}
