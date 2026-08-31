import type PocketBase from 'pocketbase';
import {
  servedEventSemanticMarker,
  type ClientRecommendationEventRepository,
  type RecommendationEventBatchRepository,
  type StoredClientRecommendationEvent,
  type StoredRecommendationEvent,
} from './event-service';
import type { RecommendationEventRecord } from './contracts';
import type { RecommendationAttribution } from './attribution';

type PocketBaseError = { status?: number };

export class PocketBaseRecommendationEventRepository
  implements ClientRecommendationEventRepository, RecommendationEventBatchRepository
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

  async findClientEventByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<StoredClientRecommendationEvent | null> {
    try {
      const record = await this.pb.collection('recommendation_events').getFirstListItem(
        this.pb.filter('userId = {:userId} && idempotencyKey = {:idempotencyKey}', {
          userId,
          idempotencyKey,
        }),
        {
          fields: [
            'eventId',
            'articleId',
            'eventType',
            'surface',
            'feedId',
            'rank',
            'algorithmVersion',
            'maxProgress',
            'reasonCode',
          ].join(','),
        },
      );
      const optionalText = (value: unknown) => {
        const text = String(value ?? '');
        return text || undefined;
      };
      const optionalNumber = (value: unknown) => {
        const number = Number(value);
        return Number.isFinite(number) && number > 0 ? number : undefined;
      };
      return {
        eventId: String(record.eventId),
        articleId: String(record.articleId),
        eventType: record.eventType as RecommendationEventRecord['eventType'],
        surface: record.surface as RecommendationEventRecord['surface'],
        feedId: optionalText(record.feedId),
        rank: optionalNumber(record.rank),
        algorithmVersion: optionalText(record.algorithmVersion),
        maxProgress: optionalNumber(record.maxProgress),
        reasonCode: optionalText(record.reasonCode),
      };
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

    const found = new Set<string>();
    for (let offset = 0; offset < keys.length; offset += 40) {
      const chunk = keys.slice(offset, offset + 40);
      const params: Record<string, string> = { userId };
      const keyFilters = chunk.map((key, index) => {
        params[`key${index}`] = key;
        return `idempotencyKey = {:key${index}}`;
      });
      const records = await this.pb.collection('recommendation_events').getFullList({
        filter: this.pb.filter(`userId = {:userId} && (${keyFilters.join(' || ')})`, params),
        fields: 'idempotencyKey,eventType,articleId,feedId,rank,surface,algorithmVersion',
      });
      for (const record of records) {
        found.add(String(record.idempotencyKey));
        if (record.eventType === 'served') {
          found.add(servedEventSemanticMarker({
            articleId: String(record.articleId),
            feedId: String(record.feedId),
            rank: Number(record.rank),
            surface: record.surface as RecommendationEventRecord['surface'],
            algorithmVersion: String(record.algorithmVersion),
          }));
        }
      }
    }
    return found;
  }

  async articleExists(articleId: string): Promise<boolean> {
    try {
      await this.pb.collection('articles').getOne(articleId, { fields: 'id' });
      return true;
    } catch (error) {
      if ((error as PocketBaseError).status === 404) return false;
      throw error;
    }
  }

  async hasRecentServed(
    userId: string,
    articleId: string,
    attribution: RecommendationAttribution,
    receivedAfter: string,
  ): Promise<boolean> {
    return this.hasEvent(
      'userId = {:userId} && articleId = {:articleId} && eventType = "served" && feedId = {:feedId} && rank = {:rank} && surface = {:surface} && algorithmVersion = {:algorithmVersion} && receivedAt >= {:receivedAfter}',
      { userId, articleId, receivedAfter, ...attribution },
    );
  }

  async hasRecentOpen(
    userId: string,
    articleId: string,
    attribution: RecommendationAttribution | undefined,
    receivedAfter: string,
  ): Promise<boolean> {
    if (attribution) {
      return this.hasEvent(
        'userId = {:userId} && articleId = {:articleId} && eventType = "open" && feedId = {:feedId} && rank = {:rank} && surface = {:surface} && algorithmVersion = {:algorithmVersion} && receivedAt >= {:receivedAfter}',
        { userId, articleId, receivedAfter, ...attribution },
      );
    }
    return this.hasEvent(
      'userId = {:userId} && articleId = {:articleId} && eventType = "open" && feedId = "" && algorithmVersion = "" && surface = "direct" && receivedAt >= {:receivedAfter}',
      { userId, articleId, receivedAfter },
    );
  }

  async findHighestProgressMilestone(
    userId: string,
    articleId: string,
    attribution: RecommendationAttribution | undefined,
    directSurface: string | undefined,
    receivedAfter: string,
  ): Promise<number | undefined> {
    const params: Record<string, string | number> = { userId, articleId, receivedAfter };
    let channelFilter: string;
    if (attribution) {
      Object.assign(params, attribution);
      channelFilter = 'feedId = {:feedId} && rank = {:rank} && surface = {:surface} && algorithmVersion = {:algorithmVersion}';
    } else {
      params.directSurface = directSurface ?? 'article';
      channelFilter = 'feedId = "" && algorithmVersion = "" && surface = {:directSurface}';
    }

    try {
      const record = await this.pb.collection('recommendation_events').getFirstListItem(
        this.pb.filter(
          `userId = {:userId} && articleId = {:articleId} && eventType = "progress_milestone" && ${channelFilter} && receivedAt >= {:receivedAfter}`,
          params,
        ),
        { fields: 'maxProgress', sort: '-maxProgress' },
      );
      const value = Number(record.maxProgress);
      return Number.isFinite(value) ? value : undefined;
    } catch (error) {
      if ((error as PocketBaseError).status === 404) return undefined;
      throw error;
    }
  }

  private async hasEvent(filter: string, params: Record<string, string | number>): Promise<boolean> {
    try {
      await this.pb.collection('recommendation_events').getFirstListItem(
        this.pb.filter(filter, params),
        { fields: 'id' },
      );
      return true;
    } catch (error) {
      if ((error as PocketBaseError).status === 404) return false;
      throw error;
    }
  }

}
