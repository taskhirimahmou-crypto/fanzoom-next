import { describe, expect, it } from 'vitest';
import { AdminAccessInputError, parseAdminAccessQuery } from './management';

describe('admin access query contract', () => {
  it('allows bounded pagination and a minimum three-character search', () => {
    expect(parseAdminAccessQuery(new URLSearchParams('q=ali&page=2&perPage=25&adminPage=3'))).toEqual({
      query: 'ali', page: 2, perPage: 25, adminPage: 3,
    });
    expect(parseAdminAccessQuery(new URLSearchParams())).toEqual({
      query: '', page: 1, perPage: 10, adminPage: 1,
    });
  });

  it.each(['q=ab', 'page=0', 'perPage=100', 'actor=forged'])('rejects invalid or unknown input: %s', (query) => {
    expect(() => parseAdminAccessQuery(new URLSearchParams(query))).toThrow(AdminAccessInputError);
  });
});
