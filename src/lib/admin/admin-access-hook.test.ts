import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'pb_hooks', 'admin_access.pb.js'), 'utf8');

describe('PocketBase admin access hook contract', () => {
  it('requires superuser auth and makes mutation plus audit transactional', () => {
    expect(source).toContain('e.hasSuperuserAuth()');
    expect(source).toContain('e.app.runInTransaction');
    expect(source).toContain('txApp.save(membership)');
    expect(source).toContain('txApp.save(audit)');
    expect(source).toContain('last_owner_protected');
    expect(source).toContain('self_lockout_forbidden');
    expect(source).toContain('owner_transfer_required');
  });

  it('keeps audit append-only and stores no email, token, cookie or IP fields', () => {
    expect(source).toContain('onRecordUpdateRequest');
    expect(source).toContain('onRecordDeleteRequest');
    expect(source).not.toMatch(/audit\.set\("(email|token|cookie|ip)"/i);
  });
});
