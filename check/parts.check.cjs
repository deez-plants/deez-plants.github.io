/**
 * Recording-part attribution — `capture/parts.ts`.
 *
 * Pure, and therefore checkable in node: it derives everything from a session
 * record, touching no microphone and no database. That is the whole point of
 * the design — the capture chain is not involved.
 *
 * Run with `npm run check:parts`.
 */

const { CHUNK_S, mapMarkers, walkParts } = require('./build/capture/parts.js');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; }
  else { fail++; console.log(`FAIL ${name}\n  got  ${a}\n  want ${b}`); }
};

const session = (over) => ({
  session_id: 'SES-1',
  started: '2026-09-14T18:33:54',
  duration_s: 100,
  markers: [],
  transcript: null,
  transcript_tier: null,
  coverage: null,
  ...over,
});

/* ------------------------------------------------- the ordinary walk ----- */

// A walk that ran start to finish has one clock and one recording, and they
// agree. None of this machinery should appear for it.
{
  eq('a walk with no segment record is one part',
    walkParts(session({ duration_s: 240 })),
    [{ part: 1, clock_from_s: 0, clock_to_s: 240, stitched_from_s: 0, stitched_to_s: 240, background_s: 0 }]);

  eq('and so is a walk with exactly one segment',
    walkParts(session({ duration_s: 240, segment_starts: [0] })).length, 1);
}

/* ------------------------------------------------- an interrupted walk --- */

{
  // Two recordings. The first ran 0-60 on the clock and holds 0-90 of audio:
  // thirty seconds of it were recorded while the app was in the background,
  // where the clock does not run.
  const s = session({
    duration_s: 150,
    segment_starts: [0, 30],
    markers: [
      { type: 'session_start', offset_s: 0 },
      { type: 'plant_open', plant_id: '001-MON', offset_s: 20 },
      { type: 'gap', gap_s: 40, offset_s: 60 },
      { type: 'plant_open', plant_id: '002-SNK', offset_s: 70 },
      { type: 'session_end', offset_s: 150 },
    ],
  });

  eq('chunk index times CHUNK_S is a position in the stitched audio', CHUNK_S, 3);

  eq('two recordings, mapped',
    walkParts(s), [
      { part: 1, clock_from_s: 0, clock_to_s: 60, stitched_from_s: 0, stitched_to_s: 90, background_s: 30 },
      { part: 2, clock_from_s: 60, clock_to_s: 150, stitched_from_s: 90, stitched_to_s: 150, background_s: 0 },
    ]);

  const mapped = mapMarkers(s);

  // Membership comes from list ORDER, never from comparing offsets — offsets
  // restart at a seam, so sorting by them would interleave two recordings.
  eq('markers land in the right recording',
    mapped.map((m) => m.part), [1, 1, 1, 2, 2]);

  // The gap marker IS the seam, so it belongs to the part that just ended.
  eq('the gap marker belongs to the part it ended',
    mapped.find((m) => m.marker.type === 'gap').part, 1);

  eq('a floor, not a position',
    mapped.map((m) => m.stitched_at_least_s), [0, 20, 60, 100, 150]);

  // 002-SNK opened 10 clock-seconds into part 2, which starts at second 90 of
  // the audio. Reading its raw offset of 70 as second 70 of the transcript
  // would land it 30 seconds earlier, inside the FIRST recording — which is
  // exactly the misattribution this exists to stop.
  eq('the second plant is not read into the first recording',
    mapped[3].stitched_at_least_s, 100);
}

/* --------------------------------------------------- refusing to guess --- */

{
  // segment_starts says three recordings; the markers carry one seam. The two
  // sources disagree, so boundaries cannot be placed. One coarse honest part
  // beats three invented ones.
  const s = session({
    duration_s: 150,
    segment_starts: [0, 20, 40],
    markers: [
      { type: 'session_start', offset_s: 0 },
      { type: 'gap', gap_s: 10, offset_s: 50 },
      { type: 'session_end', offset_s: 150 },
    ],
  });
  eq('disagreeing sources collapse to one part rather than inventing seams',
    walkParts(s).length, 1);
  eq('and every marker then keeps its own offset',
    mapMarkers(s).map((m) => m.stitched_at_least_s), [0, 50, 150]);
}

{
  // A clock that overran its own seam must never push a marker into the next
  // recording. Clamped to the part it belongs to.
  const s = session({
    duration_s: 120,
    segment_starts: [0, 10],
    markers: [
      { type: 'plant_open', plant_id: '001-MON', offset_s: 999 },
      { type: 'gap', gap_s: 5, offset_s: 40 },
      { type: 'session_end', offset_s: 120 },
    ],
  });
  eq('a marker cannot be pushed past the end of its own recording',
    mapMarkers(s)[0].stitched_at_least_s, 30);
}

/* ------------------------------------ the owner's real walk of 14 Sep ---- */

/**
 * Four recordings, a clock of 357s and 785s of audio. The package this came
 * from was recorded on the build whose `capturedMs` bug reset the clock, so
 * the offsets in it go backwards — which is precisely the shape this has to
 * survive without producing nonsense.
 */
{
  const fs = require('node:fs');
  const path = require('node:path');
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const real = path.join(home, 'OneDrive', 'Deez Plants', 'archive',
    '2026-09-14 1833 walk 4', 'markers.json');

  if (fs.existsSync(real)) {
    const side = JSON.parse(fs.readFileSync(real, 'utf8'));
    const s = session({
      duration_s: 785,
      // REPRESENTATIVE, NOT MEASURED. The real `segment_starts` live on the
      // session record on the owner's phone; the exported sidecar carries only
      // the markers. Four boundaries inside 785s is the right shape, and what
      // is asserted below is structural — no marker escapes its own recording,
      // and the offsets that reset stop reading as going backwards — neither
      // of which depends on these four numbers being the true ones.
      segment_starts: [0, 60, 110, 185],
      markers: side.markers,
    });

    const parts = walkParts(s);
    eq('the real walk splits into its four recordings', parts.length, 4);
    eq('its three seams are the three gap markers',
      s.markers.filter((m) => m.type === 'gap').length, 3);

    const mapped = mapMarkers(s);
    eq('every marker lands in exactly one part',
      mapped.length, s.markers.length);

    // The one property that has to hold whatever the clock did: no marker may
    // be placed outside the recording it was written during.
    const inside = mapped.every((m) => {
      const p = parts[m.part - 1];
      return m.stitched_at_least_s >= p.stitched_from_s
        && m.stitched_at_least_s <= p.stitched_to_s;
    });
    eq('no marker escapes its own recording, even with a clock that reset',
      inside, true);

    // Ordering across the walk is restored: raw offsets go 352 then 0, and
    // after mapping the later marker is never earlier than the seam before it.
    const monotonic = mapped.every((m, i) => i === 0
      || m.stitched_at_least_s >= mapped[i - 1].stitched_at_least_s
      || m.part === mapped[i - 1].part);
    eq('the offsets that reset no longer read as going backwards', monotonic, true);
  } else {
    console.log('skip the real walk of 14 Sep — not on this machine');
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
