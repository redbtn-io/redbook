import { RedLog } from "@redbtn/redlog";

/**
 * Operational logging through the shared `@redbtn/redlog` namespace, with a
 * console fallback.
 *
 * The instance is built lazily and every call is guarded: logging is never
 * allowed to be the reason a request fails. `RedLog.create()` at module scope
 * would run during `next build`'s static analysis, where no transport is
 * configured, so it is deferred to first use.
 */
type Level = "info" | "warn" | "error";

let log: ReturnType<typeof RedLog.create> | null = null;
let unavailable = false;

function instance(): ReturnType<typeof RedLog.create> | null {
  if (unavailable) return null;
  if (!log) {
    try {
      log = RedLog.create({ namespace: "redbook" });
    } catch {
      unavailable = true;
      return null;
    }
  }
  return log;
}

function emit(level: Level, message: string, metadata: Record<string, unknown>): void {
  const redlog = instance();
  if (redlog) {
    try {
      void Promise.resolve(redlog[level](message, metadata)).catch(() => undefined);
      return;
    } catch {
      unavailable = true;
    }
  }
  const line = `[redbook] ${message}`;
  if (level === "error") console.error(line, metadata);
  else if (level === "warn") console.warn(line, metadata);
  else console.log(line, metadata);
}

export function logInfo(message: string, metadata: Record<string, unknown> = {}): void {
  emit("info", message, metadata);
}

export function logWarn(message: string, metadata: Record<string, unknown> = {}): void {
  emit("warn", message, metadata);
}

export function logError(message: string, metadata: Record<string, unknown> = {}): void {
  emit("error", message, metadata);
}
