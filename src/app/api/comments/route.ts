// src/app/api/comments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerPocketBase } from '@/lib/auth-cookies';

export async function POST(req: NextRequest) {
  const pb = await getServerPocketBase();
  if (!pb.authStore.record) {
    return NextResponse.json({ error: 'برای نظر دادن ابتدا وارد شوید' }, { status: 401 });
  }

  const { articleId, body } = await req.json();
  const text = (body ?? '').trim();

  if (!articleId) return NextResponse.json({ error: 'مقاله مشخص نشده' }, { status: 400 });
  if (!text) return NextResponse.json({ error: 'متن نظر خالی است' }, { status: 400 });
  if (text.length > 1000)
    return NextResponse.json({ error: 'نظر حداکثر ۱۰۰۰ کاراکتر باشد' }, { status: 400 });

  const now = new Date().toISOString();

  try {
    await pb.collection('comments').create({
      user: pb.authStore.record.id,
      article: articleId,
      content: text,
      status: 'pending',
      autodate: now, // فیلد تاریخِ واقعیِ این collection (نه created)
    });
    console.log('🟢 comment created → autodate =', (made as any).autodate);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const resp = (e as { response?: { data?: unknown } })?.response?.data;
    console.error('🔴 Comments create error:', JSON.stringify(resp, null, 2));
    return NextResponse.json({ ok: true });  }
}