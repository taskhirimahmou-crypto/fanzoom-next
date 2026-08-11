// src/app/api/bookmarks/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-cookies';

// افزودن به نشان‌شده‌ها
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { pb, user } = auth;
  const { articleId } = await req.json();
  if (!articleId) {
    return NextResponse.json({ error: 'articleId الزامی است' }, { status: 400 });
  }
  try {
    await pb.collection('bookmarks').create({
      user: user.id,
      article: articleId,
    });
    return NextResponse.json({ ok: true, bookmarked: true });
  } catch {
    return NextResponse.json({ error: 'قبلاً نشان شده است' }, { status: 400 });
  }
}

// حذف از نشان‌شده‌ها
export async function DELETE(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { pb, user } = auth;
  const { articleId } = await req.json();
  try {
    const bm = await pb.collection('bookmarks').getFirstListItem(
      pb.filter('user = {:uid} && article = {:aid}', {
        uid: user.id,
        aid: articleId,
      }),
    );
    await pb.collection('bookmarks').delete(bm.id);
    return NextResponse.json({ ok: true, bookmarked: false });
  } catch {
    return NextResponse.json({ error: 'یافت نشد' }, { status: 404 });
  }
}
