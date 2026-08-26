import type PocketBase from 'pocketbase';
import type {
  RecommendationEventBatchRepository,
  RecommendationEventRepository,
  StoredRecommendationEvent,
} from './event-service';
import type { RecommendationEventRecord } from './contracts';

type PocketBaseError = { status?: number };

export class PocketBaseRecommendationEventRepository
  implements RecommendationEventRepository, RecommendationEventBatchRepository
{
  constructor(private readonly pb: PocketBase) {}

  async findByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<StoredRecommendationEvent | null> {
    try {
      const record = await this.pb.collection('recommendation_events').getFirstListItem(
        this.pb.filter('userId = {:userId} && idempotencyKey = {:idempotencyKey}', {
          userId,
          idempotencyKey,
        }),
        { fields: 'eventId' },
      );
      return { eventId: String(record.eventId) };
    } catch (error) {
      if ((error as PocketBaseError).status === 404) return null;
      throw error;
    }
  }

  async create(event: RecommendationEventRecord): Promise<StoredRecommendationEvent> {
    const record = await this.pb.collection('recommendation_events').create(event, {
      fields: 'eventId',
    });
    return { eventId: String(record.eventId) };
  }

  async findExistingIdempotencyKeys(userId: string, keys: readonly string[]): Promise<Set<string>> {
    if (keys.length === 0) return new Set();

    const params: Record<string, string> = { userId };
    const keyFilters = keys.map((key, index) => {
      params[`key${index}`] = key;
      return `idempotencyKey = {:key${index}}`;
    });
    const records = await this.pb.collection('recommendation_events').getFullList({
      filter: this.pb.filter(`userId = {:userId} && (${keyFilters.join(' || ')})`, params),
      fields: 'idempotencyKey',
    });
    return new Set(records.map((record) => String(record.idempotencyKey)));
  }

}
