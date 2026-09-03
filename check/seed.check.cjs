/**
 * The first-run seed plan, checked against the real SEED_PLANTS.json.
 *
 * Only the pure planner is exercised here — fetching bytes and writing to
 * IndexedDB needs a browser. What this proves is that the plan is right and
 * that it is stable, which is what idempotency actually rests on: every key is
 * derived from the seed file, so a second write lands on the same records.
 */

const fs = require('fs');
const path = require('path');
const { buildSeedPlan } = require('./build/db/seed.js');
const { derive } = require('./build/db/derive.js');

const ROOT = path.join(__dirname, '..');
const file = JSON.parse(fs.readFileSync(path.join(ROOT, 'SEED_PLANTS.json'), 'utf8'));

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) pass++;
  else { fail++; console.log(`FAIL ${name}\n  got  ${a}\n  want ${b}`); }
};

const INSTALL = '2026-09-03';
const opts = { install_date: INSTALL, device_id: 'DEV-TEST' };
const plan = buildSeedPlan(file, opts);

/* ------------------------------------------------------------------- plants */

eq('22 plants', plan.baselines.length, 22);
eq('every plant_id NNN-XXX', plan.baselines.every((b) => /^\d{3}-[A-Z]{3}$/.test(b.plant_id)), true);
eq('plant ids unique', new Set(plan.baselines.map((b) => b.plant_id)).size, 22);
eq('no baseline carries health', plan.baselines.every((b) => !('health' in b)), true);
eq('no baseline carries archived', plan.baselines.every((b) => !('archived' in b)), true);
eq('status_label unset', plan.baselines.every((b) => b.status_label === null), true);
eq('do_next unset', plan.baselines.every((b) => b.do_next === null), true);
eq('origin seed', plan.baselines.every((b) => b.origin === 'seed'), true);
eq('created is install date', plan.baselines.every((b) => b.created === INSTALL), true);

const mon = plan.baselines.find((b) => b.plant_id === '001-MON');
eq('001-MON name', mon.name, 'Large Monstera');
eq('001-MON species', mon.species, 'Monstera deliciosa');
eq('001-MON summer interval', mon.water_interval_days, 7);
eq('001-MON winter interval', mon.water_interval_days_winter, 14);
eq('001-MON acquired kept as MMM YYYY', mon.acquired, 'Feb 2021');
eq('notes_user defaults to empty', plan.baselines.every((b) => typeof b.notes_user === 'string'), true);

const withNotes = plan.baselines.filter((b) => b.notes_user !== '');
eq('the three seeded notes survive', withNotes.length, 3);

/* ----------------------------------------------------------------- planters */

eq('two planters', plan.registry.planters.length, 2);
eq('glass planter shares soil',
   plan.registry.planters.find((p) => p.name === 'Glass Planter').shared_water, true);
eq('star wars planter does not',
   plan.registry.planters.find((p) => p.name === 'Star Wars Decorative Planter').shared_water, false);
eq('six rooms, in collection order', plan.registry.rooms.length, 6);
eq('rooms de-duplicated', new Set(plan.registry.rooms).size, plan.registry.rooms.length);

// The file states planter membership twice, once per direction. They must agree,
// or a group selection would water a plant the planter does not contain.
for (const [name, def] of Object.entries(file.planters)) {
  const fromPlants = plan.baselines.filter((b) => b.planter === name).map((b) => b.plant_id);
  eq(`membership agrees: ${name}`, fromPlants, def.members);
}

/* ------------------------------------------------------------------- photos */

const photoEvents = plan.events.filter((e) => e.type === 'Photo');
const heroEvents = plan.events.filter((e) => e.type === 'Edit');

eq('26 photos: 22 mains + 4 extras', plan.photos.length, 26);
eq('one photo event each', photoEvents.length, 26);
eq('48 events: 26 photos + 22 hero choices', plan.events.length, 48);
eq('all events source seed', plan.events.every((e) => e.source === 'seed'), true);
eq('mains labelled whole',
   plan.photos.slice(0, 22).every((p) => JSON.stringify(p.labels) === '["whole"]'), true);
eq('nothing pending', plan.events.every((e) => e.pending === 0), true);
eq('media ids unique', new Set(plan.photos.map((p) => p.media_id)).size, 26);
eq('event ids unique', new Set(plan.events.map((e) => e.event_id)).size, 48);
eq('media ids follow the app convention',
   plan.photos.every((p) => /^\d{3}-[A-Z]{3}_\d{4}-\d{2}-\d{2}_\d{4}_\d{2}\.jpg$/.test(p.media_id)), true);
eq('every photo event names exactly one media',
   photoEvents.every((e) => e.media.length === 1 && e.media_labels.length === 1), true);

const monPhoto = plan.photos.find((p) => p.plant_id === '001-MON');
// Dated to the install day, not to `acquired` — otherwise `last_checked` reads
// "Feb 2021" on a brand new install.
eq('photo dated to install day', monPhoto.date, INSTALL);
eq('every photo dated to install day', plan.photos.every((p) => p.date === INSTALL), true);
eq('media id built from that date', monPhoto.media_id, `001-MON_${INSTALL}_0000_01.jpg`);
eq('event id derived from the plant', monPhoto.event_id, 'EV-SEED-001-MON-01');

