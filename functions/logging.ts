import { RedLog } from '@redbtn/redlog';

export const serviceLog = RedLog.create({ namespace: 'redbook.functions' });

export function logInfo(message: string, metadata: Record<string, unknown> = {}): void {
  void serviceLog.info(message, metadata).catch(() => undefined);
}

export function logWarn(message: string, metadata: Record<string, unknown> = {}): void {
  void serviceLog.warn(message, metadata).catch(() => undefined);
}

export function logError(message: string, metadata: Record<string, unknown> = {}): void {
  void serviceLog.error(message, metadata).catch(() => undefined);
}
