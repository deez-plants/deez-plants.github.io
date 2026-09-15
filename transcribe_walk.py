#!/usr/bin/env python3
"""
Deez Plants - walk transcription and plant attribution.

Usage:   python transcribe_walk.py SES-2026-08-22-1.m4a [--model small.en]

Reads the audio, and (if present beside it) SES-....markers.json and
corrections.txt. Writes SES-....transcript.txt containing:

  - a coverage report the app checks against its own recorded duration
  - timestamped segments
  - each segment attributed to the plant whose page was open at that offset

Requires: pip install faster-whisper
"""

import argparse
import json
import os
import sys

try:
    from faster_whisper import WhisperModel
except ImportError:
    sys.exit("faster-whisper is not installed. Run:  pip install faster-whisper")


def load_markers(audio_path):
    """Find the sidecar for this session. Returns (markers, duration_s) or (None, None)."""
    base = os.path.splitext(audio_path)[0]
    for candidate in (base + ".markers.json", base + "-markers.json",
                      os.path.join(os.path.dirname(audio_path) or ".", "markers.json")):
        if os.path.exists(candidate):
            with open(candidate, encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list):          # several sessions in one file
                sid = os.path.basename(base)
                data = next((d for d in data if d.get("session_id") == sid), None)
                if data is None:
                    continue
            return data.get("markers", []), data.get("duration_s")
    return None, None


def load_corrections(audio_path):
    path = os.path.join(os.path.dirname(audio_path) or ".", "corrections.txt")
    subs = []
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                wrong, right = line.split("=", 1)
                subs.append((wrong.strip(), right.strip()))
    # longest first, so a longer phrase wins over a substring of it
    subs.sort(key=lambda s: len(s[0]), reverse=True)
    return subs


def apply_corrections(text, subs):
    for wrong, right in subs:
        if wrong and wrong in text:
            text = text.replace(wrong, right)
        low = wrong.lower()
        if low and low in text.lower() and wrong not in text:
            # case-insensitive pass
            out, i = [], 0
            hay = text.lower()
            while True:
                j = hay.find(low, i)
                if j < 0:
                    out.append(text[i:])
                    break
                out.append(text[i:j])
                out.append(right)
                i = j + len(low)
            text = "".join(out)
    return text


def plant_timeline(markers):
    """Ordered list of (offset_s, plant_id) from plant_open markers."""
    opens = [(m["offset_s"], m.get("plant_id"))
             for m in markers
             if m.get("type") == "plant_open" and m.get("plant_id")]
    opens.sort(key=lambda x: x[0])
    return opens


def attribute(offset, opens):
    """The plant whose page was open at this offset.

    Ambiguous segments attach to the PREVIOUS plant - the last page opened
    before this point. Spec section 6. Returns None before the first open.
    """
    current = None
    for at, pid in opens:
        if at <= offset:
            current = pid
        else:
            break
    return current


def walk_parts(audio_path):
    """Every recording in this walk, in order.

    A walk interrupted by iOS is several recordings, not one. Each is a
    self-contained file - gluing them makes bytes no player reads past the
    first join - so the app exports SES-...-part1.m4a, -part2 and so on.

    Give this script part1 (or the only file) and it finds the rest.
    """
    base, ext = os.path.splitext(audio_path)
    if not base.endswith("-part1"):
        return [audio_path]
    stem = base[: -len("-part1")]
    parts, i = [], 1
    while True:
        candidate = "%s-part%d%s" % (stem, i, ext)
        if not os.path.exists(candidate):
            break
        parts.append(candidate)
        i += 1
    return parts or [audio_path]