/* --- hero --- */

eq('one hero choice per plant', heroEvents.length, 22);
eq('hero events target hero_media', heroEvents.every((e) => e.field === 'hero_media'), true);
eq('hero events name no media of their own', heroEvents.every((e) => !e.media), true);
eq("every hero points at that plant's own portrait",
   heroEvents.every((e) => e.to === `${e.plant_id}_${INSTALL}_0000_01.jpg`), true);
eq('hero event ids deterministic',
   heroEvents.find((e) => e.plant_id === '001-MON').event_id, 'EV-SEED-001-MON-HERO');
eq('hero lands after the photo it names',
   heroEvents.every((e) => e.time === '00:02'), true);
// A group frame is never anyone's hero: only the `_01` portraits are chosen.
eq('no group frame becomes a hero',
   heroEvents.every((e) => !e.to.endsWith('_02.jpg')), true);

// Every source file the plan names must actually be on disk.
const onDisk = plan.photos.filter((p) => fs.existsSync(path.join(ROOT, p.source_file)));
eq('all 26 source files exist', onDisk.length, 26);

/* --- the extras --- */

const extras = plan.photos.slice(22);
eq('extras attached to the named plants', extras.map((p) => p.plant_id),
   ['016-SYN', '010-PRY', '017-PTH', '019-SNK']);
eq('leaf extras keep their label', extras.slice(0, 2).map((p) => JSON.stringify(p.labels)),
   ['["leaf"]', '["leaf"]']);
eq('group frames flagged', extras.map((p) => p.shared_frame), [false, false, true, true]);
eq('single-plant frames not flagged',
   plan.photos.slice(0, 22).every((p) => p.shared_frame === false), true);
eq('a plant with two photos numbers them 01 then 02',
   plan.photos.filter((p) => p.plant_id === '017-PTH').map((p) => p.media_id.slice(-6)),
   ['01.jpg', '02.jpg']);
eq('main sorts before extra',
   photoEvents.filter((e) => e.plant_id === '017-PTH').map((e) => e.time), ['00:00', '00:01']);

/* -------------------------------------------------------------- idempotency */

const again = buildSeedPlan(file, opts);
eq('running the planner twice is byte-identical',
   JSON.stringify(again) === JSON.stringify(plan), true);

// The keys are what idempotency actually turns on: a second write must land on
// the same records. Same ids from a fresh call means `put` overwrites.
eq('same media ids second time',
   again.photos.map((p) => p.media_id), plan.photos.map((p) => p.media_id));
eq('same event ids second time',
   again.events.map((e) => e.event_id), plan.events.map((e) => e.event_id));

// Ids must not drift with the install date either — a device seeded a week
// later must produce the same event ids, or the union in section 8 would give
// every plant two seed photos.
const later = buildSeedPlan(file, { install_date: '2026-09-10', device_id: 'DEV-OTHER' });
eq('event ids independent of install date',
   later.events.map((e) => e.event_id), plan.events.map((e) => e.event_id));
// Media ids do move with the install date, because that is now the date in the
// filename. Only `event_id` is the merge key in section 8, so the union still
// collapses two independent seeds into one set of events.

// And the real test of it: seeding twice, as the store would see it after a
// second write, changes nothing about what the app shows.
const once = derive({
  baselines: plan.baselines, events: plan.events,
  registry: plan.registry, as_of: INSTALL, include_pending: false,
});
const twice = derive({
  baselines: [...plan.baselines, ...again.baselines],
  events: [...plan.events, ...again.events],
  registry: plan.registry, as_of: INSTALL, include_pending: false,
});
eq('seeding twice derives the same state', JSON.stringify(twice), JSON.stringify(once));
eq('still 22 active after a double seed', twice.collection.active_count, 22);
eq('017-PTH still has two photos', twice.plants['017-PTH'].photos.length, 2);
eq('no orphan events', once.orphan_event_ids, []);

/* ------------------------------------------------------- day one, as derived */

eq('nothing rated', once.collection.rated_count, 0);
eq('no collection average', once.collection.average_health, null);
eq('needs attention empty on day one', once.collection.needs_attention, []);
eq('every plant unrated and unwatered',
   once.order.every((id) => {
     const p = once.plants[id];
     return p.health.current === null && p.adherence.last_water === null;
   }), true);
eq('every plant has a hero on day one',
   once.order.every((id) => once.plants[id].hero !== null), true);
eq("the hero is the plant's own portrait",
   once.plants['001-MON'].hero, `001-MON_${INSTALL}_0000_01.jpg`);
eq('last_checked reads today, not the acquisition date',
   once.order.every((id) => once.plants[id].last_checked === INSTALL), true);
eq('shared soil flag reaches derived state', once.plants['015-PTH'].planter_shared_water, true);
eq('decorative planter does not', once.plants['019-SNK'].planter_shared_water, false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
