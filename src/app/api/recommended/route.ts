import { NextRequest, NextResponse } from 'next/server';
import { getServerPocketBase } from '@/lib/auth-cookies';
import { getRecommendedArticles } from '@/lib/articles-server';

export async function GET(req: NextRequest) {
  try {
    const pb = await getServerPocketBase();
    const record = pb.authStore.record as { id: string } | null;
    const model = pb.authStore.model as { collectionName?: string } | null;

    if (!record || model?.collectionName !== 'users') {
      return NextResponse.json(
        { error: 'ابتدا وارد شوید' },
        { status: 401 }
      );
    }

    const offset = Number(req.nextUrl.searchParams.get('offset') || 0);
    const limit = Number(req.nextUrl.searchParams.get('limit') || 10);

    const fullUser = (await pb.collection('users').getOne(record.id)) as {
      interests?: string[];
    };

    if (!fullUser.interests || fullUser.interests.length === 0) {
      return NextResponse.json({ articles: [], hasMore: false });
    }

    const articles = await getRecommendedArticles(fullUser.interests, limit, offset);

    return NextResponse.json({
      articles,
      hasMore: articles.length === limit,
    });
  } catch (error) {
    console.error('🔴 Recommended API error:', error);
    return NextResponse.json(
      { error: 'خطا در دریافت پیشنهادات' },
      { status: 500 }
    );
  }
}