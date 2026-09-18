const { derive } = require('./build/db/derive.js');
const D = require('./build/lib/dates.js');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; }
  else { fail++; console.log(`FAIL ${name}\n  got  ${a}\n  want ${b}`); }
};

/* ---------------- dates ---------------- */

eq('roundtrip 2026-09-02', D.fromDay(D.toDay('2026-09-02')), '2026-09-02');
eq('epoch', D.toDay('1970-01-01'), 0);
eq('leap day', D.fromDay(D.toDay('2024-02-29')), '2024-02-29');
eq('addDays year end', D.addDays('2026-12-30', 5), '2027-01-04');
eq('addDays leap', D.addDays('2024-02-28', 1), '2024-02-29');
eq('addDays back', D.addDays('2026-03-01', -1), '2026-02-28');
eq('daysBetween', D.daysBetween('2026-06-28', '2026-08-14'), 47);
eq('season mar', D.seasonOf('2026-03-01'), 'summer');
eq('season oct', D.seasonOf('2026-10-31'), 'summer');
eq('season nov', D.seasonOf('2026-11-01'), 'winter');
eq('season feb', D.seasonOf('2026-02-28'), 'winter');
eq('elapsed d', D.formatElapsed(6), '6d');
eq('elapsed wk', D.formatElapsed(49), '7wk');
eq('elapsed mo', D.formatElapsed(122), '4mo');
eq('fmt MMM DD', D.formatDayMonth('2026-08-14'), 'Aug 14');
eq('fmt archived', D.formatDayMonthYear('2025-11-03'), 'Nov 03 2025');
// The DST trap: every one of these must stay on its own calendar day.
let dstOk = true;
for (const d of ['2026-03-07','2026-03-08','2026-03-09','2026-11-01','2026-11-02']) {
  if (D.fromDay(D.toDay(d)) !== d) dstOk = false;
}
eq('DST-proof roundtrip', dstOk, true);

/* ---------------- fixtures ---------------- */

const base = (id, over = {}) => ({
  plant_id: id, name: id, species: 'Testus plantus', acquired: 'Feb 2021',
  room: 'Living room, by the window', pot: '9" pot', planter: null,
  water_interval_days: 7, water_interval_days_winter: 14,
  feed: null, light: null, soil: null, notes_user: '',
  status_label: null, do_next: null,
  created: '2026-01-01', created_by: 'DEV-A', origin: 'seed', ...over,
});

let n = 0;
const ev = (o) => ({
  event_id: o.event_id ?? `EV-${String(++n).padStart(4, '0')}`,
  plant_id: o.plant_id ?? '001-MON', date: o.date, time: o.time ?? '10:00',
  source: o.source ?? 'user', device_id: o.device_id ?? 'DEV-A',
  pending: o.pending ?? 0, ...o,
});

const registry = {
  rooms: ['Living room, by the window'],
  planters: [
    { name: 'Glass Planter', shared_water: true },
    { name: 'Star Wars Decorative Planter', shared_water: false },
  ],
  updated: '2026-01-01',
};

const run = (baselines, events, as_of, include_pending = false) =>
  derive({ baselines, events, registry, as_of, include_pending });

/* ---------------- health ---------------- */

{
  const s = run([base('001-MON')], [], '2026-09-02');
  const h = s.plants['001-MON'].health;
  eq('unrated current', h.current, null);
  eq('unrated stale', h.stale, false);
  eq('unrated in attention', s.plants['001-MON'].attention.includes('unrated'), true);
  eq('unrated not needs-attention', s.collection.needs_attention, []);
  eq('average null', s.collection.average_health, null);
}

