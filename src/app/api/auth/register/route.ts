import { NextRequest, NextResponse } from 'next/server';
import { getPocketBase } from '@/lib/pocketbase';
import { AUTH_COOKIE } from '@/lib/auth-cookies';

export async function POST(req: NextRequest) {
  const { email, password, displayName } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: 'ایمیل و رمز عبور الزامی است' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'رمز عبور باید حداقل ۸ کاراکتر باشد' }, { status: 400 });
  }

  const pb = getPocketBase();

  try {
    await pb.collection('users').create({
      email,
      password,
      passwordConfirm: password,
      displayName: displayName || email.split('@')[0],
    });

    const auth = await pb.collection('users').authWithPassword(email, password);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(AUTH_COOKIE, auth.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch (e: any) { // ← تغییر کلیدی: اضافه کردن ": any" اینجا
    const errData = e?.response?.data;
    const fields = errData?.data ?? errData;
    const emailStr = JSON.stringify(fields?.email ?? '').toLowerCase();

    let msg = 'ثبت‌نام انجام نشد؛ دوباره تلاش کنید.';
    if (
      emailStr.includes('unique') ||
      emailStr.includes('already') ||
      emailStr.includes('taken') ||
      emailStr.includes('exists') ||
      emailStr.includes('used')
    ) {
      msg = 'این ایمیل قبلاً ثبت شده است.';
    } else if (fields?.password) {
      msg = 'رمز عبور قابل قبول نیست (حداقل ۸ کاراکتر).';
    }

    return NextResponse.json({ error: msg }, { status: 400 });
  }
}