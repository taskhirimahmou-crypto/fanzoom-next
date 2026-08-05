// src/app/api/bookmarks/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerPocketBase } from '@/lib/auth-cookies';

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
    await pb.collection('bookmarks').create({
      user: pb.authStore.record.id,
      article: articleId,
    });
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
    return NextResponse.json({ ok: true, bookmarked: false });
  } catch {
    return NextResponse.json({ error: 'یافت نشد' }, { status: 404 });
  }
}