{
  // The spec's own example: 5 -> 7 -> 7. Confirming refreshes, does not move.
  const s = run([base('001-MON')], [
    ev({ type: 'Rate', date: '2026-05-01', to: 5 }),
    ev({ type: 'Rate', date: '2026-06-02', to: 7 }),
    ev({ type: 'Rate', date: '2026-08-14', to: 7 }),
  ], '2026-09-02');
  const h = s.plants['001-MON'].health;
  eq('health current', h.current, 7);
  eq('health confirmed', h.confirmed, '2026-08-14');
  eq('health changed', h.changed, '2026-06-02');
  eq('health source', h.source, 'Me');
  eq('health previous value', h.previous.value, 7);
  eq('health previous date', h.previous.date, '2026-06-02');
  eq('health delta', h.delta, 0);
  eq('health elapsed', h.elapsed_days, 73);
  eq('health stale', h.stale, false);
  eq('score line 3', `${h.delta >= 0 ? '+' : ''}${h.delta} · ${D.formatElapsed(h.elapsed_days)}`, '+0 · 2mo');
  // The spec's own worked example: 6.9 on Jun 28 -> +0.5 · 7wk on Aug 14.
  eq('spec example elapsed', D.formatElapsed(D.daysBetween('2026-06-28', '2026-08-14')), '7wk');
}

{
  const s = run([base('001-MON')], [
    ev({ type: 'Rate', date: '2026-05-01', to: 6, source: 'ai' }),
  ], '2026-09-02');
  const h = s.plants['001-MON'].health;
  eq('single rate changed = confirmed', h.changed, h.confirmed);
  eq('single rate previous', h.previous, null);
  eq('single rate delta', h.delta, null);
  eq('AI source tag', h.source, 'AI');
  eq('stale after 124d', h.stale, true);
  eq('stale in attention', s.plants['001-MON'].attention.includes('health_stale'), true);
  eq('stale reaches needs-attention', s.collection.needs_attention, ['001-MON']);
}

{
  // Two devices, same minute, different ratings — the one real conflict.
  const s = run([base('001-MON')], [
    ev({ event_id: 'EV-A', type: 'Rate', date: '2026-08-14', time: '09:30', to: 7, device_id: 'DEV-A' }),
    ev({ event_id: 'EV-B', type: 'Rate', date: '2026-08-14', time: '09:30', to: 5, device_id: 'DEV-B' }),
  ], '2026-09-02');
  const h = s.plants['001-MON'].health;
  eq('conflict surfaced', h.conflict !== null, true);
  eq('conflict kept', h.conflict.kept.device_id, 'DEV-B');
  eq('conflict other', h.conflict.other.device_id, 'DEV-A');
}

/* ---------------- adherence ---------------- */

{
  // Four waterings exactly 7 days apart, then 2 days past due.
  const s = run([base('001-MON')], [
    ev({ type: 'Water', date: '2026-08-01' }),
    ev({ type: 'Water', date: '2026-08-08' }),
    ev({ type: 'Water', date: '2026-08-15' }),
    ev({ type: 'Water', date: '2026-08-22' }),
  ], '2026-08-31');
  const a = s.plants['001-MON'].adherence;
  eq('care_count', a.care_count, 3);
  eq('on_time_count', a.on_time_count, 3);
  eq('avg_days_late when none late', a.avg_days_late, null);
  eq('last_water', a.last_water, '2026-08-22');
  eq('next_due', a.next_due, '2026-08-29');
  eq('days_past', a.days_past, 2);
  eq('slip', a.state, 'slip');
  eq('slip stays off needs-attention', s.collection.needs_attention, []);
}

{
  const s = run([base('001-MON')], [
    ev({ type: 'Water', date: '2026-08-01' }),
    ev({ type: 'Water', date: '2026-08-08' }),
  ], '2026-08-20');
  const a = s.plants['001-MON'].adherence;
  eq('behind', a.state, 'behind');
  eq('behind days_past', a.days_past, 5);
  eq('behind reaches needs-attention', s.collection.needs_attention, ['001-MON']);
}

