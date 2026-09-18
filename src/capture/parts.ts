import type { SessionMarker, SessionRecord } from '../db/schema';

/**
 * Where each recording in an interrupted walk sits in the stitched audio —
 * derived entirely from what the app already stores.
 *
 * ## The problem this exists for
 *
 * A walk that gets interrupted holds several recordings. Marker offsets are
 * stamped on the WALK'S CLOCK. The transcript is measured on the STITCHED
 * AUDIO. Those two are not the same timeline, and the difference is not a
 * rounding error:
 *
 *     the owner's walk of 14 Sep — clock 357s, audio 785s
 *
 * **iOS keeps recording while the app is in the background; the clock does
 * not.** So 428 seconds of that walk are audio with no clock time behind
 * them, and every marker after a backgrounding is progressively EARLY against
 * the transcript. A reviewer reading offset 300 as second 300 of the
 * transcript is reading the wrong part of the walk.
 *
 * (A separate, uglier symptom — offsets resetting to 0 — was a timing bug in
 * `capturedMs`, fixed 2026-09-14. That is not this. Do not conflate them.)
 *
 * ## Why it is derived rather than recorded
 *
 * **Nothing in the capture chain is touched by this file.** Recording,
 * chunking, interruption, resume, assembly, export and transcription are
 * unchanged, and that is deliberate: that chain was expensive to make
 * reliable, and the owner's instruction was to try the version that costs it
 * nothing first. Everything here comes from two things already on the record:
 *
 * - `segment_starts` — the chunk index each recording begins at. Chunks are a
 *   fixed `CHUNK_S` of audio, so a chunk index IS a position in the stitched
 *   audio, to within one chunk.
 * - the `gap` markers — written at each seam, in order, in the marker list.
 *   Markers before the first gap belong to part 1, and so on.
 *
 * ## What it can and cannot say
 *
 * **Part boundaries are good to about one chunk.** Positions *inside* a part
 * are not, because the clock can still fall behind the audio within a single
 * recording if the app was backgrounded without the microphone stopping.
 *
 * So a marker gets `stitched_at_least_s`, not `stitched_s`. Audio time only
 * ever runs AHEAD of clock time, never behind — the clock can freeze while
 * audio continues, and never the reverse. That makes elapsed clock a genuine
 * LOWER BOUND on the position in the stitched audio, and the part's own end a
 * genuine upper one. A bound that is true beats a point that is plausible.
 *
 * `background_s` on each part says how much room there is between those two:
 * zero means the mapping is tight, and a large number means attribution
 * inside that part is loose and the words should be trusted over it.
 */

/** `CHUNK_MS` in `recording.ts`, as seconds. A chunk index times this is a
    position in the stitched audio. Kept in step with that constant by
    `check/parts.check.cjs`. */
export const CHUNK_S = 3;

export interface WalkPart {
  /** 1-based, in the order they were recorded. */
  part: number;
  /** The walk clock while this recording was running. */
  clock_from_s: number;
  clock_to_s: number;
  /** Where this recording sits in the stitched audio. */
  stitched_from_s: number;
  stitched_to_s: number;
  /**
   * Audio in this part with no clock time behind it — the app backgrounded
   * while the microphone kept going. The width of the uncertainty inside this
   * part, and zero when there is none.
   */
  background_s: number;
}

export interface MappedMarker {
  marker: SessionMarker;
  /** 1-based part this marker was written during. */
  part: number;
  /**
   * The earliest position in the stitched audio this marker can be at.
   *
   * Never "the position". See the note above: within a part the clock can lag
   * the audio, so this is a floor, and the part's `stitched_to_s` is the
   * ceiling.
   */
  stitched_at_least_s: number;
}

/** Travels with the mapping wherever it is exported, so the bound cannot be
    read as a point by someone who has not read this file. */
