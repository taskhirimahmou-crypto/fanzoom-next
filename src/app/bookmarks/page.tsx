import { getServerPocketBase } from '@/lib/auth-cookies';
import { getBookmarkedArticles } from '@/lib/articles-server';
import { redirect } from 'next/navigation';
import { ArticleVisual } from '@/components/ArticleVisual';
import Link from 'next/link';
import { allCategories, findCategoryBySlug } from '@/lib/categories';

export default async function BookmarksPage() {
  const pb = await getServerPocketBase();
  const userId = pb.authStore.record?.id;
  
  console.log('🔍 BookmarksPage userId:', userId);
  console.log('🔍 BookmarksPage isValid:', pb.authStore.isValid);
  
  if (!userId || !pb.authStore.isValid) {
    redirect('/login?redirect=/bookmarks');
  }
  
  const bookmarkedArticles = await getBookmarkedArticles(userId);
  
  console.log('🔍 BookmarksPage articles count:', bookmarkedArticles.length);
  
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 md:px-6">
      <h1 className="text-3xl font-black text-on-surface">مقاله‌های نشان‌شده</h1>
      
      {bookmarkedArticles.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-outline-variant/60 bg-surface-container-low p-10 text-center">
          <p className="text-lg text-on-surface-variant">
            هنوز مقاله‌ای نشان نکرده‌ای.
          </p>
          <Link 
            href="/" 
            className="mt-4 inline-block rounded-full bg-primary px-6 py-2 text-sm font-bold text-on-primary hover:bg-primary/90"
          >
            بازگشت به صفحه اصلی
          </Link>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {bookmarkedArticles.map((article) => {
            const cat = findCategoryBySlug(article.category) ?? allCategories[0];
            return (
              <Link 
                key={article.id}
                href={`/article/${article.slug}`}
                className="group flex items-center gap-4 rounded-xl border border-outline-variant/60 bg-surface-container-low p-4 shadow-1 transition-all hover:-translate-y-0.5 hover:shadow-2"
              >
                <ArticleVisual
                  image={article.image}
                  title={article.title}
                  cat={cat}
                  className="h-16 w-16 shrink-0 rounded-lg"
                  iconClassName="text-2xl"
                />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 block text-base font-bold text-on-surface group-hover:text-primary">
                    {article.title}
                  </span>
                  <span className="mt-1 block text-xs text-on-surface-variant">
                    {cat.name}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
