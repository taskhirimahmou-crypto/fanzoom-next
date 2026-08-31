import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type PocketBase from 'pocketbase';
import { writeStructuredServerLog, type LogLevel } from './logger';

export const REQUEST_ID_HEADER = 'x-request-id';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RequestLogFields = {
  feedId?: string;
  algorithmVersion?: string;
  errorCode?: string;
};

export type ServerRequestContext = {
  requestId: string;
  route: string;
  startedAtMs: number;
  now: () => number;
  requestHeaders?: { get: (name: string) => string | null };
};

export function resolveRequestId(value: string | null | undefined): string {
  const candidate = value?.trim();
  return candidate && UUID_PATTERN.test(candidate) ? candidate.toLowerCase() : randomUUID();
}

export function beginServerRequest(
  request: { headers: { get: (name: string) => string | null } },
  route: string,
  options: { now?: () => number } = {},
): ServerRequestContext {
  const now = options.now ?? Date.now;
  return {
    requestId: resolveRequestId(request.headers.get(REQUEST_ID_HEADER)),
    route,
    startedAtMs: now(),
    now,
    requestHeaders: request.headers,
  };
}

function durationMs(context: ServerRequestContext): number {
  return Math.max(0, context.now() - context.startedAtMs);
}

export function logRequestEvent(
  context: ServerRequestContext,
  level: LogLevel,
  eventName: string,
  statusCode: number,
  fields: RequestLogFields = {},
): void {
  writeStructuredServerLog({
    level,
    eventName,
    requestId: context.requestId,
    route: context.route,
    statusCode,
    durationMs: durationMs(context),
    ...fields,
  });
}

export function finishServerResponse<T extends Response>(
  context: ServerRequestContext,
  response: T,
  fields: RequestLogFields = {},
): T {
  response.headers.set(REQUEST_ID_HEADER, context.requestId);
  logRequestEvent(
    context,
    response.status >= 500 ? 'error' : response.status >= 400 ? 'warn' : 'info',
    'http_request_completed',
    response.status,
    fields,
  );
  return response;
}

export function observedJson(
  context: ServerRequestContext,
  body: unknown,
  init: ResponseInit = {},
  fields: RequestLogFields = {},
): NextResponse {
  const headers = new Headers(init.headers);
  headers.set(REQUEST_ID_HEADER, context.requestId);
  return finishServerResponse(
    context,
    NextResponse.json(body, { ...init, headers }),
    fields,
  );
}

export function attachRequestIdToPocketBase<T extends PocketBase>(
  client: T,
  requestId: string | undefined,
): T {
  if (!requestId) return client;
  client.beforeSend = (url, options) => ({
    url,
    options: {
      ...options,
      headers: {
        ...((options.headers as Record<string, string> | undefined) ?? {}),
        [REQUEST_ID_HEADER]: requestId,
      },
    },
  });
  return client;
}
