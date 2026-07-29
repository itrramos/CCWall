import type { Db } from '../db/index.js';
import { now } from '../db/index.js';
import {
  settingsGroups,
  type AllSettings,
  type SettingsGroup
} from '../schemas.js';

/** Returns defaults merged with any stored overrides for one group. */
export function getSettingsGroup<G extends SettingsGroup>(db: Db, group: G): AllSettings[G] {
  const schema = settingsGroups[group];
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(group) as
    | { value: string }
    | undefined;
  const defaults = schema.parse({});
  if (!row) return defaults as AllSettings[G];
  try {
    const stored = JSON.parse(row.value) as Record<string, unknown>;
    return schema.parse({ ...(defaults as object), ...stored }) as AllSettings[G];
  } catch {
    return defaults as AllSettings[G];
  }
}

export function getAllSettings(db: Db): AllSettings {
  return {
    general: getSettingsGroup(db, 'general'),
    wallboard: getSettingsGroup(db, 'wallboard'),
    security: getSettingsGroup(db, 'security'),
    storage: getSettingsGroup(db, 'storage'),
    system: getSettingsGroup(db, 'system')
  };
}

/** Validates and persists a partial update to one settings group. */
export function updateSettingsGroup<G extends SettingsGroup>(
  db: Db,
  group: G,
  patch: Record<string, unknown>
): AllSettings[G] {
  const current = getSettingsGroup(db, group);
  const next = settingsGroups[group].parse({ ...(current as object), ...patch });
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(group, JSON.stringify(next), now());
  return next as AllSettings[G];
}
