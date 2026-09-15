import type { CoverageReport, SessionMarker } from '../db/schema';

/**
 * Coverage verification. FIELD_DEFINITIONS.md section 6.
 *
 * "Perfect transcription is not achievable. Auditable transcription is, and the
 * app measures against a duration it recorded itself." The four assertions
 * below are exactly the four the spec names, in its own order, and a package is
 * not marked `verified` until they all pass.
 *
 * They need per-segment timestamps, which only a Whisper-style transcript has.
 * A typed, pasted or dictated transcript has none, is accepted whole, and is
 * marked `unverified` — the tiers table in section 6. That is why this file
 * only ever runs on the verified path.
 */

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

/**
 * Section 6, assertion 1 — how much quiet may sit between the last word and
 * the end of the recording.
 *
 * **Was 5 seconds, which failed an honest walk on its first real run.** The
 * owner stopped talking, lowered the phone, found the stop button: six
 * seconds. Nobody presses stop mid-syllable, so a five-second allowance
 * fails nearly every real walk — and a gate that cries wolf is worse than no
 * gate, because the one time it means something you have learned to ignore it.
 */
const END_TOLERANCE_S = 20;

/**
 * Section 6, assertion 2 — untranscribed audio between two segments.
 *
 * This is a backstop now rather than the main test. A gap is only judged at
 * all when the transcript does not say whether the audio there was quiet; see
 * `quiet` below. Silence is a fact about a walk, not a fault in a transcript,
 * and watering a plant properly is a minute of it.
 */
const MAX_GAP_S = 20;

/** Matching offsets to a named instant: a marker, a seam, the end of a walk. */
const NEAR_S = 5;

export interface QuietRange { from: number; to: number }

/**
 * Stretches where the AUDIO was quiet, as measured on the laptop.
 *
 * `transcribe_walk.py` writes a `quiet:` line into the transcript because it
 * has the decoder open anyway. The phone never has to analyse audio for this.
 *
 * It exists to answer the question assertion 2 could not previously ask. A
 * gap in a transcript means one of two things — nobody was talking, or
 * someone was and Whisper missed it — and **only the second is a fault**.
 * Without this the gate had to treat every silence as a failure, which fails
 * a walk for the crime of watering a plant properly.
 *
 * Absent for a pasted transcript or an older script, in which case gaps are
 * judged the old way rather than wrongly forgiven.
 */
export function parseQuiet(raw: string): QuietRange[] {
  const line = raw
    .split('\n')
    .find((l) => l.trim().toLowerCase().startsWith('quiet:'));
  if (!line) return [];

  const out: QuietRange[] = [];
  for (const pair of line.slice(line.indexOf(':') + 1).split(',')) {
    const [a, b] = pair.split('-').map((n) => Number(n.trim()));
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) out.push({ from: a, to: b });
  }
  return out;
}

/**
 * The duration the transcript was measured against, if it says.
 *
 * `transcribe_walk.py` decodes every recording in a walk, so it knows how long
 * the audio really is — and **the audio is ground truth while the clock is an
 * estimate**. The owner's walk of 14 Sep proved the gap can be enormous: four
 * recordings decoding to 13:05 against a record saying 5:57, because the clock
 * freezes when the app is backgrounded and iOS keeps recording anyway.
 *
 * Only ever used to correct a walk's duration UPWARDS, and only for a walk
 * that was interrupted — see `attachTranscript`.
 */
