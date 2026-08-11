import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-cookies';

export async function PATCH(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    console.log('🔵 PATCH /api/profile/interests started');

    const { pb, user: record } = auth;

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
