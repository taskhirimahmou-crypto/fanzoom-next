import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';

export async function POST(req: NextRequest) {
  // محافظت با secret token
  const secret = req.headers.get('x-revalidate-secret');
  const expected = process.env.REVALIDATE_SECRET;
  
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // پاک کردن کش صفحه اصلی و داده‌های home
  revalidateTag('home-data');
  revalidateTag('article-slug');
  revalidateTag('category-articles');
  revalidateTag('related');
  revalidateTag('sitemap-articles');
  
  return NextResponse.json({ 
    success: true, 
    message: 'All caches invalidated',
    timestamp: new Date().toISOString()
  });
}
