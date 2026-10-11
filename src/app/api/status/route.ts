import { aiEnabled } from "@/lib/ai";
import { json } from "@/lib/http";

export function GET() {
  return json({ ai: aiEnabled() });
}
