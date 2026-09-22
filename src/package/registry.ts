import type { PackageRecord, SessionRecord } from '../db/schema';
import type { ISODate, PackageId, PlantId, SessionId } from '../types/ids';

/**
 * What the app remembers about packages that left the device — and, since
 * 2026-09-21, about ones that were built and never confirmed.
 *
 * ## Why this file exists
 *
 * `PKG-2026-09-21-1` was built on the phone, saved, handed to the reviewing
 * AI, and answered. The app then refused the answer: "doesn't match any
 * package this app exported." It was right to refuse — no `PackageRecord`
 * existed. The record was only ever written inside the `confirmSent` closure
 * `buildReviewPackage` returned, and that closure lives in React state. A
 * reload, an iOS tab eviction, a stray Back, or tapping "No" dropped it, and
 * **nothing in the app could register that package afterwards.** The id was
 * spent, the events were folded, and the Handoff log showed nothing at all.
 *
 * The question the owner's GPT asked is the right one: the app must be able to
 * tell "built" from "sent". So a record is now written when the package is
 * **built**, carrying `sent: null`, and confirmation moves it to `sent: date`.
 *
 * ## The rules that do not move
 *
 * Only a CONFIRMED SENT package consumes events and walks. That is what kept
 * the old cancel-the-share-sheet case safe, and it is preserved exactly: a
 * built-but-unconfirmed package is a note to the owner, not a claim about
 * what the AI has seen. An update file still validates only against a
 * confirmed-sent package, so persisting earlier buys the owner visibility
 * without buying the AI a wider door.
 *
 * ## Pure on purpose
 *
 * Every rule here is a function of records in, answer out — no `db`, no React.
 * `clock.ts` and `parts.ts` were pulled out the same way after being wrong
 * three times inside the code that used them. This one decides whether the
 * owner's record of a real review round is recoverable, which is not a
 * judgement to make inside a component.
 */

/**
 * Was this package confirmed as having actually left the device?
 *
 * **A missing `sent` means yes.** Every record written before 2026-09-21 was
 * written by `confirmSent` and by nothing else, so its existence *was* the
 * confirmation. Reading absence as "unconfirmed" would retroactively unsend
 * the Sep 15 and Sep 17 rounds and let their updates be applied a second
 * time — so absence means sent, and new records always say which they are.
 */
export function isConfirmedSent(record: PackageRecord): boolean {
  return record.sent !== null;
}

export function confirmedSent(records: readonly PackageRecord[]): PackageRecord[] {
  return records.filter(isConfirmedSent);
}

export function builtNotSent(records: readonly PackageRecord[]): PackageRecord[] {
  return records.filter((r) => !isConfirmedSent(r));
}

/** Every event id already carried by a package that really went out. */
export function consumedEventIds(records: readonly PackageRecord[]): Set<string> {
  const ids = new Set<string>();
  for (const record of confirmedSent(records)) {
    for (const id of record.event_ids) ids.add(id);
  }
  return ids;
}

/** Every walk already carried by a package that really went out. */
export function consumedSessionIds(records: readonly PackageRecord[]): Set<string> {
  const ids = new Set<string>();
  for (const record of confirmedSent(records)) {
    for (const id of record.session_ids ?? []) ids.add(id);
  }
  return ids;
}

/* -------------------------------------------------------------------------- */
/* Recovering a package from its own ZIP                                       */
/* -------------------------------------------------------------------------- */

/**
 * The three files a recovery reads. Named rather than passed as `unknown` so
 * the caller has to have parsed them before asking anything of this module.
 */
export interface ZipEvidence {
  manifest: { package_id?: unknown; generated?: unknown; plants?: unknown };
  /** `events.json` — the array as it travelled. */
  events: unknown;
  /** `markers.json` — `{ sessions: [...] }`. May be absent on an old package. */
  markers: { sessions?: unknown } | null;
}