{
  // "on time 4 of 6 · average 2 days late" — averaged over the late ones only.
  const s = run([base('001-MON')], [
    ev({ type: 'Water', date: '2026-06-01' }),
    ev({ type: 'Water', date: '2026-06-08' }),  // on time
    ev({ type: 'Water', date: '2026-06-15' }),  // on time
    ev({ type: 'Water', date: '2026-06-24' }),  // 2 late
    ev({ type: 'Water', date: '2026-07-01' }),  // on time
    ev({ type: 'Water', date: '2026-07-08' }),  // on time
    ev({ type: 'Water', date: '2026-07-17' }),  // 2 late
  ], '2026-07-20');
  const a = s.plants['001-MON'].adherence;
  eq('mixed care_count', a.care_count, 6);
  eq('mixed on_time', a.on_time_count, 4);
  eq('avg over late only', a.avg_days_late, 2);
  eq('adherence copy', `on time ${a.on_time_count} of ${a.care_count} waterings · average ${a.avg_days_late} days late`,
     'on time 4 of 6 waterings · average 2 days late');
}

{
  // Season: watered Oct 28 on the summer figure, next cycle runs on winter.
  const s = run([base('001-MON')], [
    ev({ type: 'Water', date: '2026-10-28' }),
    ev({ type: 'Water', date: '2026-11-10' }),
  ], '2026-11-15');
  const a = s.plants['001-MON'].adherence;
  eq('summer interval governed the Oct cycle', a.intervals[0].interval_days, 7);
  eq('Oct cycle season', a.intervals[0].season, 'summer');
  eq('Oct cycle late by', a.intervals[0].days_late, 6);
  eq('current cycle is winter', a.season, 'winter');
  eq('winter interval', a.interval_days, 14);
  eq('winter next_due', a.next_due, '2026-11-24');
  eq('winter state', a.state, 'on');
}

{
  // Retune the schedule mid-history: past waterings keep being judged against
  // the interval that was in force then.
  const s = run([base('001-MON')], [
    ev({ type: 'Water', date: '2026-03-01' }),
    ev({ type: 'Water', date: '2026-03-08' }),
    ev({ type: 'Edit', date: '2026-03-10', field: 'water_interval_days', from: '7', to: '10' }),
    ev({ type: 'Water', date: '2026-03-20' }),
    ev({ type: 'Water', date: '2026-03-31' }),
  ], '2026-04-01');
  const a = s.plants['001-MON'].adherence;
  eq('pre-change interval', a.intervals[1].interval_days, 7);
  eq('pre-change late', a.intervals[1].days_late, 5);
  eq('post-change interval', a.intervals[2].interval_days, 10);
  eq('post-change late', a.intervals[2].days_late, 1);
  eq('current interval', a.interval_days, 10);
  eq('field value now', s.plants['001-MON'].water_interval_days, 10);
  eq('provenance', s.plants['001-MON'].last_set_by.water_interval_days.date, '2026-03-10');
}

{
  const s = run([base('001-MON')], [], '2026-09-02');
  const a = s.plants['001-MON'].adherence;
  eq('never watered state', a.state, 'on');
  eq('never watered next_due', a.next_due, null);
  eq('never_watered flagged', a.last_water, null);
  eq('never watered off the list', s.collection.needs_attention, []);
}

/* ---------------- archive ---------------- */

{
  const s = run([base('001-MON'), base('002-SNK')], [
    ev({ type: 'Rate', plant_id: '001-MON', date: '2026-08-01', to: 8 }),
    ev({ type: 'Rate', plant_id: '002-SNK', date: '2026-08-02', to: 4 }),
    ev({ type: 'Archive', plant_id: '002-SNK', date: '2026-08-20', note: 'Died — root rot' }),
    ev({ type: 'Archive', plant_id: '002-SNK', date: '2026-08-25', note: 'duplicate from other device' }),
  ], '2026-09-02');
  const p = s.plants['002-SNK'];
  eq('archived', p.archived, true);
  eq('archived_date first wins', p.archived_date, '2026-08-20');
  eq('archived_reason', p.archived_reason, 'Died — root rot');
  eq('archived has no attention', p.attention, []);
  eq('active_count excludes archived', s.collection.active_count, 1);
  eq('order puts archived last', s.order, ['001-MON', '002-SNK']);
  eq('average excludes archived', s.collection.average_health, 8);
}

/* ---------------- collection average ---------------- */

