/**
 * How much of a walk reached the disk — `capture/clock.ts`.
 *
 * This file exists because that arithmetic has been wrong THREE TIMES, and
 * every one was found by the owner reading two numbers off a screen. All
 * three failures are cases below. If any of them ever passes again, the same
 * bug is back.
 *
 * Run with `npm run check:clock`.
 */

const { capturedMsFrom } = require('./build/capture/clock.js');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; }
  else { fail++; console.log(`FAIL ${name}\n  got  ${a}\n  want ${b}`); }
};

const CHUNK = 3000;
const captured = (total_ms, elapsed_at_last_chunk_ms, had_chunk = true) =>
  capturedMsFrom({ total_ms, elapsed_at_last_chunk_ms, had_chunk, chunk_ms: CHUNK });

/* ------------------------------------------------------- the normal case -- */

// Chunks arriving on time: everything elapsed was captured.
eq('a healthy walk captures all of itself', captured(60_000, 59_000), 60_000);
eq('exactly one interval late is still healthy', captured(60_000, 57_000), 60_000);
eq('a chunk and a half late is the edge, and passes', captured(60_000, 55_500), 60_000);

// Before any audio at all, nothing is known to be missing.
eq('a walk with no chunk yet has lost nothing', captured(1_000, 0, false), 1_000);

/* ------------------------------------------- failure 1: the dead mic ------ */

// The owner's walk of 14 Sep: 35 seconds on the clock, 7 seconds of audio.
// iOS handed back a dead microphone and the clock kept counting.
eq('a dead microphone is not counted as captured time',
  captured(35_000, 7_000), 11_500);

eq('and the longer it stays dead the less it earns',
  captured(120_000, 7_000), 11_500);

/* ------------------------------ failure 2: wall time against a frozen clock */

/**
 * The first fix subtracted WALL time from the walk's clock. The clock freezes
 * while the app is backgrounded and wall time does not, so the subtraction
 * raced away and drove a six-minute walk to ZERO — the owner's own trail read
 * "385s since the last audio" then "interrupted · 0s captured" on a walk
 * holding six minutes of audio.
 *
 * Both halves are now on the same clock, and the floor makes it impossible
 * regardless: what was captured stays captured.
 */
eq('a walk that captured six minutes can never report zero',
  captured(360_000, 360_000), 360_000);

// The floor plus the one chunk-and-a-half of grace every walk is allowed —
// never less than what the last chunk proved, however long the silence runs.
eq('and even a huge silence cannot go below the last chunk',
  captured(999_000, 360_000), 364_500);

eq('the result is never negative', captured(10_000, 0) >= 0, true);

/* --------------------------- failure 3: the variable that was never written */

/**
 * 2026-09-17. Measuring on the walk's own clock was right, but the variable
 * holding "the clock when the last chunk landed" was never written when a
 * chunk arrived. So it stayed 0 for the whole walk, `sinceChunk` was the
 * whole walk, and this returned a constant 4500ms for anything longer.
 *
 * The interrupt path then adopted that as the new clock, which is why every
 * resumed walk came back reading 4 seconds however long it had run.
 *
 * These two cases are what that bug looked like. They must never agree again.
 */
eq('a ten-minute walk does not collapse to four and a half seconds',
  captured(600_000, 597_000), 600_000);

eq('nor a two-minute one', captured(120_000, 118_000), 120_000);

// The exact shape of the bug: last-chunk left at zero on a long walk. The
// value is still 4500 — that is correct arithmetic for "no audio since the
// walk began" — which is precisely why the caller must write the variable.
// The bug was never in this sum; it was in nobody feeding it.
eq('a genuinely silent walk does report four and a half seconds',
  captured(600_000, 0), 4_500);

/* ----------------------------------------------------------- invariants --- */

// Two properties that hold for every input, checked across a spread rather
// than argued about in a comment.
{
  let everAbove = false;
  let everBelow = false;
  for (let total = 0; total <= 600_000; total += 7_000) {
    for (let last = 0; last <= total; last += 11_000) {
      const got = captured(total, last);
      if (got > total) everAbove = true;
      if (got < last) everBelow = true;
    }
  }
  eq('never reports more captured than elapsed', everAbove, false);
  eq('never reports less than was captured by the last chunk', everBelow, false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
