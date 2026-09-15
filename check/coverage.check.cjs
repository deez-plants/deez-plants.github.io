/**
 * Transcript coverage — FIELD_DEFINITIONS.md section 6's four assertions, and
 * the parsing that decides which tier a transcript lands in.
 *
 * This is the one piece of recording that is pure and therefore checkable in
 * node: everything else in `capture/` needs a microphone, a wake lock or
 * IndexedDB, and is exercised in the browser instead. The gate itself is the
 * part worth pinning down — "a package is not marked `verified` until coverage
 * passes" is a promise about behaviour, not about a UI.
 *
 * Run with `npm run check:coverage`.
 */

const { checkCoverage, parseTranscript } = require('./build/capture/coverage.js');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; }
  else { fail++; console.log(`FAIL ${name}\n  got  ${a}\n  want ${b}`); }
};

/** Which assertions failed, deduplicated and sorted — the shape worth asserting. */
const failed = (report) => [...new Set(report.failures.map((f) => f.assertion))].sort();

const MARKERS = [
  { offset_s: 0, type: 'session_start' },
  { offset_s: 12, type: 'plant_open', plant_id: '001-MON' },
  { offset_s: 48, type: 'care_logged', plant_id: '001-MON', event_id: 'EV-1' },
  { offset_s: 100, type: 'session_end' },
];

const FULL = [
  { start: 0, end: 30, text: 'one' },
  { start: 30, end: 65, text: 'two' },
  { start: 65, end: 98, text: 'three' },
];

/* ------------------------------------------------------------- the gate -- */

eq('a transcript covering the whole walk passes',
  checkCoverage(FULL, 100, MARKERS).passed, true);

eq('no failures are reported on a pass',
  checkCoverage(FULL, 100, MARKERS).failures.length, 0);

eq('empty segments fail rather than vacuously passing',
  checkCoverage([], 100, MARKERS).passed, false);

// 1. The last segment ends within the end tolerance of duration_s.
//
// The allowance is deliberately asymmetric, and the reason is the owner's
// first real walk: they stopped talking, lowered the phone and found the stop
// button - six seconds of quiet - and the old five-second rule failed them
// for it. Quiet at the end of a walk is normal. A transcript running PAST the
// audio is not quiet; it is a transcript that does not belong to this
// recording, so that direction keeps a narrow allowance.
eq('assertion 1: a transcript stopping 40s early fails',
  failed(checkCoverage([{ start: 0, end: 60, text: 'x' }], 100, [])), [1]);

eq('assertion 1: 4 seconds short is inside tolerance',
  checkCoverage([{ start: 0, end: 96, text: 'x' }], 100, []).passed, true);

// The case that actually happened, and must never fail again.
eq('assertion 1: stopping talking 6s before the end is fine',
  checkCoverage([{ start: 0, end: 118, text: 'x' }], 124, []).passed, true);

eq('assertion 1: even a long quiet tail passes',
  checkCoverage([{ start: 0, end: 82, text: 'x' }], 100, []).passed, true);

// Rounded before it is compared as well as before it is printed, so the
// report can never contradict itself the way it did once.
eq('assertion 1: the reported shortfall matches the numbers quoted',
  checkCoverage([{ start: 0, end: 59.6, text: 'x' }], 100, []).failures[0].detail,
  'The transcript stops 40s before the end of the audio.');

eq('assertion 1: running past the audio fails too',
  failed(checkCoverage([{ start: 0, end: 120, text: 'x' }], 100, [])), [1, 4]);

// 2. No gap between segments exceeds 20 seconds.
eq('assertion 2: a 35s hole between segments fails',
  failed(checkCoverage(
    [{ start: 0, end: 10, text: 'a' }, { start: 45, end: 98, text: 'b' }],
    100,
    [],
  )), [2]);

eq('assertion 2: a 19s gap is allowed',
  checkCoverage(
    [{ start: 0, end: 40, text: 'a' }, { start: 59, end: 98, text: 'b' }],
    100,
    [],
  ).passed, true);

