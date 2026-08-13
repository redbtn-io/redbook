import nodemailer from "nodemailer";

import { errorResponse, json, readJsonBody } from "@/lib/api";
import { buildEmailHtml, validateSendPayload } from "@/lib/email";
import { logError, logInfo } from "@/lib/logging";

/**
 * The legacy public lead-capture endpoint, preserved from the original
 * `functions/` service.
 *
 * Deliberately UNAUTHENTICATED — it is posted to by an external lead form —
 * which is exactly why every field is validated and escaped in
 * `@/lib/email` before it reaches an HTML email sent from a trusted sender
 * identity. It is kept outside `/api/*` so it can never be mistaken for one
 * of the session-protected CRM routes.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body.ok) return errorResponse(400, body.error);

  const validation = validateSendPayload(body.value);
  if (!validation.ok) return errorResponse(400, validation.error);

  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!user || !pass) return errorResponse(503, "Email automation is not configured");

  const { email, name, source, img } = validation.value;
  try {
    const transporter = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
    await transporter.sendMail({
      from: user,
      to: email,
      subject: "Your secret code",
      html: buildEmailHtml({ name, source, img }),
    });
    logInfo("Lead email delivered");
    return json({ message: "Email details logged successfully" });
  } catch (error) {
    logError("Email delivery failed", {
      error: error instanceof Error ? error.message : "unknown error",
    });
    return errorResponse(502, "Email delivery failed");
  }
}
