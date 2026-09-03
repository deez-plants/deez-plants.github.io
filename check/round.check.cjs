/**
 * Three plants, a watering round against two of them, state recomputed either
 * side of the Update commit.
 *
 * Prints rather than asserts: the point is to read the numbers and check they
 * say what the spec says they should. Run with `npm run check:round`.
 */

const { derive } = require('./build/db/derive.js');
const { formatDayMonth, formatElapsed } = require('./build/lib/dates.js');

const TODAY = '2026-08-20';

/* ---------------------------------------------------------------- fixtures */

const plant = (plant_id, name, species, water, winter, over = {}) => ({
  plant_id, name, species,
  acquired: 'Mar 2024',
  room: 'Living room, by the window',
  pot: '9" pot',
  planter: null,
  water_interval_days: water,
  water_interval_days_winter: winter,
  feed: 'Every 2–4 weeks, active season',
  light: null, soil: null,
  notes_user: '', status_label: null, do_next: null,
  created: '2026-06-01', created_by: 'DEV-PHONE', origin: 'seed',
  ...over,
});

const baselines = [
  plant('001-MON', 'Large Monstera', 'Monstera deliciosa', 7, 14),
  plant('002-SNK', 'Large Snake Plant', 'Dracaena trifasciata', 21, 35),
  plant('006-FER', 'Kitchen Fern', 'Nephrolepis exaltata', 4, 7),
];

let seq = 0;
const ev = (o) => ({
  event_id: `EV-${String(++seq).padStart(4, '0')}`,
  time: '09:00', source: 'user', device_id: 'DEV-PHONE', pending: 0, ...o,
});

const water = (plant_id, date) => ev({ type: 'Water', plant_id, date });
const rate = (plant_id, date, to) => ev({ type: 'Rate', plant_id, date, to });

const history = [
  // Monstera on a 7-day interval, kept to it apart from one slip in July.
  water('001-MON', '2026-07-04'),
  water('001-MON', '2026-07-11'),
  water('001-MON', '2026-07-20'),
  water('001-MON', '2026-07-27'),
  water('001-MON', '2026-08-03'),
  // Snake plant on 21 days, twice.
  water('002-SNK', '2026-07-04'),
  water('002-SNK', '2026-07-25'),
  // Fern on 4 days, thirsty and slipping.
  water('006-FER', '2026-08-01'),
  water('006-FER', '2026-08-05'),
  water('006-FER', '2026-08-09'),
  // Ratings. The Aug 14 monstera rating repeats the June value: a confirmation.
  rate('001-MON', '2026-06-28', 7),
  rate('001-MON', '2026-08-14', 7),
  rate('006-FER', '2026-08-14', 5),
];

// The round: Water picked, two plants selected, logged. One event per plant,
// `source: round`, both pending until Update.
const round = ['001-MON', '006-FER'].map((plant_id) =>
  ev({ type: 'Water', plant_id, date: TODAY, time: '11:20', source: 'round', pending: 1 }),
);

const registry = {
  rooms: ['Living room, by the window'],
  planters: [],
  updated: '2026-06-01',
};

const events = [...history, ...round];
const before = derive({ baselines, events, registry, as_of: TODAY, include_pending: false });
const after = derive({ baselines, events, registry, as_of: TODAY, include_pending: true });

/* ----------------------------------------------------------------- render */

const scoreBlock = (h) => {
  if (h.current === null) return ['HEALTH', 'Not rated'];
  const l2 = `${h.current} /10        ${formatDayMonth(h.confirmed)}`;
  if (!h.previous) return ['HEALTH', l2, 'first record'];
  const d = h.delta;
  const move = Math.abs(d) < 0.05 ? 'no change' : `${d > 0 ? '+' : ''}${d}`;
  return ['HEALTH', l2, `${h.previous.value}   ${formatDayMonth(h.previous.date)}   ${move} · ${formatElapsed(h.elapsed_days)}`];
};

const adherenceLine = (a) => {
  if (!a.care_count) return 'no completed intervals yet';
  const late = a.avg_days_late === null ? '' : ` · average ${a.avg_days_late} days late`;
  return `on time ${a.on_time_count} of ${a.care_count} waterings${late}`;
};

// Rule 9: the interval passing is a prompt to look, never an instruction.
const cycleLine = (a) => {
  if (!a.next_due) return 'never watered';
  const due = `due ${formatDayMonth(a.next_due)} (${a.interval_days}d, ${a.season})`;
  if (a.days_past === null || a.days_past <= 0) return `${due} · ${-a.days_past}d to go`;
  return `${due} · ${a.days_past} days past interval — check soil`;
};

const show = (state, title) => {
  console.log(`\n${title}`);
  console.log('─'.repeat(66));
  for (const id of state.order) {
    const p = state.plants[id];
    const block = scoreBlock(p.health);
    console.log(`${p.plant_id}  ${p.name}`);
    console.log(`    ${block[0].padEnd(10)}${block.slice(1).join('   |   ')}`);
    console.log(`    last water ${p.adherence.last_water ? formatDayMonth(p.adherence.last_water) : '—'} · ${cycleLine(p.adherence)}`);
    console.log(`    ${adherenceLine(p.adherence)}   [${p.adherence.state}]`);
    if (p.attention.length) console.log(`    attention: ${p.attention.join(', ')}`);
    if (p.pending_event_ids.length) console.log(`    ${p.pending_event_ids.length} pending`);
  }
  console.log('─'.repeat(66));
  console.log(`  ${state.collection.active_count} active · average health ${state.collection.average_health ?? '—'}`
    + (state.collection.average_previous
      ? ` (was ${state.collection.average_previous.value} on ${formatDayMonth(state.collection.average_previous.date)})`
      : ''));
  console.log(`  needs attention: ${state.collection.needs_attention.join(', ') || 'nothing'}`);
  console.log(`  pending: ${state.pending_count}`);
  console.log(`  due dates: ${state.calendar_forward.slice(0, 4).map((d) => `${formatDayMonth(d.date)} (${d.plants.length})`).join(' · ')}`);
};

console.log(`Three plants. Watering round logged against 001-MON and 006-FER on ${formatDayMonth(TODAY)}.`);
show(before, `BEFORE UPDATE — as of ${formatDayMonth(TODAY)}, ${before.pending_count} events pending`);
show(after, 'IF UPDATE IS TAPPED — the same log, the pending two folded in');
console.log('\n002-SNK was not in the round; nothing about it moved.');
