export function isPocketBaseRecordId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9]{15}$/i.test(value);
}
