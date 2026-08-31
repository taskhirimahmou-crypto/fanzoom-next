import type PocketBase from 'pocketbase';
import type { RecommendationAttribution } from './attribution';

type PocketBaseError = { status?: number };
export const OPEN_ATTRIBUTION_MAX_AGE_MS = 30 * 60_000;

export class PocketBaseServedAttributionRepository {
  constructor(private readonly pb: PocketBase) {}

  async exists(
    userId: string,
    articleId: string,
    attribution: RecommendationAttribution,
    receivedAfter: string,
  ): Promise<boolean> {
    try {
      await this.pb.collection('recommendation_events').getFirstListItem(
        this.pb.filter(
          'userId = {:userId} && articleId = {:articleId} && eventType = "served" && feedId = {:feedId} && rank = {:rank} && surface = {:surface} && algorithmVersion = {:algorithmVersion} && receivedAt >= {:receivedAfter}',
          { userId, articleId, receivedAfter, ...attribution },
        ),
        { fields: 'id' },
      );
      return true;
    } catch (error) {
      if ((error as PocketBaseError).status === 404) return false;
      throw error;
    }
  }
}

export async function validateTrustedOpenAttribution(
  candidate: RecommendationAttribution | undefined,
  userId: string,
  articleId: string,
  repository: Pick<PocketBaseServedAttributionRepository, 'exists'>,
  now = new Date(),
): Promise<RecommendationAttribution | undefined> {
  if (!candidate) return undefined;
  const receivedAfter = new Date(now.getTime() - OPEN_ATTRIBUTION_MAX_AGE_MS)
    .toISOString()
    .replace('T', ' ');
  return (await repository.exists(userId, articleId, candidate, receivedAfter))
    ? candidate
    : undefined;
}