def quiet_stretches(paths, floor_db=-45.0, min_len=3.0):
    """Where the audio was quiet, in walk-time seconds.

    The point of this is the coverage gate. A gap in a transcript means one of
    two things - nobody was talking, or someone was and Whisper missed it -
    and only the second is a fault. Silence is a fact about a walk: watering a
    plant properly is a minute of it, and standing looking at one is longer.

    So this measures the AUDIO, not the transcript. Deriving quiet from the
    gaps between segments would be circular and would make the check
    unfailable.

    Measured per decoded frame - about 20ms - and vectorised. An earlier
    version looped over six million individual samples in Python and was never
    going to finish.
    """
    try:
        import numpy as np
    except ImportError:
        print("  numpy not available - skipping")
        return []
    try:
        import av
    except ImportError:
        print("  PyAV not available - skipping")
        return []

    quiet, offset = [], 0.0
    floor = 10.0 ** (floor_db / 20.0)

    for path in paths:
        try:
            times, loud = [], []
            with av.open(path) as container:
                stream = container.streams.audio[0]
                rate = stream.codec_context.sample_rate or 48000
                t = 0.0
                for frame in container.decode(stream):
                    block = frame.to_ndarray()
                    if block.dtype.kind in "iu":
                        block = block.astype("float32") / float(np.iinfo(block.dtype).max)
                    rms = float(np.sqrt(np.mean(np.square(block.astype("float32")))))
                    span = block.shape[-1] / float(rate)
                    times.append((t, t + span))
                    loud.append(rms >= floor)
                    t += span

            # Smooth before thresholding, or nothing is ever quiet.
            #
            # The pauses between words are 20-200ms and they fragment every
            # silence into runs too short to count: a real walk measured 41
            # seconds below the floor and produced not one stretch of 3. A
            # half-second moving average removes the flicker between words
            # while leaving an actual silence intact.
            if loud:
                span = max(1, int(round(0.5 / max(1e-6, times[0][1] - times[0][0]))))
                pad = span // 2
                padded = [loud[0]] * pad + loud + [loud[-1]] * pad
                smoothed = []
                for i in range(len(loud)):
                    window = padded[i:i + span]
                    smoothed.append(sum(window) > len(window) / 2)
                loud = smoothed

            # Runs of quiet frames, kept only when long enough to matter.
            run = None
            for (a, b), is_loud in zip(times, loud):
                if not is_loud:
                    if run is None:
                        run = a
                elif run is not None:
                    if a - run >= min_len:
                        quiet.append((offset + run, offset + a))
                    run = None
            if run is not None and times and times[-1][1] - run >= min_len:
                quiet.append((offset + run, offset + times[-1][1]))
            offset += times[-1][1] if times else 0.0
        except Exception as exc:
            # Loudly, not silently. A measurement that quietly returns nothing
            # would make the app forgive every gap for the wrong reason.
            print("  could not measure %s: %s" % (os.path.basename(path), exc))
            return []

    return quiet


def audio_duration(paths):
    """How long the recordings actually are, in seconds.

    THE AUDIO IS THE GROUND TRUTH AND THE CLOCK IS AN ESTIMATE, and the
    owner's walk of 14 Sep proved it: four recordings decoding to 13:05
    against a record that said 5:57. The clock freezes while the app is
    backgrounded and iOS keeps recording anyway, so a walk's counted time can
    fall a long way behind what it captured.

    Judging a transcript against the smaller number rejects a complete
    transcript for "running past the end of the audio", which is the app
    being wrong about its own recording.
    """
    try:
        import av
    except ImportError:
        return None
    total = 0.0
    for path in paths:
        try:
            with av.open(path) as container:
                if container.duration:
                    total += float(container.duration) / av.time_base
                    continue
                stream = container.streams.audio[0]
                rate = stream.codec_context.sample_rate or 48000
                samples = sum(f.samples for f in container.decode(stream))
                total += samples / float(rate)
        except Exception:
            return None
    return total if total > 0 else None


