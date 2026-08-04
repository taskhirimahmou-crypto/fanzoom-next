// src/app/api/views/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getPocketBase } from '@/lib/pocketbase';

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'no article id' }, { status: 400 });
    }

    const pb = getPocketBase();

    // احراز هویت به عنوان ادمین برای دور زدن API rules
    const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL;
    const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      console.error('🔴 Missing admin credentials for views update');
      return NextResponse.json({ error: 'failed to update views' }, { status: 500 });
    }

    await pb.collection('_superusers').authWithPassword(adminEmail, adminPassword);

    // گرفتن رکورد فعلی برای خواندن مقدار views
    const article = await pb.collection('articles').getOne(id);
    const currentViews = (article as { views?: number }).views ?? 0;

    // آپدیت رکورد با views جدید
    const updated = await pb.collection('articles').update(id, {
      views: currentViews + 1,
    });

    return NextResponse.json({ ok: true, views: (updated as { views?: number }).views ?? currentViews + 1 });
  } catch (e) {
    console.error('🔴 views update error:', e);
    return NextResponse.json({ error: 'failed to update views' }, { status: 500 });
  }
}
