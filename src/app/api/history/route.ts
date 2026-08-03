// src/app/api/history/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerPocketBase } from '@/lib/auth-cookies';

// ثبت یا به‌روزرسانی «آخرین مطالعه» (upsert دستی)
export async function POST(req: NextRequest) {
  const pb = await getServerPocketBase();
  const uid = pb.authStore.record?.id;
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { articleId } = await req.json();
  if (!articleId) return NextResponse.json({ error: 'no article' }, { status: 400 });

  const now = new Date().toISOString();
  try {
    const existing = await pb.collection('history').getList(1, 1, {
      filter: `user = "${uid}" && article = "${articleId}"`,
    });
    if (existing.items.length > 0) {
      await pb.collection('history').update(existing.items[0].id, { last_read: now });
    } else {
      await pb.collection('history').create({
        user: uid,
        article: articleId,
        last_read: now, // تاریخ را خودمان می‌نویسیم → قابل‌اتکا
      });
    }
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

  const { articleId } = await req.json();
  if (!articleId) return NextResponse.json({ error: 'no article' }, { status: 400 });

  try {
    const existing = await pb.collection('history').getList(1, 1, {
      filter: `user = "${uid}" && article = "${articleId}"`,
    });
    if (existing.items.length > 0) {
      await pb.collection('history').delete(existing.items[0].id);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('🔴 history delete error:', JSON.stringify((e as { response?: { data?: unknown } })?.response?.data, null, 2));
    return NextResponse.json({ error: 'failed' }, { status: 400 });
  }
}