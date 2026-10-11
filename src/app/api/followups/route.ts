import { getFollowUps } from "@/lib/followups";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

export function GET() {
  return json(getFollowUps());
}