{
  const s = run([base('001-MON'), base('002-SNK'), base('003-SNK')], [
    ev({ type: 'Rate', plant_id: '001-MON', date: '2026-06-28', to: 7 }),
    ev({ type: 'Rate', plant_id: '002-SNK', date: '2026-06-28', time: '11:00', to: 7 }),
    ev({ type: 'Rate', plant_id: '003-SNK', date: '2026-08-14', to: 8 }),
  ], '2026-09-02');
  eq('collection average', s.collection.average_health, 7.3);
  eq('collection previous', s.collection.average_previous, { value: 7, date: '2026-06-28' });
  eq('rated_count', s.collection.rated_count, 3);

  // The previous average is dated when it was reached, not when it was last
  // still true — otherwise the elapsed time beside it collapses to nothing.
  const s2 = run([base('001-MON'), base('002-SNK')], [
    ev({ type: 'Rate', plant_id: '001-MON', date: '2026-06-28', to: 7 }),
    ev({ type: 'Rate', plant_id: '001-MON', date: '2026-08-14', to: 7 }),
    ev({ type: 'Rate', plant_id: '002-SNK', date: '2026-08-14', time: '11:00', to: 5 }),
  ], '2026-09-02');
  eq('previous average dated when reached', s2.collection.average_previous,
     { value: 7, date: '2026-06-28' });
  eq('current average', s2.collection.average_health, 6);

  // Rating the whole collection in one sitting is not movement. The running
  // average passes through a value per plant on the way, but none of those is
  // a state the collection rested in — and a previous value dated today makes
  // the score block report a delta over zero elapsed days, which is exactly
  // the misleading movement section 3b's elapsed-time rule exists to prevent.
  // The owner met this as "6.2, was 6.1, 0d" after entering 22 ratings.
  const sameDay = run([base('001-MON'), base('002-SNK'), base('003-SNK')], [
    ev({ type: 'Rate', plant_id: '001-MON', date: '2026-08-28', time: '09:00', to: 5 }),
    ev({ type: 'Rate', plant_id: '002-SNK', date: '2026-08-28', time: '09:05', to: 7 }),
    ev({ type: 'Rate', plant_id: '003-SNK', date: '2026-08-28', time: '09:10', to: 9 }),
  ], '2026-08-28');
  eq('rating everything in one day averages once', sameDay.collection.average_health, 7);
  eq('and reports no previous, because there is no earlier day',
     sameDay.collection.average_previous, null);

  // A second day gives it something to move against, and the elapsed time is
  // then real.
  const nextDay = run([base('001-MON'), base('002-SNK')], [
    ev({ type: 'Rate', plant_id: '001-MON', date: '2026-08-28', time: '09:00', to: 5 }),
    ev({ type: 'Rate', plant_id: '002-SNK', date: '2026-08-28', time: '09:05', to: 7 }),
    ev({ type: 'Rate', plant_id: '001-MON', date: '2026-09-04', time: '09:00', to: 9 }),
  ], '2026-09-04');
  eq('a later day moves it', nextDay.collection.average_health, 8);
  eq('against the previous day, not a step within one',
     nextDay.collection.average_previous, { value: 6, date: '2026-08-28' });
}

/* ---------------- care instructions ---------------- */

{
  const s = run([base('001-MON')], [
    ev({ type: 'Edit', date: '2026-08-12', field: 'care_instructions', from: null,
         to: 'Feed monthly at half strength', source: 'ai', op: 'add',
         instruction_id: 'INS-2026-08-12-1', package_id: 'PKG-2026-08-12-1' }),
    ev({ type: 'Edit', date: '2026-08-13', field: 'care_instructions', from: null,
         to: 'Mine: rotate a quarter turn weekly', op: 'add',
         instruction_id: 'INS-2026-08-13-1' }),
    ev({ type: 'Edit', date: '2026-09-01', field: 'care_instructions', from: null,
         to: 'Feed fortnightly at half strength', source: 'ai', op: 'replace',
         instruction_id: 'INS-2026-09-01-1', replaces: 'INS-2026-08-12-1' }),
  ], '2026-09-02');
  const ci = s.plants['001-MON'].care_instructions;
  eq('instruction count after replace', ci.length, 2);
  eq('user item survives', ci[0].instruction_id, 'INS-2026-08-13-1');
  eq('user item marked mine', ci[0].source, 'user');
  eq('replacement text', ci[1].text, 'Feed fortnightly at half strength');
  eq('replacement names what it superseded', ci[1].replaces, 'INS-2026-08-12-1');
  eq('ai item marked ai', ci[1].source, 'ai');
  eq('replace with no package cites none', ci[1].package_id, null);

  const s2 = run([base('001-MON')], [
    ev({ type: 'Edit', date: '2026-08-12', field: 'care_instructions', from: null,
         to: 'x', op: 'add', instruction_id: 'INS-2026-08-12-1' }),
    ev({ type: 'Edit', date: '2026-08-20', field: 'care_instructions', from: 'x', to: null,
         op: 'delete', instruction_id: 'INS-2026-08-12-1' }),
  ], '2026-09-02');
  eq('user delete removes the item', s2.plants['001-MON'].care_instructions.length, 0);
}

