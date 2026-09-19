/**
 * The update-file validator — `package/validate.ts`.
 *
 * **This file had no checks at all until 2026-09-18**, which is remarkable in
 * hindsight: it is the boundary every AI-proposed change crosses, and the one
 * place a bad file is supposed to stop. It is added here alongside the
 * contract text limits rather than left for later, because those limits ARE
 * the validator now.
 *
 * Scope is the value rules — the text lengths agreed with the owner and the
 * reviewing AI, and the reason cap. The referential rules (package identity,
 * archived plants, field permissions) are exercised through real use and are
 * not re-tested here.
 *
 * Run with `npm run check:validate`.
 */

const { validateUpdateFile } = require('./build/package/validate.js');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; }
  else { fail++; console.log(`FAIL ${name}\n  got  ${a}\n  want ${b}`); }
};
const ok = (name, cond) => eq(name, !!cond, true);

/* --------------------------------------------------------------- fixture -- */

const PKG = 'PKG-2026-09-18-1';

const plant = (plant_id, over = {}) => ({
  plant_id,
  name: plant_id,
  species: 'Testus plantus',
  light: null, soil: null, feed: null,
  environment: null, repotting: null, pruning: null,
  pests: null, season: null, propagation: null,
  status_label: null, do_next: null,
  water_interval_days: 7, water_interval_days_winter: 14,
  notes_user: '',
  archived: false,
  care_instructions: [],
  health: { current: null, source: null, confirmed: null, changed: null, stale: false },
  ...over,
});

const ctx = {
  state: { order: ['001-MON', '002-SNK'], plants: { '001-MON': plant('001-MON'), '002-SNK': plant('002-SNK') } },
  packages: [{ package_id: PKG, generated: '2026-09-18', event_ids: [], plant_ids: ['001-MON', '002-SNK'], transcript_tier: null, verified: false, session_ids: [] }],
  appliedUpdates: [],
  events: [],
};

/** A whole file with one change in it, everything else valid. */
const file = (change) => ({
  package_id: PKG,
  generated: '2026-09-18',
  changes: [change],
  unaddressed: ['002-SNK'],
});

const check = (change) => validateUpdateFile(file(change), ctx);
const row = (field, value, reason = 'A specific reason about this plant.') =>
  ({ plant_id: '001-MON', field, value, reason });

/* --------------------------------------------------- a sound file passes -- */

{
  const r = check(row('light', 'Bright indirect light'));
  ok('a sound change is accepted', r.ok);
  eq('and produces one reviewable row', r.ok && r.rows.length, 1);
  eq('carrying its reason', r.ok && r.rows[0].reason, 'A specific reason about this plant.');
}

/* ----------------------------------------- the agreed contract lengths ---- */

/**
 * The figures settled on 2026-09-18. They formalise observed behaviour: in the
 * first real review every applied value fell inside its limit, the longest at
 * about two thirds. A limit nobody has hit is cheap to keep.
 */
{
  const LIMITS = {
    species: 80, light: 80, soil: 80, feed: 120,
    environment: 200, repotting: 200, pruning: 200,
    pests: 200, season: 200, propagation: 200,
    do_next: 160,
  };

  for (const [field, max] of Object.entries(LIMITS)) {
    ok(`${field} accepts exactly ${max}`, check(row(field, 'x'.repeat(max))).ok);
    const over = check(row(field, 'x'.repeat(max + 1)));
    ok(`${field} refuses ${max + 1}`, !over.ok);
    ok(`${field}'s rejection names the limit`,
      !over.ok && over.reason.includes(String(max)));
  }
}

/**
 * do_next is the one that mattered most: LIVE TRUTH, shown prominently, and
 * documented at 160 while the importer accepted any length at all. That gap is
 * what the limits close.
 */
{
  const over = check(row('do_next', 'x'.repeat(400)));
  ok('a 400-character care focus is refused', !over.ok);
  ok('and the whole file is rejected, never partially applied',
    !over.ok && over.rows === undefined);
}

/* ------------------------------------------------------- the reason cap --- */

/**
 * The reason becomes the entry's note when the row is applied, and a note is
 * capped at 400. Refused rather than truncated: half a reason is worse than a
 * rejected file, because nobody can tell it is half.
 */
{
  ok('a 400-character reason is accepted',
    check(row('light', 'Bright indirect', 'y'.repeat(400))).ok);
  const over = check(row('light', 'Bright indirect', 'y'.repeat(401)));
  ok('a 401-character reason is refused', !over.ok);
  ok('and says so', !over.ok && over.reason.toLowerCase().includes('reason'));
}

{
  // Unchanged behaviour, re-pinned because the new checks sit beside it.
  ok('an empty reason is still refused', !check(row('light', 'Bright', '   ')).ok);
  ok('care instructions keep their own 200 limit',
    !validateUpdateFile(file({
      plant_id: '001-MON', field: 'care_instructions', op: 'add',
      value: 'z'.repeat(201), reason: 'Adding an instruction.',
    }), ctx).ok);
  ok('and accept 200 exactly',
    validateUpdateFile(file({
      plant_id: '001-MON', field: 'care_instructions', op: 'add',
      value: 'z'.repeat(200), reason: 'Adding an instruction.',
    }), ctx).ok);
}

/* ----------------------------- limits apply only where they are declared -- */

{
  // An interval is a number; the text map must not reach it.
  ok('a valid interval is unaffected by the text limits',
    check(row('water_interval_days', 9)).ok);
  ok('and its own range still holds', !check(row('water_interval_days', 61)).ok);

  // Clearing a field is not a length violation.
  ok('null clears a field without tripping a limit', check(row('light', null)).ok);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
