import { healthResponse } from "@/lib/health";

// Same report as /healthz. Both exist because RedRun's deploy contract names
// a health path and a readiness path separately.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return healthResponse();
}