/* ---------------- notes lanes ---------------- */

{
  const s = run([base('001-MON')], [
    ev({ type: 'Edit', date: '2026-08-01', field: 'notes_user', from: '',
         to: 'west window burns the leaves after 2pm' }),
    ev({ type: 'Edit', plant_id: null, date: '2026-08-02', field: 'collection_notes_user',
         from: '', to: 'feed everything the first Saturday of the month' }),
  ], '2026-09-02');
  eq('notes_user', s.plants['001-MON'].notes_user, 'west window burns the leaves after 2pm');
  eq('collection notes', s.collection.notes_user, 'feed everything the first Saturday of the month');
}

/* ---------------- pending / Update ---------------- */

{
  const events = [
    ev({ type: 'Water', date: '2026-08-01' }),
    ev({ type: 'Water', date: '2026-08-25', pending: 1, source: 'round' }),
    ev({ type: 'Rate', date: '2026-08-25', to: 9, pending: 1 }),
  ];
  const committed = run([base('001-MON')], events, '2026-08-26', false);
  const preview = run([base('001-MON')], events, '2026-08-26', true);

  eq('committed ignores pending water', committed.plants['001-MON'].adherence.last_water, '2026-08-01');
  eq('committed state', committed.plants['001-MON'].adherence.state, 'behind');
  eq('preview folds it in', preview.plants['001-MON'].adherence.last_water, '2026-08-25');
  eq('preview state', preview.plants['001-MON'].adherence.state, 'on');
  eq('pending count visible either way', committed.pending_count, 2);
  eq('pending ids on the plant', committed.plants['001-MON'].pending_event_ids.length, 2);
  // Ratings are never touched by Update.
  eq('pending rating applies immediately', committed.plants['001-MON'].health.current, 9);
}

/* ---------------- planters, orphans, calendars ---------------- */

{
  const s = run([
    base('015-PTH', { planter: 'Glass Planter' }),
    base('019-SNK', { planter: 'Star Wars Decorative Planter' }),
    base('001-MON'),
  ], [
    ev({ type: 'Water', plant_id: '015-PTH', date: '2026-08-20' }),
    ev({ type: 'Water', plant_id: '019-SNK', date: '2026-08-20' }),
    ev({ type: 'Water', plant_id: '001-MON', date: '2026-08-20' }),
    ev({ type: 'Water', plant_id: '099-XXX', date: '2026-08-20' }),
  ], '2026-08-22');
  eq('shared soil', s.plants['015-PTH'].planter_shared_water, true);
  eq('decorative planter', s.plants['019-SNK'].planter_shared_water, false);
  eq('own pot', s.plants['001-MON'].planter_shared_water, false);
  eq('orphan reported not dropped', s.orphan_event_ids.length, 1);
  eq('forward calendar groups by due date', s.calendar_forward,
     [{ date: '2026-08-27', plants: ['001-MON', '015-PTH', '019-SNK'] }]);
  eq('backward calendar', s.calendar_backward.length, 1);
}

/* ---------------- determinism ---------------- */

