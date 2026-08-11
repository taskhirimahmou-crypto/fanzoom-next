import { NextRequest, NextResponse } from 'next/server';
import { getPocketBase } from '@/lib/pocketbase';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const searchParams = req.nextUrl.searchParams;
    
    // گرفتن پارامترها از URL
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    
    // اگر Google خطا برگرداند
    if (error) {
      console.error('🔴 Google OAuth error from Google:', error);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || 'https://fanzoom.ir'}/login?error=oauth_denied`
      );
    }
    
    if (!code) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || 'https://fanzoom.ir'}/login?error=no_code`
      );
    }
    
    // بازیابی codeVerifier از cookie
    const codeVerifier = cookieStore.get('pb_oauth2_verifier')?.value;
    
    if (!codeVerifier) {
      console.error('🔴 codeVerifier not found in cookies');
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || 'https://fanzoom.ir'}/login?error=session_expired`
      );
    }
    
    const pb = getPocketBase();
    const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://fanzoom.ir'}/api/auth/google/callback`;
    
    // تبادل code با token — روش صحیح server-side
    const authData = await pb.collection('users').authWithOAuth2Code(
      'google',
      code,
      codeVerifier,
      redirectUrl,
      {
        // ایجاد خودکار کاربر اگر وجود نداشت
        createData: {
          emailVisibility: true,
        },
      }
    );
    
    // پاک کردن cookie بعد از استفاده
    cookieStore.delete('pb_oauth2_verifier');
    
    // تنظیم cookie احراز هویت PocketBase
    const token = pb.authStore.token;
    cookieStore.set('pb_auth', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // ۷ روز
      path: '/',
    });
    
    // redirect به صفحه اصلی
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || 'https://fanzoom.ir'}/`
    );
  } catch (error) {
    console.error('🔴 Google OAuth callback error:', error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || 'https://fanzoom.ir'}/login?error=oauth_failed`
    );
  }
}