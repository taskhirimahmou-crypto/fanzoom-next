import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const migrationDirectory = join(process.cwd(), 'pb_migrations');
const migrationFiles = readdirSync(migrationDirectory)
  .filter((file) => file.endsWith('.js'))
  .sort();

const readMigration = (suffix: string) => {
  const file = migrationFiles.find((candidate) => candidate.endsWith(suffix));
  if (!file) throw new Error(`missing migration: ${suffix}`);
  return readFileSync(join(migrationDirectory, file), 'utf8');
};

type FieldData = { name: string } & Record<string, unknown>;

class MockFieldsList {
  private readonly values: FieldData[];

  constructor(fields: FieldData[] = []) {
    this.values = fields.map((field) => ({ ...field }));
  }

  getByName(name: string): FieldData | undefined {
    return this.values.find((field) => field.name === name);
  }

  add(field: FieldData): void {
    this.values.push(field);
  }
}

class MockField implements FieldData {
  name: string;
  [key: string]: unknown;

  constructor(data: FieldData) {
    this.name = data.name;
    Object.assign(this, data);
  }
}

class MockCollection {
  id: string;
  name: string;
  fields: MockFieldsList;
  indexes: string[];
  listRule: string | null;
  viewRule: string | null;
  createRule: string | null;
  updateRule: string | null;
  deleteRule: string | null;

  constructor(data: Record<string, unknown>) {
    this.name = String(data.name);
    this.id = String(data.id || `${this.name}_collection`);
    this.fields = new MockFieldsList((data.fields || []) as FieldData[]);
    this.indexes = [...((data.indexes || []) as string[])];
    this.listRule = (data.listRule as string | null | undefined) ?? null;
    this.viewRule = (data.viewRule as string | null | undefined) ?? null;
    this.createRule = (data.createRule as string | null | undefined) ?? null;
    this.updateRule = (data.updateRule as string | null | undefined) ?? null;
    this.deleteRule = (data.deleteRule as string | null | undefined) ?? null;
  }

  addIndex(name: string, unique: boolean, fields: string): void {
    this.indexes.push(`CREATE ${unique ? 'UNIQUE ' : ''}INDEX ${name} ON ${this.name} (${fields})`);
  }
}

class MockRecord {
  id = '';
  readonly values = new Map<string, string | number>();

  constructor(readonly collection: MockCollection) {}

  set(name: string, value: string | number): void {
    this.values.set(name, value);
  }

  getString(name: string): string {
    return String(this.values.get(name) || '');
  }
}

class MockApp {
  private sequence = 0;
  readonly collections = new Map<string, MockCollection>();
  readonly records = new Map<string, MockRecord[]>();

  findCollectionByNameOrId(name: string): MockCollection {
    const collection = this.collections.get(name);
    if (!collection) throw new Error('collection not found');
    return collection;
  }

  findAllRecords(name: string): MockRecord[] {
    return [...(this.records.get(name) || [])];
  }

  findFirstRecordByFilter(
    name: string,
    _filter: string,
    params: { userId: string; articleId: string },
  ): MockRecord {
    const record = this.findAllRecords(name).find(
      (candidate) =>
        candidate.getString('user') === params.userId &&
        candidate.getString('article') === params.articleId,
    );
    if (!record) throw new Error('record not found');
    return record;
  }

  save(model: MockCollection | MockRecord): void {
    if (model instanceof MockCollection) {
      this.collections.set(model.name, model);
      if (!this.records.has(model.name)) this.records.set(model.name, []);
      return;
    }

    if (!model.id) model.id = `record_${++this.sequence}`;
    if (!model.getString('created')) model.set('created', '2026-08-11T00:00:00.000Z');
    model.set('updated', '2026-08-11T00:00:00.000Z');
    const records = this.records.get(model.collection.name) || [];
    if (!records.includes(model)) records.push(model);
    this.records.set(model.collection.name, records);
  }
}

function runMigration(app: MockApp, suffix: string): void {
  const fieldConstructors = {
    TextField: MockField,
    FileField: MockField,
    SelectField: MockField,
    EditorField: MockField,
    URLField: MockField,
    NumberField: MockField,
    DateField: MockField,
    BoolField: MockField,
    RelationField: MockField,
  };
  runInNewContext(readMigration(suffix), {
    ...fieldConstructors,
    Collection: MockCollection,
    Record: MockRecord,
    migrate: (up: (migrationApp: MockApp) => void) => up(app),
  });
}

