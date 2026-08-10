import { NextRequest, NextResponse } from 'next/server';
import { getServerPocketBase } from '@/lib/auth-cookies';

export async function PATCH(req: NextRequest) {
  try {
    const pb = await getServerPocketBase();
    const record = pb.authStore.record as { id: string } | null;
    const model = pb.authStore.model as { collectionName?: string } | null;

    // فقط کاربران عادی (نه superuser)
    if (!record || model?.collectionName !== 'users') {
      return NextResponse.json(
        { error: 'ابتدا با حساب کاربری وارد شوید' },
        { status: 401 }
      );
    }

    const { interests } = await req.json();

    if (!Array.isArray(interests)) {
      return NextResponse.json({ error: 'فرمت نامعتبر' }, { status: 400 });
    }

    await pb.collection('users').update(record.id, { interests });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('🔴 Update interests error:', error);
    return NextResponse.json(
      { error: 'خطا در ذخیره علاقه‌مندی‌ها' },
      { status: 500 }
    );
  }
}