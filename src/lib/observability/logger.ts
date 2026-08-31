import { appendFileSync } from 'node:fs';
import { isAbsolute, normalize } from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type StructuredLogInput = {
  level: LogLevel;
  eventName: string;
  requestId: string;
  route: string;
  statusCode: number;
  durationMs: number;
  feedId?: string;
  algorithmVersion?: string;
  errorCode?: string;
};

export type StructuredServerLog = {
  timestamp: string;
  level: LogLevel;
  eventName: string;
  requestId: string;
  route: string;
  statusCode: number;
  durationMs: number;
  feedId: string | null;
  algorithmVersion: string | null;
  errorCode: string | null;
};

const SAFE_NAME = /^[a-z0-9][a-z0-9:._/-]*$/i;
const SAFE_ROUTE = /^\/?[a-z0-9][a-z0-9:._/-]*$/i;
const SAFE_IDENTIFIER = /^[a-z0-9][a-z0-9:._-]*$/i;

function safeText(value: string, pattern: RegExp, maxLength: number, fallback: string): string {
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength && pattern.test(normalized)
    ? normalized
    : fallback;
}

function optionalIdentifier(value: string | undefined, maxLength: number): string | null {
  if (value === undefined) return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength && SAFE_IDENTIFIER.test(normalized)
    ? normalized
    : null;
}

export function createStructuredServerLog(
  input: StructuredLogInput,
  now: Date = new Date(),
): StructuredServerLog {
  return {
    timestamp: now.toISOString(),
    level: input.level,
    eventName: safeText(input.eventName, SAFE_NAME, 96, 'invalid_event_name'),
    requestId: safeText(input.requestId, SAFE_IDENTIFIER, 64, 'invalid_request_id'),
    route: safeText(input.route, SAFE_ROUTE, 160, 'unknown_route'),
    statusCode: Number.isInteger(input.statusCode) && input.statusCode >= 100 && input.statusCode <= 599
      ? input.statusCode
      : 500,
    durationMs: Number.isFinite(input.durationMs) && input.durationMs >= 0
      ? Math.round(input.durationMs)
      : 0,
    feedId: optionalIdentifier(input.feedId, 64),
    algorithmVersion: optionalIdentifier(input.algorithmVersion, 96),
    errorCode: optionalIdentifier(input.errorCode, 96),
  };
}

export function writeStructuredServerLog(input: StructuredLogInput): StructuredServerLog {
  const record = createStructuredServerLog(input);
  const line = JSON.stringify(record);
  if (input.level === 'error') console.error(line);
  else if (input.level === 'warn') console.warn(line);
  else console.log(line);
  writeLocalDockerLog(line);
  return record;
}

function writeLocalDockerLog(line: string): void {
  const path = process.env.OBSERVABILITY_LOG_FILE;
  if (
    process.env.NODE_ENV === 'test' ||
    process.env.FANZOOM_LOCAL_DOCKER !== 'true' ||
    !path ||
    !isAbsolute(path) ||
    !normalize(path).replaceAll('\\', '/').startsWith('/app/.local-observability/')
  ) return;
  try {
    appendFileSync(path, `${line}\n`, { encoding: 'utf8', flag: 'a' });
  } catch {
    // Logging must never make the request fail. Stdout above remains the source fallback.
  }
}
