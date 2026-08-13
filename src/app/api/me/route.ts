import { authenticate, json } from "@/lib/api";

/** The verified principal, and nothing else. Never echoes a token or a header. */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const auth = await authenticate(request);
  if (!auth.ok) return auth.response;
  const { userId, email, accountLevel, via } = auth.principal;
  return json({ principal: { userId, email, accountLevel, via } });
}
