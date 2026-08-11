import { NextRequest, NextResponse } from 'next/server';
import PocketBase from 'pocketbase';

export async function POST(req: NextRequest) {
  const { token, model } = await req.json();
  
  if (!token || !model) {
    return NextResponse.json({ error: 'Missing data' }, { status: 400 });
  }

  const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://my-backend-fanzoom.liara.run';
  const pb = new PocketBase(pbUrl);
  
  // توکن را در این instance موقت لود می‌کنیم تا اعتبارسنجی شود
  pb.authStore.save(token, model);
  
  try {
    // بررسی اینکه توکن واقعاً معتبر است
    await pb.collection('users').authRefresh();
    
    const response = NextResponse.json({ success: true });
    
    // ⚠️ بسیار مهم: 
    // اگر در فایل src/app/api/auth/login/route.ts از روش خاصی برای ست کردن کوکی 
    // (مثلاً تابع خاصی از auth-cookies) استفاده کرده‌ای، دقیقاً همان را اینجا کپی کن.
    // در غیر این صورت، از این استاندارد استفاده کن:
    response.cookies.set('pb_auth', pb.authStore.exportToCookie({
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 روز
    }));
    
    return response;
  } catch (error) {
    console.error('🔴 Cookie set error:', error);
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
}