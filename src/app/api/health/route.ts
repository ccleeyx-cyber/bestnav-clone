import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    db().prepare("SELECT 1").get();
    return NextResponse.json({ ok: true, status: "healthy", version: "0.1.0" });
  } catch (e) {
    return NextResponse.json(
      { ok: false, status: "unhealthy", error: (e as Error).message },
      { status: 503 },
    );
  }
}
