import { ok, fail } from "@/lib/api";
import { listPacks } from "@/lib/navpack";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok({ packs: listPacks() });
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err), 500);
  }
}
