type PersonalizationRecord = {
  personalizationEnabled?: unknown;
};

export function isPersonalizationEnabled(record: unknown): boolean {
  return Boolean(
    record &&
    typeof record === 'object' &&
    (record as PersonalizationRecord).personalizationEnabled === true,
  );
}

export async function readPersonalizationEnabled(
  pb: {
    collection(name: 'users'): {
      getOne(id: string, options?: { fields?: string }): Promise<PersonalizationRecord>;
    };
  },
  userId: string,
): Promise<boolean> {
  const user = await pb.collection('users').getOne(userId, {
    fields: 'personalizationEnabled',
  });
  return isPersonalizationEnabled(user);
}