def mmss(seconds):
    seconds = int(round(seconds))
    return "%d:%02d" % (seconds // 60, seconds % 60)


# Spec section 6, and these MUST match `src/capture/coverage.ts`. The owner
# sees this report on the laptop and the app's verdict on the phone; if the
# two disagree, one of them is lying and there is no way to tell which.
END_SHORT_S = 20   # quiet before you press stop is normal
END_OVER_S = 5     # running past the audio is not quiet, it is a mismatch
MAX_GAP_S = 20


def coverage_report(segments, duration_s, quiet=()):
    """The four assertions from spec section 6."""
    lines, ok = [], True
    if not segments:
        return False, ["FAIL  no segments transcribed"]

    last_end = segments[-1]["end"]
    if duration_s is None:
        lines.append("SKIP  no recorded duration in sidecar - cannot verify tail")
    else:
        short = int(round(duration_s - last_end))
        # Asymmetric on purpose. Stopping talking before you press stop is
        # normal; a transcript running PAST the audio is a mismatch.
        if short > END_SHORT_S or -short > END_OVER_S:
            ok = False
            lines.append("FAIL  last segment ends %s but recording is %s (%ss %s)"
                         % (mmss(last_end), mmss(duration_s), abs(short),
                            "short" if short > 0 else "over"))
        else:
            lines.append("PASS  last segment ends %s, recording %s"
                         % (mmss(last_end), mmss(duration_s)))

    def quiet_within(a, b):
        return sum(max(0.0, min(b, q1) - max(a, q0)) for q0, q1 in quiet)

    biggest, where, worst_noisy = 0, 0, 0
    for a, b in zip(segments, segments[1:]):
        gap = b["start"] - a["end"]
        if gap > biggest:
            biggest, where = gap, a["end"]
        # Silence is a fact about a walk, not a fault in a transcript. Only
        # sound that produced no words counts against it.
        noisy = gap - quiet_within(a["end"], b["start"])
        if noisy > worst_noisy:
            worst_noisy = noisy
    if worst_noisy > MAX_GAP_S:
        ok = False
        lines.append("FAIL  %ss of sound with no transcript, around %s"
                     % (int(worst_noisy), mmss(where)))
    elif quiet and biggest > MAX_GAP_S:
        lines.append("PASS  largest gap %ss, and the audio there was quiet" % int(biggest))
    else:
        lines.append("PASS  largest gap %ss" % int(biggest))

    monotonic = all(a["end"] <= b["start"] + 0.01 for a, b in zip(segments, segments[1:]))
    over = duration_s is not None and last_end > duration_s + END_OVER_S
    if monotonic and not over:
        lines.append("PASS  timestamps monotonic and within duration")
    else:
        ok = False
        lines.append("FAIL  timestamps out of order or beyond recorded duration")

    return ok, lines


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("--model", default="small.en",
                    help="small.en (default), medium.en for better accuracy, base.en for speed")
    ap.add_argument("--language", default="en")
    args = ap.parse_args()

    if not os.path.exists(args.audio):
        sys.exit("No such file: " + args.audio)

    markers, duration_s = load_markers(args.audio)
    opens = plant_timeline(markers) if markers else []
    subs = load_corrections(args.audio)
    tier = "verified" if markers else "unverified"

    print("Model %s - transcribing %s" % (args.model, os.path.basename(args.audio)))
    if markers:
        print("Sidecar found: %d markers, %d plant pages opened" % (len(markers), len(opens)))
    else:
        print("No sidecar found - transcript will be marked unverified")

    parts = walk_parts(args.audio)
    if len(parts) > 1:
        print("This walk was interrupted - %d recordings, transcribed in order:" % len(parts))
        for part in parts:
            print("   %s" % os.path.basename(part))

    model = WhisperModel(args.model, device="cpu", compute_type="int8")

    # Each part's timestamps start at zero, so they are shifted into walk time
    # as we go. Without this, part 2 would claim to start at 0:00 and every
    # marker offset would attribute to the wrong plant.
    segments, offset, info = [], 0.0, None
    for part in parts:
        raw, part_info = model.transcribe(part, language=args.language,
                                          vad_filter=True, beam_size=5)
        if info is None:
            info = part_info
        last_end = 0.0
        for s in raw:
            text = apply_corrections(s.text.strip(), subs)
            if text:
                segments.append({"start": offset + s.start,
                                 "end": offset + s.end,
                                 "text": text})
            last_end = max(last_end, s.end)
            print("\r  %s" % mmss(offset + s.end), end="", flush=True)
        offset += getattr(part_info, "duration", None) or last_end
    print()

    measured = audio_duration(parts)
    if measured:
        # The bigger of the two, never the smaller. A clock that fell behind is
        # ordinary; a clock running AHEAD of the audio would mean something
        # else entirely and is not quietly papered over here.
        if duration_s is None or measured > duration_s + 2:
            if duration_s is not None:
                print("  the walk's record says %s but the audio is %s - using the audio"
                      % (mmss(duration_s), mmss(measured)))
            duration_s = measured

    print("Measuring where the audio was quiet...")
    quiet = quiet_stretches(parts)
    if quiet:
        print("  %d quiet stretch%s found" % (len(quiet), "" if len(quiet) == 1 else "es"))
    else:
        # "found none" and "could not measure" are different facts, and the
        # second one matters: it means the app will judge gaps without this.
        print("  no stretch of quiet long enough to matter")

    if duration_s is None:
        duration_s = getattr(info, "duration", None)

    ok, report = coverage_report(segments, duration_s, quiet)

    out_path = os.path.splitext(args.audio)[0] + ".transcript.txt"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("session: %s\n" % os.path.basename(os.path.splitext(args.audio)[0]))
        f.write("transcript_tier: %s\n" % tier)
        f.write("model: faster-whisper %s\n" % args.model)
        f.write("duration_s: %s\n" % (int(duration_s) if duration_s else "unknown"))
        f.write("segments: %d\n" % len(segments))
        f.write("corrections_applied: %d\n" % len(subs))
        f.write("coverage: %s\n" % ("pass" if ok else "FAIL"))
        if len(parts) > 1:
            f.write("recordings: %d\n" % len(parts))
        # Where the audio itself was quiet. The app reads this so it can tell
        # "nobody was talking" from "someone was and Whisper missed it" - only
        # the second is a fault worth failing a walk over.
        if quiet:
            f.write("quiet: %s\n" % ", ".join("%.1f-%.1f" % (a, b) for a, b in quiet))
        f.write("\n")

        f.write("--- coverage report ---\n")
        for line in report:
            f.write(line + "\n")
        f.write("\n--- transcript ---\n")
        f.write("Attribution is the plant whose page was open at that offset.\n")
        f.write("It is evidence of what was on screen, not proof of what was discussed.\n\n")

        last_plant = "\x00"
        for s in segments:
            pid = attribute(s["start"], opens)
            if pid != last_plant:
                f.write("\n[%s]\n" % (pid if pid else "no plant page open"))
                last_plant = pid
            f.write("%s  %s\n" % (mmss(s["start"]), s["text"]))

    print("Wrote %s" % out_path)
    print("Coverage: %s" % ("pass" if ok else "FAIL - see the report at the top of the file"))
    if not ok:
        print("The app will accept it and flag the failures with replay buttons.")


if __name__ == "__main__":
    main()
