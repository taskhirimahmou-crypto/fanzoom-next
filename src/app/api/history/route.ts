// src/app/api/history/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerPocketBase } from '@/lib/auth-cookies';
import { deleteReadingHistory, upsertReadingHistory } from '@/lib/history/history-service';
import { isPocketBaseRecordId } from '@/lib/pocketbase-id';
import { recordTrustedRecommendationEventBestEffort } from '@/lib/recommender/trusted-events';
import { parseRecommendationAttribution } from '@/lib/recommender/attribution';
import { getAdminPocketBase } from '@/lib/pocketbase-admin';
import {
  PocketBaseServedAttributionRepository,
  validateTrustedOpenAttribution,
} from '@/lib/recommender/trusted-attribution';

// ثبت یا به‌روزرسانی «آخرین مطالعه» (upsert دستی)
export async function POST(req: NextRequest) {
  const pb = await getServerPocketBase();
  const uid = pb.authStore.record?.id;
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    articleId?: unknown;
    attribution?: unknown;
  } | null;
  const articleId = body?.articleId;
  if (!isPocketBaseRecordId(articleId)) {
    return NextResponse.json({ error: 'invalid article' }, { status: 400 });
  }
  const candidateAttribution = parseRecommendationAttribution(body?.attribution);

  const now = new Date().toISOString();
  try {
    await upsertReadingHistory(pb, uid, articleId, now);
    let attribution;
    if (candidateAttribution) {
      try {
        const adminPb = await getAdminPocketBase();
        attribution = await validateTrustedOpenAttribution(
          candidateAttribution,
          uid,
          articleId,
          new PocketBaseServedAttributionRepository(adminPb),
        );
      } catch (error) {
        // Attribution is analytics metadata: fail closed to direct traffic if its
        // trusted served evidence cannot be checked, without breaking history.
        console.error('recommendation open attribution validation failed', error);
      }
    }
    await recordTrustedRecommendationEventBestEffort(
      {
        idempotencyKey: `open:${attribution?.feedId ?? 'direct'}:${articleId}:${Math.floor(Date.now() / 300_000)}`,
        articleId,
        eventType: 'open',
        surface: attribution?.surface ?? 'direct',
        ...attribution,
        occurredAt: now,
      },
      uid,
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('🔴 history upsert error:', JSON.stringify((e as { response?: { data?: unknown } })?.response?.data, null, 2));
    return NextResponse.json({ error: 'failed' }, { status: 400 });
  }
}

// حذف یک مقاله از تاریخچه
export async function DELETE(req: NextRequest) {
  const pb = await getServerPocketBase();
  const uid = pb.authStore.record?.id;
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { articleId?: unknown } | null;
  const articleId = body?.articleId;
  if (!isPocketBaseRecordId(articleId)) {
    return NextResponse.json({ error: 'invalid article' }, { status: 400 });
  }

  try {
    await deleteReadingHistory(pb, uid, articleId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('🔴 history delete error:', JSON.stringify((e as { response?: { data?: unknown } })?.response?.data, null, 2));
    return NextResponse.json({ error: 'failed' }, { status: 400 });
  }
}
