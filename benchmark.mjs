import { performance } from 'perf_hooks';

const mockArticles = Array.from({ length: 50 }, (_, i) => ({ id: `article_${i}`, title: `Article ${i}` }));
const mockBookmarks = Array.from({ length: 50 }, (_, i) => ({ id: `bm_${i}`, article: `article_${i}`, created: new Date().toISOString(), expand: { article: mockArticles[i] } }));

const pb = {
  collection: (name) => {
    if (name === 'bookmarks') {
      return {
        getFullList: async ({ expand }) => {
          await new Promise(r => setTimeout(r, 10)); // simulate network delay
          if (expand === 'article') {
            return mockBookmarks;
          }
          return mockBookmarks.map(b => ({ id: b.id, article: b.article, created: b.created }));
        }
      }
    }
    if (name === 'articles') {
      return {
        getOne: async (id) => {
          await new Promise(r => setTimeout(r, 10)); // simulate network delay
          return mockArticles.find(a => a.id === id);
        }
      }
    }
  }
};

async function runNPlusOne() {
  const start = performance.now();

  const bmItems = await pb.collection('bookmarks').getFullList({});
  bmItems.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());

  const articles = [];
  for (const bm of bmItems) {
    const articleId = bm.article;
    if (!articleId) continue;
    try {
      const a = await pb.collection('articles').getOne(articleId);
      articles.push(a);
    } catch {
    }
  }

  const end = performance.now();
  return end - start;
}

async function runOptimized() {
  const start = performance.now();

  const bmItems = await pb.collection('bookmarks').getFullList({ expand: 'article' });
  bmItems.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());

  const articles = bmItems.map(bm => bm.expand?.article).filter(Boolean);

  const end = performance.now();
  return end - start;
}

async function main() {
  console.log("Warming up...");
  await runNPlusOne();
  await runOptimized();

  console.log("\nRunning N+1 Query baseline...");
  const nPlusOneTime = await runNPlusOne();
  console.log(`N+1 Query took: ${nPlusOneTime.toFixed(2)}ms`);

  console.log("\nRunning Optimized (expand) query...");
  const optimizedTime = await runOptimized();
  console.log(`Optimized Query took: ${optimizedTime.toFixed(2)}ms`);

  console.log(`\nImprovement: ${((nPlusOneTime - optimizedTime) / nPlusOneTime * 100).toFixed(2)}% faster`);
}

main();
