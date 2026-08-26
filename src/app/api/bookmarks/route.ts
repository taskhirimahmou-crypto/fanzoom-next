// src/app/api/bookmarks/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerPocketBase } from '@/lib/auth-cookies';
import { recordTrustedRecommendationEventBestEffort } from '@/lib/recommender/trusted-events';

// افزودن به نشان‌شده‌ها
export async function POST(req: NextRequest) {
  const pb = await getServerPocketBase();
  if (!pb.authStore.record) {
    return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 });
  }
  const { articleId } = await req.json();
  if (!articleId) {
    return NextResponse.json({ error: 'articleId الزامی است' }, { status: 400 });
  }
  try {
    const bookmark = await pb.collection('bookmarks').create({
      user: pb.authStore.record.id,
      article: articleId,
    });
    await recordTrustedRecommendationEventBestEffort(
      {
        idempotencyKey: `bookmark_add:${bookmark.id}`,
        articleId,
        eventType: 'bookmark_add',
        surface: 'article',
      },
      pb.authStore.record.id,
    );
    return NextResponse.json({ ok: true, bookmarked: true });
  } catch {
    return NextResponse.json({ error: 'قبلاً نشان شده است' }, { status: 400 });
  }
}

// حذف از نشان‌شده‌ها
export async function DELETE(req: NextRequest) {
  const pb = await getServerPocketBase();
  if (!pb.authStore.record) {
    return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 });
  }
  const { articleId } = await req.json();
  try {
    const bm = await pb.collection('bookmarks').getFirstListItem(
      pb.filter('user = {:uid} && article = {:aid}', {
        uid: pb.authStore.record.id,
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
      pb.authStore.record.id,
    );
    return NextResponse.json({ ok: true, bookmarked: false });
  } catch {
    return NextResponse.json({ error: 'یافت نشد' }, { status: 404 });
  }
}
