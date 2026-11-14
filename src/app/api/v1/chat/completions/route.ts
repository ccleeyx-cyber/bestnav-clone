import { relayChatCompletions } from "@/lib/relay-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return relayChatCompletions(req);
}