export const PARTS_NOTE =
  'An interrupted walk holds several recordings. Marker offsets are on the '
  + "walk's clock; the transcript is on the stitched audio, and the two are "
  + 'not the same timeline — iOS keeps recording while the app is in the '
  + 'background and the clock does not. `stitched_at_least_s` is the EARLIEST '
  + 'point in the transcript a marker can be at; its part\'s `stitched_to_s` '
  + 'is the latest. Where a part\'s `background_s` is large, attribution '
  + 'inside it is loose. Never treat raw `offset_s` as a position in the '
  + 'transcript, and where markers and words disagree, the words win.';

/**
 * Split a walk into its recordings.
 *
 * One part is the normal case and needs none of this — a walk that ran start
 * to finish has one clock and one recording, and they agree.
 */
export function walkParts(session: SessionRecord): WalkPart[] {
  const starts = session.segment_starts ?? [];
  const total = session.duration_s;

  // A walk with no segment record, or one segment, is one part: clock and
  // audio are the same timeline and there is nothing to translate.
  if (starts.length < 2) {
    return [{
      part: 1,
      clock_from_s: 0,
      clock_to_s: total,
      stitched_from_s: 0,
      stitched_to_s: total,
      background_s: 0,
    }];
  }

  const seams = session.markers.filter((m) => m.type === 'gap');

  // The two sources have to agree on how many recordings there were. When
  // they do not — a walk from before one of them existed, a marker list
  // truncated by a force-quit — say one part rather than invent boundaries
  // from the half that is present. A coarse honest answer beats a precise
  // invented one.
  if (seams.length !== starts.length - 1) {
    return [{
      part: 1,
      clock_from_s: 0,
      clock_to_s: total,
      stitched_from_s: 0,
      stitched_to_s: total,
      background_s: 0,
    }];
  }

  const parts: WalkPart[] = [];
  for (let i = 0; i < starts.length; i++) {
    const clock_from = i === 0 ? 0 : seams[i - 1].offset_s;
    const clock_to = i + 1 < starts.length ? seams[i].offset_s : total;
    const stitched_from = starts[i] * CHUNK_S;
    const stitched_to = i + 1 < starts.length ? starts[i + 1] * CHUNK_S : total;

    const clockSpan = Math.max(0, clock_to - clock_from);
    const audioSpan = Math.max(0, stitched_to - stitched_from);
    parts.push({
      part: i + 1,
      clock_from_s: clock_from,
      clock_to_s: clock_to,
      stitched_from_s: stitched_from,
      stitched_to_s: stitched_to,
      // Only ever audio in excess of clock. The reverse would mean the clock
      // ran while nothing was recorded, which `capturedMs` already refuses to
      // count, so it is reported as no room rather than as negative room.
      background_s: Math.max(0, audioSpan - clockSpan),
    });
  }
  return parts;
}

/**
 * Place every marker in its part and give it a floor in the stitched audio.
 *
 * Membership comes from the ORDER of the marker list, not from comparing
 * offsets: offsets restart at a seam, so ordering by them would interleave
 * two recordings into nonsense. The list is written in the order things
 * happened, and a `gap` marker is the seam itself.
 */
export function mapMarkers(session: SessionRecord): MappedMarker[] {
  const parts = walkParts(session);
  const out: MappedMarker[] = [];
  let index = 0;

  for (const marker of session.markers) {
    const part = parts[Math.min(index, parts.length - 1)];
    const elapsed = Math.max(0, marker.offset_s - part.clock_from_s);
    out.push({
      marker,
      part: part.part,
      // Clamped to the part it belongs to: a clock that overran its own seam
      // must not push a marker into the next recording, which is the one
      // thing this mapping exists to prevent.
      stitched_at_least_s: Math.min(part.stitched_from_s + elapsed, part.stitched_to_s),
    });
    // The gap marker IS the seam, so it belongs to the part that just ended
    // and everything after it belongs to the next one.
    if (marker.type === 'gap') index++;
  }

  return out;
}