export interface Reconstructed {
  record: PackageRecord;
  /** Walk ids named in the ZIP that the device no longer holds. */
  missing_sessions: SessionId[];
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const PKG_ID_RE = /^PKG-\d{4}-\d{2}-\d{2}-\d+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Rebuild the `PackageRecord` the app failed to write, from the package's own
 * files plus the walks still on the device.
 *
 * **Nothing here is invented.** `package_id` and `generated` are the
 * manifest's own; `plant_ids` are the plants it actually named; `event_ids`
 * are the events it actually carried; `session_ids` are the walks its marker
 * file actually described. Tier and `verified` are recomputed from the live
 * `sessions` store rather than parsed back out of `transcript.txt`, because
 * the session records are the authority on their own coverage and the text
 * file is a rendering of them.
 *
 * It returns `sent: null`. Recovery reconstructs *a package that was built*;
 * whether it reached the AI is still the owner's answer, given in one tap on
 * the Handoff log. For `PKG-2026-09-21-1` that answer is plainly yes — there
 * is an update file citing it — but the app is not going to start inferring
 * that from the presence of a reply.
 */
export function reconstructFromZip(
  evidence: ZipEvidence,
  sessions: readonly SessionRecord[],
): { ok: true; value: Reconstructed } | { ok: false; reason: string } {
  const { manifest, events, markers } = evidence;

  const package_id = manifest.package_id;
  if (typeof package_id !== 'string' || !PKG_ID_RE.test(package_id)) {
    return { ok: false, reason: 'manifest.json has no package_id in the form PKG-YYYY-MM-DD-N.' };
  }
  const generated = manifest.generated;
  if (typeof generated !== 'string' || !ISO_DATE_RE.test(generated)) {
    return { ok: false, reason: `manifest.json for ${package_id} has no valid "generated" date.` };
  }
  if (!Array.isArray(manifest.plants)) {
    return { ok: false, reason: 'manifest.json carries no plants array.' };
  }
  if (!Array.isArray(events)) {
    return { ok: false, reason: 'events.json is not an array.' };
  }

  const plant_ids: PlantId[] = [];
  for (const p of manifest.plants) {
    if (!isObj(p) || typeof p.plant_id !== 'string') {
      return { ok: false, reason: 'A plant in manifest.json has no plant_id.' };
    }
    plant_ids.push(p.plant_id as PlantId);
  }

  const event_ids: string[] = [];
  for (const e of events) {
    if (!isObj(e) || typeof e.event_id !== 'string') {
      return { ok: false, reason: 'An entry in events.json has no event_id.' };
    }
    event_ids.push(e.event_id);
  }

  const named: SessionId[] = [];
  if (markers && Array.isArray(markers.sessions)) {
    for (const s of markers.sessions) {
      if (isObj(s) && typeof s.session_id === 'string') named.push(s.session_id as SessionId);
    }
  }

  const byId = new Map(sessions.map((s) => [s.session_id as string, s]));
  const present = named.filter((id) => byId.has(id));
  const missing_sessions = named.filter((id) => !byId.has(id));

  // Same roll-up `packageTier` applies at build time: the weakest transcript
  // in the package is what the AI was actually working from. Recomputed here
  // rather than read from the ZIP so a walk transcribed *after* the package
  // was built does not retroactively claim the package carried its words.
  const tiers = present
    .map((id) => byId.get(id)?.transcript_tier)
    .filter((t): t is NonNullable<SessionRecord['transcript_tier']> => t !== null && t !== undefined);

  const record: PackageRecord = {
    package_id: package_id as PackageId,
    generated: generated as ISODate,
    event_ids,
    plant_ids,
    transcript_tier: tiers.length === 0 ? null : tiers.includes('unverified') ? 'unverified' : 'verified',
    verified: present.length > 0 && present.every((id) => byId.get(id)?.coverage?.passed === true),
    session_ids: present,
    sent: null,
    recovered: true,
  };

  return { ok: true, value: { record, missing_sessions } };
}

/**
 * May this reconstructed package be written?
 *
 * The owner's precondition, enforced in code rather than read off the Handoff
 * log — which is the thing that was lying. Two ways it can fail, and both
 * mean stop:
 *
 * - **The id is already there.** Then nothing was lost and this would
 *   overwrite a live record.
 * - **A package that really went out already carries one of these events or
 *   walks.** That is the double-send case: registering this one would claim
 *   the AI saw the same entry twice under two ids, and the second one would
 *   have to be un-sent to undo it.
 *
 * Nothing is checked about *unconfirmed* records, because they consume
 * nothing. An overlap with one of those is expected — a rebuild after the
 * failure would produce exactly that.
 */
export function recoveryBlocker(
  candidate: PackageRecord,
  existing: readonly PackageRecord[],
): string | null {
  if (existing.some((p) => p.package_id === candidate.package_id)) {
    return `${candidate.package_id} is already in the package registry — there is nothing to recover.`;
  }

  const events = new Set(candidate.event_ids);
  const walks = new Set<string>(candidate.session_ids ?? []);

  for (const other of confirmedSent(existing)) {
    const sharedEvent = other.event_ids.find((id) => events.has(id));
    if (sharedEvent) {
      return `${other.package_id} was confirmed sent and already carried entry ${sharedEvent}. `
        + 'Registering this package would send the same entry twice under two ids. '
        + `Un-send ${other.package_id} first if it never really went, or stop here.`;
    }
    const sharedWalk = (other.session_ids ?? []).find((id) => walks.has(id));
    if (sharedWalk) {
      return `${other.package_id} was confirmed sent and already carried walk ${sharedWalk}. `
        + `Registering this package would send that walk twice. Un-send ${other.package_id} first, or stop here.`;
    }
  }

  return null;
}
