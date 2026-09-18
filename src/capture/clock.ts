/**
 * How much of a walk actually reached the disk as audio.
 *
 * ## Why this is its own file
 *
 * This is four lines of arithmetic that have now been WRONG THREE TIMES, and
 * every one of those was found by the owner reading two numbers off a screen
 * rather than by a test:
 *
 * 1. **The original**, 2026-09-14 morning: a walk of 35 seconds holding 7
 *    seconds of audio. iOS had handed back a dead microphone and nothing
 *    noticed, because the clock counts time and time kept passing.
 * 2. **The first fix**, the same afternoon: it subtracted WALL time from a
 *    clock that freezes while the app is backgrounded, so wall time raced
 *    ahead and drove a six-minute walk's captured total to ZERO.
 * 3. **The second fix**, 2026-09-17: measuring on the walk's own clock was
 *    right, but the variable holding "the clock when the last chunk landed"
 *    was initialised, restored on resume, and NEVER WRITTEN WHEN A CHUNK
 *    ARRIVED. So `sinceChunk` was the whole walk, and this returned a
 *    constant 4.5 seconds for any walk longer than that — which the
 *    interrupt path then used as the new clock, resetting every resumed walk
 *    to 4 seconds however long it had been running.
 *
 * Each time the arithmetic lived inside `recording.ts`, tangled up with
 * module state, a `MediaRecorder` and a wake lock — so it could not be tested
 * and was not. It lives here now, pure, with `check/clock.check.cjs` holding
 * all three of those failures as cases. **Do not move it back.**
 *
 * ## What it is for
 *
 * A marker's `offset_s` has to line up with a position in the audio, so time
 * that produced no audio is not merely cosmetic — it drags every later marker
 * out of alignment. When the microphone dies the clock keeps running and the
 * audio does not, and this is what refuses to count the difference.
 */

export interface CapturedInput {
  /** The walk's own clock, in ms. Frozen while the app is backgrounded. */
  total_ms: number;
  /**
   * The walk clock at the moment the last chunk landed.
   *
   * Both halves must be on the SAME clock. Mixing this with a wall-clock
   * reading is failure 2 above, and it cost a walk's entire duration.
   */
  elapsed_at_last_chunk_ms: number;
  /** False before any audio has arrived at all. */
  had_chunk: boolean;
  /** `CHUNK_MS` — a chunk is due this often. */
  chunk_ms: number;
}

/**
 * A chunk is due every `chunk_ms`; anything beyond one and a half intervals
 * since the last one is silence, not lateness.
 *
 * Two invariants, both of which have been broken in the past and are pinned
 * by the check suite:
 *
 * - **It never exceeds the clock.** You cannot capture more than elapsed.
 * - **It never falls below the clock at the last chunk.** What was captured
 *   stays captured; a silence cannot retrospectively un-record the audio in
 *   front of it.
 */
export function capturedMsFrom(input: CapturedInput): number {
  const { total_ms, elapsed_at_last_chunk_ms, had_chunk, chunk_ms } = input;

  // No audio yet means nothing is known to be missing — a walk one second old
  // has not lost anything, it has simply not produced a chunk yet.
  if (!had_chunk) return total_ms;

  const allowed = chunk_ms * 1.5;
  const sinceChunk = total_ms - elapsed_at_last_chunk_ms;
  if (sinceChunk <= allowed) return total_ms;

  return Math.max(elapsed_at_last_chunk_ms, total_ms - (sinceChunk - allowed));
}
