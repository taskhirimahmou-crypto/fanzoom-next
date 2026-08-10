import { NextRequest, NextResponse } from 'next/server';
import { getServerPocketBase } from '@/lib/auth-cookies';

export async function PATCH(req: NextRequest) {
  try {
    console.log('🔵 PATCH /api/profile/interests started');

    const pb = await getServerPocketBase();
    const record = pb.authStore.record as { id: string; email?: string } | null;
    const model = pb.authStore.model as { collectionName?: string } | null;

    console.log('🔵 Auth record:', record?.id || 'null');
    console.log('🔵 Auth model:', model?.collectionName || 'null');

    // فقط کاربران عادی (نه superuser)
    if (!record || model?.collectionName !== 'users') {
      console.log('🔴 Unauthorized: not a regular user');
      return NextResponse.json(
        { error: 'ابتدا با حساب کاربری وارد شوید' },
        { status: 401 }
      );
    }

    const { interests } = await req.json();
    console.log('🔵 Received interests:', interests);

    if (!Array.isArray(interests)) {
      console.log('🔴 Invalid interests format');
      return NextResponse.json({ error: 'فرمت نامعتبر' }, { status: 400 });
    }

    // بررسی قبل از update
    const beforeUser = await pb.collection('users').getOne(record.id);
    console.log('🔵 Before update - interests:', beforeUser.interests);

    // Update
    const updatedUser = await pb.collection('users').update(record.id, {
      interests: interests,
    });
    console.log('🔵 After update - interests:', updatedUser.interests);

    return NextResponse.json({
      success: true,
      interests: updatedUser.interests,
    });
  } catch (error) {
    console.error('🔴 Update interests error:', error);
    return NextResponse.json(
      { error: 'خطا در ذخیره علاقه‌مندی‌ها' },
      { status: 500 }
    );
  }
}