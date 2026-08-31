# recommender-v2 foundation contract

## Client ingestion

Authenticated clients send JSON to `POST /api/recommendation-events`. The server derives
`userId`, `eventId` and `receivedAt`; sending any of those fields is rejected. Anonymous
ingestion is intentionally disabled. Both the client transport and server endpoint require the
fresh `users.personalizationEnabled` opt-in; legacy users default to disabled.

Client-observed event types accepted by this endpoint are:

- `impression`
- `engaged`
- `progress_milestone`
- `share`
- `not_interested`

`served`, `open`, `bookmark_add`, `bookmark_remove` and `comment` are trusted server events.
The existing history, bookmark and comment routes record their applicable trusted events.
`served` is recorded by the server after a successful feed, using one PocketBase batch for the
missing events. Its deterministic idempotency key binds the feed, surface, algorithm hash,
article and rank; a preflight read plus the unique database index makes
retries and concurrent requests safe without one network write per card.

Initial server-rendered feeds report to `POST /api/recommendation-events/served` only after the
client mounts, avoiding Next.js prefetch false positives. The request contains `feedId`, surface,
algorithm version, offset, and the exact article IDs (maximum 50). It contains no user or rank.
The authenticated server reloads interests, reconstructs the baseline slice, requires an exact
ordered ID match, derives ranks, checks consent, and applies a 30-batch/minute per-user limit.
Paginated `GET /api/recommended` responses record the same trusted batch directly.

Example impression payload:

```json
{
  "idempotencyKey": "impression:client-generated-key",
  "articleId": "abc123def456ghi",
  "eventType": "impression",
  "surface": "for_you",
  "feedId": "server-issued-feed-id",
  "rank": 1,
  "algorithmVersion": "baseline-category-round-robin-v1",
  "occurredAt": "2026-08-11T12:00:00.000Z"
}
```

Successful creation returns HTTP `201`; an idempotent retry returns HTTP `200` with
`duplicate: true`. Invalid input returns `400`, missing auth returns `401`, and the current
per-process limit of 120 requests per user/minute returns `429` with `Retry-After`. Invalid
payloads and duplicate retries consume this budget. A cheap hashed-cookie request bucket plus a
high global ceiling runs before session refresh, and the authenticated user limiter runs before
any superuser login or event lookup. The served POST, recommended GET, history-open POST, and
comment POST use the same ordering around their privileged work. These controls and the in-process
milestone serialization are suitable for the current single-instance staging check; move them to
shared storage or database-level coordination before relying on them across horizontally scaled
Vercel instances. The global ceiling remains the fail-safe for rotated malformed auth cookies.

Before a new client event is stored, the server verifies that the article exists. Recommendation-
attributed events must contain the complete `feedId`, `rank`, `surface`, and `algorithmVersion`
tuple and match a `served` event for the same user/article received in the previous 30 minutes.
`impression` and `not_interested` are never accepted as direct events. `progress_milestone` and
`engaged` additionally require a recent `open` in the same attributed or direct channel, and
milestones may only advance through 25/50/75/90. Idempotency-key prefixes are bound to event type
so a client event cannot reserve a trusted `served`, `open`, bookmark, or comment key.

## Baseline feed metadata

`GET /api/recommended` retains the category round-robin ordering and offset pagination. It now
also returns `feedId` and `algorithmVersion`. Clients must send the same `feedId` on later pages.
This is attribution metadata only; feed snapshots and a new ranker are deliberately out of scope.

## Phase 1 observation rules

- An `impression` requires at least 50% card visibility for one continuous second and is emitted
  at most once per article/feed. Leaving the threshold, unmounting, or a Strict Mode cleanup
  cancels the pending timer.
- Recommendation links preserve validated `feedId`, `rank`, `surface`, and `algorithmVersion`.
  Direct, search, history, and incomplete links receive no recommendation attribution.
- Active reading counts only while the document is visible, the window is focused, and the
  article body intersects the viewport. Milestones are 25/50/75/90. `engaged` fires once after
  25% of estimated reading time clamped to 8-15 seconds, or after 5 active seconds plus 50%
  progress.
- Share is recorded only after Web Share or clipboard success. There is currently no
  `not_interested` card control; the API event remains reserved for a later deliberate UI.