describe('PocketBase migration contract', () => {
  it('bootstraps dependencies on a fresh database without destructive down migrations', () => {
    const migration = readMigration('bootstrap_core_schema.js');
    expect(migration).toContain('name: "users"');
    expect(migration).toContain('name: "articles"');
    expect(migration).toContain('name: "reading_history"');
    expect(migration).not.toMatch(/app\.delete\s*\(/);

    const app = new MockApp();
    expect(() => runMigration(app, 'bootstrap_core_schema.js')).not.toThrow();
    expect(() => runMigration(app, 'bootstrap_core_schema.js')).not.toThrow();
    expect(app.collections.get('reading_history')?.fields.getByName('last_read')).toBeDefined();
  });

  it('copies legacy history into canonical reading_history without deleting the source', () => {
    const migration = readMigration('migrate_legacy_history.js');
    expect(migration).toContain('app.findAllRecords("history")');
    expect(migration).toContain('new Record(canonical)');
    expect(migration).not.toMatch(/app\.delete\s*\(/);

    const app = new MockApp();
    runMigration(app, 'bootstrap_core_schema.js');
    const legacy = new MockCollection({
      name: 'history',
      fields: [
        { name: 'user' },
        { name: 'article' },
        { name: 'last_read' },
      ],
    });
    app.save(legacy);
    const legacyRecord = new MockRecord(legacy);
    legacyRecord.set('user', 'user1234567890');
    legacyRecord.set('article', 'article12345678');
    legacyRecord.set('last_read', '2026-08-10T00:00:00.000Z');
    app.save(legacyRecord);

    runMigration(app, 'migrate_legacy_history.js');
    runMigration(app, 'migrate_legacy_history.js');
    expect(app.findAllRecords('reading_history')).toHaveLength(1);
    expect(app.findAllRecords('history')).toHaveLength(1);
  });

  it('keeps recommendation_events private and indexed for idempotency', () => {
    const migration = readMigration('create_recommendation_events.js');
    for (const rule of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']) {
      expect(migration).toContain(`${rule}: null`);
    }
    expect(migration).toContain('idx_recommendation_events_user_idempotency');
    expect(migration).toContain('"progress_milestone"');
    expect(migration).toContain('{ name: "receivedAt", type: "date", required: true }');

    const app = new MockApp();
    runMigration(app, 'bootstrap_core_schema.js');
    expect(() => runMigration(app, 'create_recommendation_events.js')).not.toThrow();
    expect(() => runMigration(app, 'create_recommendation_events.js')).not.toThrow();
    const collection = app.collections.get('recommendation_events');
    expect(collection).toMatchObject({
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
    });
    expect(collection?.fields.getByName('userId')).toBeDefined();
  });

  it('adds explicit personalization consent without opting legacy users in', () => {
    const migration = readMigration('add_personalization_consent.js');
    expect(migration).toContain('new BoolField({ name: "personalizationEnabled" })');
    expect(migration).not.toMatch(/app\.delete\s*\(/);

    const app = new MockApp();
    runMigration(app, 'bootstrap_core_schema.js');
    expect(() => runMigration(app, 'add_personalization_consent.js')).not.toThrow();
    expect(() => runMigration(app, 'add_personalization_consent.js')).not.toThrow();
    expect(app.collections.get('users')?.fields.getByName('personalizationEnabled')).toBeDefined();
    expect(app.collections.get('users')?.fields.getByName('personalizationConsentAt')).toBeDefined();
  });

  it('adds the direct recommendation surface idempotently for existing databases', () => {
    const migration = readMigration('add_direct_recommendation_surface.js');
    expect(migration).not.toMatch(/app\.delete\s*\(/);

    const app = new MockApp();
    runMigration(app, 'bootstrap_core_schema.js');
    runMigration(app, 'create_recommendation_events.js');
    const surface = app.collections.get('recommendation_events')?.fields.getByName('surface');
    if (surface) surface.values = ((surface.values as string[]) || []).filter((value) => value !== 'direct');

    expect(() => runMigration(app, 'add_direct_recommendation_surface.js')).not.toThrow();
    expect(() => runMigration(app, 'add_direct_recommendation_surface.js')).not.toThrow();
    expect(surface?.values).toContain('direct');
  });

  it('locks direct comment creation and updates without changing existing records', () => {
    const migration = readMigration('harden_comment_moderation.js');
    expect(migration).toContain('comments.createRule = null');
    expect(migration).toContain('comments.updateRule = null');
    expect(migration).not.toMatch(/app\.delete\s*\(/);

    const app = new MockApp();
    runMigration(app, 'bootstrap_core_schema.js');
    const comments = app.collections.get('comments');
    expect(comments).toBeDefined();
    if (comments) {
      comments.createRule = '@request.auth.id = user.id';
      comments.updateRule = '@request.auth.id = user.id';
      const existing = new MockRecord(comments);
      existing.set('content', 'existing comment');
      app.save(existing);
    }

    expect(() => runMigration(app, 'harden_comment_moderation.js')).not.toThrow();
    expect(() => runMigration(app, 'harden_comment_moderation.js')).not.toThrow();
    expect(comments).toMatchObject({ createRule: null, updateRule: null });
    expect(app.findAllRecords('comments')).toHaveLength(1);
  });
});
