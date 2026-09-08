import type { DeezDB } from './schema';
import { META_KEY } from './schema';

/**
 * Minting `PREFIX-YYYY-MM-DD-N` identifiers (`PackageId`, `InstructionId`) off
 * `AppMeta.package_counter` — "Date -> highest N used" (`schema.ts`). Package
 * and instruction ids share the one counter map, keyed by `PREFIX-date`
 * rather than date alone, since `session_counter` already exists as its own
 * field for `SessionId` and the map itself doesn't care how many prefixes
 * use it.
 */
export async function mintDatedId(db: DeezDB, prefix: string, date: string): Promise<string> {
  const meta = await db.get('meta', META_KEY);
  if (!meta) throw new Error('No device identity yet — the seed has not run.');
  const key = `${prefix}-${date}`;
  const n = (meta.package_counter[key] ?? 0) + 1;
  await db.put('meta', { ...meta, package_counter: { ...meta.package_counter, [key]: n } }, META_KEY);
  return `${prefix}-${date}-${n}`;
}
