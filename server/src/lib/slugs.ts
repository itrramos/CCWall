import type { Db } from '../db/index.js';

export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'wallboard';
}

export function uniqueSlug(db: Db, base: string, excludeId?: string): string {
  let candidate = slugify(base);
  let i = 2;
  for (;;) {
    const row = db
      .prepare('SELECT id FROM wallboards WHERE slug = ?')
      .get(candidate) as { id: string } | undefined;
    if (!row || row.id === excludeId) return candidate;
    candidate = `${slugify(base)}-${i}`;
    i += 1;
  }
}