// 3. Every marker offset falls inside a transcribed segment.
eq('assertion 3: an uncovered marker fails, and reports its own offset',
  checkCoverage(
    [{ start: 0, end: 10, text: 'a' }, { start: 30, end: 98, text: 'b' }],
    100,
    [{ offset_s: 20, type: 'plant_open', plant_id: '004-MNY' }],
  ).failures.filter((f) => f.assertion === 3).map((f) => f.offset_s), [20]);

eq('assertion 3: session_end past the last segment is not a failure',
  checkCoverage(FULL, 100, [{ offset_s: 100, type: 'session_end' }]).passed, true);

// 4. Timestamps are monotonic and inside the recorded duration.
eq('assertion 4: segments going backwards fail',
  failed(checkCoverage(
    [{ start: 50, end: 98, text: 'b' }, { start: 0, end: 40, text: 'a' }],
    100,
    [],
  )).includes(4), true);

eq('assertion 4: a segment ending before it starts fails',
  failed(checkCoverage([{ start: 60, end: 40, text: 'x' }], 100, [])).includes(4), true);

/* ------------------------------------------------------------- parsing -- */

const whisper = JSON.stringify({
  text: 'Hello there.',
  segments: [{ start: 0, end: 4.5, text: 'Hello' }, { start: 4.5, end: 9, text: 'there.' }],
});

eq('Whisper JSON yields segments (the verified tier)',
  parseTranscript(whisper).segments.length, 2);

eq('Whisper JSON keeps its own full text',
  parseTranscript(whisper).text, 'Hello there.');

const srt = '1\n00:00:00,000 --> 00:00:04,500\nHello\n\n2\n00:00:04,500 --> 00:00:09,000\nthere.\n';

eq('SRT parses to the same segments',
  parseTranscript(srt).segments, [
    { start: 0, end: 4.5, text: 'Hello' },
    { start: 4.5, end: 9, text: 'there.' },
  ]);

eq('WebVTT decimal points parse too',
  parseTranscript('00:00:01.250 --> 00:00:03.000\nWords\n').segments,
  [{ start: 1.25, end: 3, text: 'Words' }]);

eq('plain prose yields no segments (the unverified tier)',
  parseTranscript('I walked around and the monstera looked fine.').segments.length, 0);

eq('plain prose is still kept whole',
  parseTranscript('  Kept whole.  ').text, 'Kept whole.');

eq('an empty transcript parses to nothing',
  parseTranscript('   '), { text: '', segments: [] });

eq('malformed JSON falls back to prose rather than throwing',
  parseTranscript('{ not really json').segments.length, 0);

/* ------------------------------------------------- resumed-walk gaps -- */

// A walk iOS cut short and the owner picked back up. The audio genuinely jumps
// at the seam, so the silence there is the recording being honest — failing it
// would mean a resumed walk could never pass the gate, which would make
// resuming pointless.
{
  const segs = [
    { start: 0, end: 30, text: 'before the call' },
    { start: 120, end: 150, text: 'after the call' },
  ];
  const seam = [{ offset_s: 30, type: 'gap', gap_s: 240 }];

  eq('a 90s silence with no gap marker still fails',
    checkCoverage(segs, 150, []).failures.filter((f) => f.assertion === 2).length, 1);

  eq('the same silence passes when a gap marker explains it',
    checkCoverage(segs, 150, seam).failures.filter((f) => f.assertion === 2).length, 0);

  eq('a gap marker is never reported as uncovered',
    checkCoverage(segs, 150, seam).failures.filter((f) => f.assertion === 3).length, 0);

  // The marker excuses its own seam and nothing else.
  const twoGaps = [
    { start: 0, end: 30, text: 'one' },
    { start: 120, end: 150, text: 'two' },
    { start: 300, end: 330, text: 'three' },
  ];
  eq('a gap marker excuses its own seam only',
    checkCoverage(twoGaps, 330, seam).failures.filter((f) => f.assertion === 2).length, 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
