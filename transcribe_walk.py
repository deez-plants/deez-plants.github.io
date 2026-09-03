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


def mmss(seconds):
    seconds = int(round(seconds))
    return "%d:%02d" % (seconds // 60, seconds % 60)


def coverage_report(segments, duration_s):
    """The four assertions from spec section 6."""
    lines, ok = [], True
    if not segments:
        return False, ["FAIL  no segments transcribed"]

    last_end = segments[-1]["end"]
    if duration_s is None:
        lines.append("SKIP  no recorded duration in sidecar - cannot verify tail")
    elif abs(last_end - duration_s) <= 5:
        lines.append("PASS  last segment ends %s, recording %s" % (mmss(last_end), mmss(duration_s)))
    else:
        ok = False
        lines.append("FAIL  last segment ends %s but recording is %s (gap %ss)"
                     % (mmss(last_end), mmss(duration_s), int(abs(last_end - duration_s))))

    biggest, where = 0, 0
    for a, b in zip(segments, segments[1:]):
        gap = b["start"] - a["end"]
        if gap > biggest:
            biggest, where = gap, a["end"]
    if biggest > 20:
        ok = False
        lines.append("FAIL  %ss untranscribed gap at %s" % (int(biggest), mmss(where)))
    else:
        lines.append("PASS  largest gap %ss" % int(biggest))

    monotonic = all(a["end"] <= b["start"] + 0.01 for a, b in zip(segments, segments[1:]))
    over = duration_s is not None and last_end > duration_s + 5
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

    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    raw, info = model.transcribe(args.audio, language=args.language,
                                 vad_filter=True, beam_size=5)

    segments = []
    for s in raw:
        text = apply_corrections(s.text.strip(), subs)
        if text:
            segments.append({"start": s.start, "end": s.end, "text": text})
        print("\r  %s" % mmss(s.end), end="", flush=True)
    print()

    if duration_s is None:
        duration_s = getattr(info, "duration", None)

    ok, report = coverage_report(segments, duration_s)

    out_path = os.path.splitext(args.audio)[0] + ".transcript.txt"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("session: %s\n" % os.path.basename(os.path.splitext(args.audio)[0]))
        f.write("transcript_tier: %s\n" % tier)
        f.write("model: faster-whisper %s\n" % args.model)
        f.write("duration_s: %s\n" % (int(duration_s) if duration_s else "unknown"))
        f.write("segments: %d\n" % len(segments))
        f.write("corrections_applied: %d\n" % len(subs))
        f.write("coverage: %s\n\n" % ("pass" if ok else "FAIL"))

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