{
  const baselines = [base('001-MON'), base('002-SNK')];
  const events = [
    ev({ type: 'Water', plant_id: '001-MON', date: '2026-08-01' }),
    ev({ type: 'Rate', plant_id: '001-MON', date: '2026-08-05', to: 7 }),
    ev({ type: 'Edit', plant_id: '001-MON', date: '2026-08-06', field: 'water_interval_days', from: '7', to: '9' }),
    ev({ type: 'Water', plant_id: '001-MON', date: '2026-08-12' }),
    ev({ type: 'Rate', plant_id: '002-SNK', date: '2026-08-14', to: 5 }),
    ev({ type: 'Archive', plant_id: '002-SNK', date: '2026-08-20', note: 'Rehomed to Sam' }),
    ev({ type: 'Water', plant_id: '001-MON', date: '2026-08-22' }),
  ];
  const straight = JSON.stringify(run(baselines, events, '2026-09-02'));
  let same = true;
  for (let i = 0; i < 200; i++) {
    const shuffled = [...events];
    for (let j = shuffled.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
    }
    if (JSON.stringify(run(baselines, shuffled, '2026-09-02')) !== straight) { same = false; break; }
  }
  eq('order of arrival cannot change the result', same, true);

  // Duplicate delivery — the same event arriving twice from two devices.
  const dupes = JSON.stringify(run(baselines, [...events, ...events], '2026-09-02'));
  eq('union by event_id is idempotent', dupes === straight, true);
}

/* ---------------- malformed input ---------------- */

{
  const s = run([base('001-MON')], [
    ev({ type: 'Edit', date: '2026-08-01', field: 'water_interval_days', from: '7', to: '6px' }),
    ev({ type: 'Edit', date: '2026-08-02', field: 'water_interval_days', from: '7', to: '' }),
  ], '2026-09-02');
  eq('malformed value leaves the field alone', s.plants['001-MON'].water_interval_days, 7);
}

/* ---------------- Void: taken back, not deleted ---------------- */

/**
 * The safety net that replaced the pending step (2026-09-18). A mis-tapped
 * watering can be taken back from the screen that wrote it — as an entry, not
 * as a deletion, so it merges like anything else and history still shows both.
 */
{
  const watered = ev({ type: 'Water', date: '2026-09-10' });
  const voided = ev({ type: 'Void', date: '2026-09-10', voids: watered.event_id });

  const kept = run([base('001-MON')], [watered], '2026-09-12');
  eq('a watering counts', kept.plants['001-MON'].adherence.last_water, '2026-09-10');

  const undone = run([base('001-MON')], [watered, voided], '2026-09-12');
  eq('and stops counting once it is taken back',
    undone.plants['001-MON'].adherence.last_water, null);

  // Order must not matter: the fold collects Voids in a first pass rather than
  // unwinding an effect already applied, which is the patching rule 10 forbids.
  const reversed = run([base('001-MON')], [voided, watered], '2026-09-12');
  eq('the order the two arrive in makes no difference',
    reversed.plants['001-MON'].adherence.last_water, null);

  // A Void naming something that is not there must do nothing at all rather
  // than throw or silently swallow a neighbouring entry.
  const orphan = ev({ type: 'Void', date: '2026-09-11', voids: 'EV-NOT-A-THING' });
  const withOrphan = run([base('001-MON')], [watered, orphan], '2026-09-12');
  eq('a Void pointing at nothing changes nothing',
    withOrphan.plants['001-MON'].adherence.last_water, '2026-09-10');

  // It takes back exactly what it names.
  const other = ev({ type: 'Water', plant_id: '002-SNK', date: '2026-09-10' });
  const two = run([base('001-MON'), base('002-SNK')], [watered, other, voided], '2026-09-12');
  eq('the other plant keeps its watering',
    two.plants['002-SNK'].adherence.last_water, '2026-09-10');

  // A Rate reaches the committed view immediately, so a Void of one must too.
  const rated = ev({ type: 'Rate', date: '2026-09-10', to: 8 });
  const unrated = run([base('001-MON')],
    [rated, ev({ type: 'Void', date: '2026-09-10', voids: rated.event_id })], '2026-09-12');
  eq('a rating can be taken back as well', unrated.plants['001-MON'].health.current, null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