export function parseDuration(raw: string): number | null {
  const line = raw
    .split('\n')
    .find((l) => l.trim().toLowerCase().startsWith('duration_s:'));
  if (!line) return null;
  const n = Number(line.slice(line.indexOf(':') + 1).trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function checkCoverage(
  segments: readonly TranscriptSegment[],
  duration_s: number,
  markers: readonly SessionMarker[],
  quiet: readonly QuietRange[] = [],
): CoverageReport {
  const failures: CoverageReport['failures'] = [];

  if (!segments.length) {
    return {
      passed: false,
      failures: [{ assertion: 1, offset_s: 0, detail: 'The transcript holds no timestamped segments.' }],
    };
  }

  // 1. The last segment ends within 5 seconds of `duration_s`.
  const last = segments[segments.length - 1];
  // Rounded before it is compared as well as before it is printed, so the
  // report can never disagree with itself the way it did once: "last segment
  // ends 1:58 but recording is 2:04" followed by "gap 5s".
  const short = Math.round(duration_s - last.end);
  // Deliberately asymmetric. Stopping SHORT is usually just quiet at the end
  // of a walk, and gets the wide allowance. Running PAST the audio is not
  // quiet — it is a transcript that does not belong to this recording, or a
  // duration the app got wrong — so it keeps the narrow one.
  if (short > END_TOLERANCE_S || -short > NEAR_S) {
    failures.push({
      assertion: 1,
      offset_s: Math.max(0, Math.round(last.end)),
      detail: short > 0
        ? `The transcript stops ${short}s before the end of the audio.`
        : `The transcript runs ${-short}s past the end of the audio.`,
    });
  }

  // 2. No gap between segments exceeds 20 seconds without a silence marker.
  //
  // The app now writes exactly one kind: a `gap` marker, placed where iOS
  // ended a capture and the owner picked the walk back up. The audio really
  // does jump there, so a silence across that seam is the recording being
  // honest rather than the transcript being short — failing it would mean a
  // resumed walk could never pass, which would make resuming useless.
  const seams = markers.filter((m) => m.type === 'gap').map((m) => m.offset_s);
  for (let i = 1; i < segments.length; i += 1) {
    const from = segments[i - 1].end;
    const to = segments[i].start;
    if (to - from <= MAX_GAP_S) continue;
    const explained = seams.some((at) => at >= from - NEAR_S && at <= to + NEAR_S);
    if (explained) continue;

    // How much of this gap was measured as quiet. Silence is a fact about a
    // walk, not a fault in a transcript: watering a plant properly is a
    // minute of it, and looking at one is longer. Only sound that produced no
    // words is worth failing over.
    const covered = quiet.reduce(
      (sum, q) => sum + Math.max(0, Math.min(to, q.to) - Math.max(from, q.from)),
      0,
    );
    const noisy = Math.round((to - from) - covered);
    if (noisy <= MAX_GAP_S) continue;

    failures.push({
      assertion: 2,
      offset_s: Math.max(0, Math.round(from)),
      detail: covered > 0
        ? `${noisy}s of audio between segments has sound but no transcript.`
        : `${Math.round(to - from)}s of audio between segments has no transcript.`,
    });
  }

  // 3. Every marker `offset_s` falls inside a transcribed segment.
  // `session_end` sits at the very last instant of the walk and routinely lands
  // just past the final segment; the end tolerance in assertion 1 already
  // covers that stretch, so checking it here would only double-report it.
  for (const marker of markers) {
    if (marker.type === 'session_end') continue;
    // A `gap` marker sits exactly on the seam where the audio jumps, so by
    // definition nothing was transcribed there. Same reasoning as
    // `session_end`: reporting it would flag the recording for being honest.
    if (marker.type === 'gap') continue;
    const covered = segments.some((s) => marker.offset_s >= s.start && marker.offset_s <= s.end);
    if (!covered) {
      failures.push({
        assertion: 3,
        offset_s: marker.offset_s,
        detail: `Nothing was transcribed where the ${describeMarker(marker)} marker sits.`,
      });
    }
  }

  // 4. Segment timestamps are monotonic and none exceeds `duration_s`.
  for (let i = 0; i < segments.length; i += 1) {
    const s = segments[i];
    if (s.end < s.start) {
      failures.push({
        assertion: 4,
        offset_s: Math.max(0, Math.round(s.start)),
        detail: 'A segment ends before it starts.',
      });
    }
    if (i > 0 && s.start < segments[i - 1].start) {
      failures.push({
        assertion: 4,
        offset_s: Math.max(0, Math.round(s.start)),
        detail: 'Segment timestamps go backwards.',
      });
    }
    if (s.end > duration_s + NEAR_S) {
      failures.push({
        assertion: 4,
        offset_s: Math.max(0, Math.round(duration_s)),
        detail: `A segment ends at ${Math.round(s.end)}s, past the ${Math.round(duration_s)}s the app recorded.`,
      });
    }
  }

  return { passed: failures.length === 0, failures };
}

function describeMarker(marker: SessionMarker): string {
  switch (marker.type) {
    case 'plant_open': return `${marker.plant_id ?? 'plant'} page-open`;
    case 'care_logged': return `${marker.plant_id ?? 'plant'} care-logged`;
    case 'photo': return `${marker.plant_id ?? 'plant'} photo`;
    case 'session_start': return 'session-start';
    default: return marker.type;
  }
}

/* -------------------------------------------------------------------------- */
/* Reading what Whisper produces                                               */
/* -------------------------------------------------------------------------- */

export interface ParsedTranscript {
  text: string;
  /** Empty when the source carried no timestamps — an `unverified` transcript. */
  segments: TranscriptSegment[];
}

interface WhisperShape {
  text?: unknown;
  segments?: unknown;
}

/**
 * Whisper's own JSON (`--output_format json`), or its SRT/VTT subtitle output,
 * or plain text. Anything without timestamps parses to zero segments, which is
 * what puts it in the unverified tier rather than failing.
 */
export function parseTranscript(raw: string): ParsedTranscript {
  const trimmed = raw.trim();
  if (!trimmed) return { text: '', segments: [] };

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as WhisperShape;
      const segments = Array.isArray(parsed.segments)
        ? parsed.segments.flatMap((s): TranscriptSegment[] => {
          const seg = s as { start?: unknown; end?: unknown; text?: unknown };
          if (typeof seg.start !== 'number' || typeof seg.end !== 'number') return [];
          return [{ start: seg.start, end: seg.end, text: String(seg.text ?? '').trim() }];
        })
        : [];
      const text = typeof parsed.text === 'string' && parsed.text.trim()
        ? parsed.text.trim()
        : segments.map((s) => s.text).join(' ').trim();
      return { text, segments };
    } catch {
      // Not the JSON it looked like. Fall through and treat it as prose.
      return { text: trimmed, segments: [] };
    }
  }

  const cues = parseCues(trimmed);
  if (cues.length) {
    return { text: cues.map((c) => c.text).join('\n').trim(), segments: cues };
  }

  return { text: trimmed, segments: [] };
}

/** SRT (`00:00:12,340 --> 00:00:15,120`) and WebVTT (`.` for the decimal). */
const CUE_RE = /(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})/;

function parseCues(raw: string): TranscriptSegment[] {
  const lines = raw.split(/\r?\n/);
  const out: TranscriptSegment[] = [];
  let pending: { start: number; end: number; text: string[] } | null = null;

  const flush = () => {
    if (pending && pending.text.length) {
      out.push({ start: pending.start, end: pending.end, text: pending.text.join(' ').trim() });
    }
    pending = null;
  };

  for (const line of lines) {
    const match = CUE_RE.exec(line);
    if (match) {
      flush();
      pending = {
        start: toSeconds(match[1], match[2], match[3], match[4]),
        end: toSeconds(match[5], match[6], match[7], match[8]),
        text: [],
      };
      continue;
    }
    if (!pending) continue;
    // A bare number on its own line is an SRT cue index, not speech.
    if (!line.trim() || /^\d+$/.test(line.trim())) { flush(); continue; }
    pending.text.push(line.trim());
  }
  flush();

  return out;
}

function toSeconds(h: string, m: string, s: string, frac: string): number {
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(frac) / 10 ** frac.length;
}
