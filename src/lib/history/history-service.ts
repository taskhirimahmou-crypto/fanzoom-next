import type PocketBase from 'pocketbase';

export const CANONICAL_HISTORY_COLLECTION = 'reading_history';
export const LEGACY_HISTORY_COLLECTION = 'history';

export type ReadingHistoryItem<TArticle = unknown> = {
  id: string;
  user: string;
  article: string;
  last_read?: string;
  progress?: number;
  created: string;
  updated: string;
  expand?: { article?: TArticle };
};

function lastReadOf(record: ReadingHistoryItem): string {
  return record.last_read || record.updated || record.created;
}

export function mergeReadingHistoryRecords<TArticle>(
  canonical: ReadingHistoryItem<TArticle>[],
  legacy: ReadingHistoryItem<TArticle>[],
): ReadingHistoryItem<TArticle>[] {
  const byArticle = new Map<string, ReadingHistoryItem<TArticle>>();
  for (const record of [...legacy, ...canonical]) {
    const current = byArticle.get(record.article);
    if (!current || lastReadOf(record) > lastReadOf(current)) {
      byArticle.set(record.article, record);
    }
  }
  return [...byArticle.values()].sort((a, b) => lastReadOf(b).localeCompare(lastReadOf(a)));
}

async function readCollection<TArticle>(
  pb: PocketBase,
  collectionName: string,
  userId: string,
): Promise<ReadingHistoryItem<TArticle>[]> {
  try {
    return await pb.collection(collectionName).getFullList<ReadingHistoryItem<TArticle>>({
      filter: pb.filter('user = {:userId}', { userId }),
      expand: 'article',
    });
  } catch {
    // During rolling deployment either the legacy or canonical collection may not exist.
    return [];
  }
}

export async function listReadingHistory<TArticle>(
  pb: PocketBase,
  userId: string,
): Promise<ReadingHistoryItem<TArticle>[]> {
  const [canonical, legacy] = await Promise.all([
    readCollection<TArticle>(pb, CANONICAL_HISTORY_COLLECTION, userId),
    readCollection<TArticle>(pb, LEGACY_HISTORY_COLLECTION, userId),
  ]);
  return mergeReadingHistoryRecords(canonical, legacy);
}

async function upsertInCollection(
  pb: PocketBase,
  collectionName: string,
  userId: string,
  articleId: string,
  lastRead: string,
): Promise<void> {
  const collection = pb.collection(collectionName);
  const existing = await collection.getList(1, 1, {
    filter: pb.filter('user = {:userId} && article = {:articleId}', { userId, articleId }),
  });
  if (existing.items.length > 0) {
    await collection.update(existing.items[0].id, { last_read: lastRead });
    return;
  }
  await collection.create({ user: userId, article: articleId, last_read: lastRead });
}

export async function upsertReadingHistory(
  pb: PocketBase,
  userId: string,
  articleId: string,
  lastRead: string,
): Promise<'canonical' | 'legacy'> {
  try {
    await upsertInCollection(pb, CANONICAL_HISTORY_COLLECTION, userId, articleId, lastRead);
    return 'canonical';
  } catch (canonicalError) {
    try {
      await upsertInCollection(pb, LEGACY_HISTORY_COLLECTION, userId, articleId, lastRead);
      return 'legacy';
    } catch {
      throw canonicalError;
    }
  }
}

async function deleteFromCollection(
  pb: PocketBase,
  collectionName: string,
  userId: string,
  articleId: string,
): Promise<boolean> {
  try {
    const collection = pb.collection(collectionName);
    const records = await collection.getFullList({
      filter: pb.filter('user = {:userId} && article = {:articleId}', { userId, articleId }),
      fields: 'id',
    });
    await Promise.all(records.map((record) => collection.delete(record.id)));
    return true;
  } catch {
    return false;
  }
}

export async function deleteReadingHistory(
  pb: PocketBase,
  userId: string,
  articleId: string,
): Promise<void> {
  const results = await Promise.all([
    deleteFromCollection(pb, CANONICAL_HISTORY_COLLECTION, userId, articleId),
    deleteFromCollection(pb, LEGACY_HISTORY_COLLECTION, userId, articleId),
  ]);
  if (!results.some(Boolean)) throw new Error('history collections are unavailable');
}
