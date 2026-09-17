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

const { checkCoverage, parseDuration, parseQuiet, parseTranscript } = require('./build/capture/coverage.js');

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


/* ------------------------------------------ silence is not a coverage fault */

{
  eq('no quiet line means no ranges', parseQuiet('session: x\nsegments: 3'), []);
  eq('a quiet line is read',
    parseQuiet('coverage: pass\nquiet: 12.0-45.5, 61.0-70.25\n'),
    [{ from: 12, to: 45.5 }, { from: 61, to: 70.25 }]);
  eq('a malformed range is dropped rather than throwing',
    parseQuiet('quiet: 10-5, banana, 20.0-30.0'), [{ from: 20, to: 30 }]);

  // A 90-second hole in a transcript. Knowing nothing about the audio, that is
  // a failure - it might be 90 seconds of missed speech.
  const holed = [{ start: 0, end: 10, text: 'a' }, { start: 100, end: 120, text: 'b' }];
  eq('a long gap still fails when nothing says the audio was quiet',
    failed(checkCoverage(holed, 120, [])), [2]);

  // Once the audio is known to have been quiet there, it is not a fault. This
  // is the owner watering a plant, or standing looking at one.
  eq('a long gap passes when the audio was measured as quiet',
    checkCoverage(holed, 120, [], [{ from: 10, to: 100 }]).passed, true);

  // Partly quiet: 30 seconds of it had sound and produced no words. Over the
  // allowance, so still a fault - and the wording says which.
  const partly = checkCoverage(holed, 120, [], [{ from: 10, to: 70 }]);
  eq('sound inside a quiet stretch is still a fault', failed(partly), [2]);
  eq('and the report says it was sound, not silence',
    partly.failures[0].detail, '30s of audio between segments has sound but no transcript.');

  eq('a gap that is mostly quiet passes',
    checkCoverage(holed, 120, [], [{ from: 10, to: 85 }]).passed, true);
}


/* ------------------------------------- the audio is the ground truth ------ */

{
  eq('no duration line means nothing to correct with',
    parseDuration('session: x\nsegments: 3'), null);
  eq('the measured duration is read',
    parseDuration('session: x\nduration_s: 785\nsegments: 99'), 785);
  eq('a nonsense duration is ignored',
    parseDuration('duration_s: banana'), null);
  eq('a zero duration is ignored', parseDuration('duration_s: 0'), null);

  // The owner's walk of 14 Sep: four recordings holding 13:05, a record
  // saying 5:57, and a complete transcript running to 13:06. Judged against
  // the clock it fails for running past the end of the audio; judged against
  // the audio it passes, which is the truth.
  const full = [{ start: 0, end: 786, text: 'the whole walk' }];
  eq('a complete transcript fails against a clock that fell behind',
    failed(checkCoverage(full, 357, [])).includes(1), true);
  eq('and passes against the audio it was really measured from',
    checkCoverage(full, 786, []).passed, true);
}

/* --------------------------- the format the transcriber actually writes --- */

/**
 * The bug this whole block exists for: `transcribe_walk.py` writes
 * `0:07  words`, and this parser understood only Whisper JSON and SRT. Every
 * real transcript therefore arrived with no segments, landed `unverified`,
 * never met the coverage gate, and — since the audio is released only on a
 * pass — no walk's audio was ever deleted.
 */
{
  const REPORT = [
    'session: SES-2026-09-14-4-part1',
    'transcript_tier: verified',
    'duration_s: 785',
    'segments: 105',
    'coverage: pass',
    'quiet: 572.9-576.0',
    '',
    '--- coverage report ---',
    'PASS  last segment ends 13:06, recording 13:05',
    'PASS  largest gap 10s',
    '',
    '--- transcript ---',
    '',
    '[no plant page open]',
    '0:00  okay this is my first real walk',
    '0:07  starting with the large Monstera',
    '',
    '[013-OXA]',
    '0:12  today I watered it',
  ].join('\n');

  const parsed = parseTranscript(REPORT);
  eq('the transcriber\'s own lines are timestamps', parsed.segments.length, 3);
  eq('and they are read in seconds',
    parsed.segments.map((s) => s.start), [0, 7, 12]);
  // Each runs until the next begins; the last gets the median of the others,
  // because ending it where it started would invent a shortfall.
  eq('each segment ends where the next begins',
    parsed.segments.map((s) => s.end), [7, 12, 19]);
  // The whole report is kept, not just the spoken lines: the plant headings
  // are the attribution and the coverage lines are the transcriber's account.
  eq('the report is kept whole as the text',
    parsed.text.includes('[013-OXA]') && parsed.text.includes('PASS  largest gap 10s'), true);
  // The header lines must not be mistaken for speech.
  eq('the header is not read as cues',
    parsed.segments.some((s) => s.text.includes('coverage')), false);

  eq('an hour-long walk is minutes past sixty, not H:MM:SS',
    parseTranscript('90:12  still going\n95:00  nearly done').segments.map((s) => s.start),
    [5412, 5700]);
  eq('but H:MM:SS is read too',
    parseTranscript('1:02:03  one\n1:02:09  two').segments.map((s) => s.start),
    [3723, 3729]);

  // The one direction this must never get wrong: promoting prose to verified.
  eq('one stamped line in prose is not a track',
    parseTranscript('I told him 12:30 and he came at two').segments.length, 0);
  eq('plain prose stays unverified',
    parseTranscript('just some words about a plant').segments.length, 0);
  eq('timestamps out of order are not a track',
    parseTranscript('5:00  later\n1:00  earlier').segments.length, 0);
}

/**
 * The owner's real walk of 14 Sep, end to end, if the file is still on this
 * machine. Skipped rather than failed when it is not — the transcript lives in
 * OneDrive, not the repo, and a check that fails on another machine is a check
 * nobody runs.
 */
{
  const fs = require('node:fs');
  const path = require('node:path');
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const real = path.join(home, 'OneDrive', 'Deez Plants', '2 transcripts',
    '2026-09-14 1833 walk 4 - TRANSCRIPT.txt');

  if (fs.existsSync(real)) {
    const raw = fs.readFileSync(real, 'utf8');
    const { segments } = parseTranscript(raw);
    const duration = parseDuration(raw);
    eq('the real walk parses to its 105 segments', segments.length, 105);
    eq('and its measured duration is read', duration, 785);
    const report = checkCoverage(segments, duration, [], parseQuiet(raw));
    eq('and it passes coverage, which is what releases the audio',
      report.passed, true);
  } else {
    console.log('skip the real walk of 14 Sep — not on this machine');
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
