// src/app/api/bookmarks/route.ts
import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth-cookies';
import { recordTrustedRecommendationEventBestEffort } from '@/lib/recommender/trusted-events';
import { beginServerRequest, finishServerResponse, observedJson } from '@/lib/observability/request-context';
import { acquireSharedRateLimit, sharedRateLimitResponse } from '@/lib/shared-rate-limit/core';

// افزودن به نشان‌شده‌ها
export async function POST(req: NextRequest) {
  const context = beginServerRequest(req, '/api/bookmarks');
  const auth = await requireUser(context.requestId);
  if (!auth.ok) return finishServerResponse(context, auth.response);
  const { pb, user } = auth;
  const shared = await acquireSharedRateLimit(req, context, ['bookmarks.visitor', 'bookmarks.user'], { userId: user.id, visitorId: `authenticated:${user.id}` });
  const blocked = sharedRateLimitResponse(context, shared);
  if (blocked) return blocked;
  if (!shared.permit) return observedJson(context, { error: 'service_unavailable' }, { status: 503 });
  const permit = shared.permit;
  const { articleId } = await req.json();
  if (!articleId) {
    return observedJson(context, { error: 'articleId الزامی است' }, { status: 400 });
  }
  try {
    const bookmark = await pb.collection('bookmarks').create({
      user: user.id,
      article: articleId,
    });
    await recordTrustedRecommendationEventBestEffort(
      {
        idempotencyKey: `bookmark_add:${bookmark.id}`,
        articleId,
        eventType: 'bookmark_add',
        surface: 'article',
      },
      user.id,
      { requestId: context.requestId, route: context.route, permit },
    );
    return observedJson(context, { ok: true, bookmarked: true });
  } catch {
    return observedJson(context, { error: 'قبلاً نشان شده است' }, { status: 400 });
  }
}

// حذف از نشان‌شده‌ها
export async function DELETE(req: NextRequest) {
  const context = beginServerRequest(req, '/api/bookmarks');
  const auth = await requireUser(context.requestId);
  if (!auth.ok) return finishServerResponse(context, auth.response);
  const { pb, user } = auth;
  const shared = await acquireSharedRateLimit(req, context, ['bookmarks.visitor', 'bookmarks.user'], { userId: user.id, visitorId: `authenticated:${user.id}` });
  const blocked = sharedRateLimitResponse(context, shared);
  if (blocked) return blocked;
  if (!shared.permit) return observedJson(context, { error: 'service_unavailable' }, { status: 503 });
  const permit = shared.permit;
  const { articleId } = await req.json();
  try {
    const bm = await pb.collection('bookmarks').getFirstListItem(
      pb.filter('user = {:uid} && article = {:aid}', {
        uid: user.id,
        aid: articleId,
      }),
    );
    await pb.collection('bookmarks').delete(bm.id);
    await recordTrustedRecommendationEventBestEffort(
      {
        idempotencyKey: `bookmark_remove:${bm.id}`,
        articleId,
        eventType: 'bookmark_remove',
        surface: 'unknown',
      },
      user.id,
      { requestId: context.requestId, route: context.route, permit },
    );
    return observedJson(context, { ok: true, bookmarked: false });
  } catch {
    return observedJson(context, { error: 'یافت نشد' }, { status: 404 });
  }
}
