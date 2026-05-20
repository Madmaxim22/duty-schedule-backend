import { formatSurnameWithInitials, normalizeFio } from './format-name.js';

export type UserForFioMatch = { id: string; fullName: string };

export function buildUserFioIndex(users: UserForFioMatch[]): {
  index: Map<string, string>;
  ambiguousKeys: Set<string>;
} {
  const keyToIds = new Map<string, Set<string>>();

  for (const user of users) {
    const keys = [
      normalizeFio(user.fullName),
      normalizeFio(formatSurnameWithInitials(user.fullName)),
    ];
    for (const key of keys) {
      if (!key) continue;
      const set = keyToIds.get(key) ?? new Set<string>();
      set.add(user.id);
      keyToIds.set(key, set);
    }
  }

  const index = new Map<string, string>();
  const ambiguousKeys = new Set<string>();

  for (const [key, ids] of keyToIds) {
    if (ids.size === 1) {
      index.set(key, [...ids][0]!);
    } else {
      ambiguousKeys.add(key);
    }
  }

  return { index, ambiguousKeys };
}

export function matchFioToUserId(
  fio: string,
  index: Map<string, string>,
  ambiguousKeys: Set<string>,
): { userId: string } | { ambiguous: true } | { notFound: true } {
  const key = normalizeFio(fio);
  if (!key) return { notFound: true };
  if (ambiguousKeys.has(key)) return { ambiguous: true };
  const userId = index.get(key);
  if (!userId) return { notFound: true };
  return { userId };
}
