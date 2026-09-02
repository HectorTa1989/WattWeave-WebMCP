"""Step 2 of the Remotion demo pipeline: neural voiceover + timed captions.

Reads a JSON array of {"id", "text"} on stdin, synthesizes each beat with an
Edge neural voice, and writes <id>.mp3 next to a JSON manifest containing the
real audio duration and short caption cues. The service reports sentence
boundaries with exact offsets; each sentence is then split into short cues
proportionally to its characters, so the small subtitle strip tracks the voice.
"""

import asyncio
import json
import os
import sys

import edge_tts

VOICE = os.environ.get("DEMO_VOICE", "en-US-AndrewMultilingualNeural")
RATE = os.environ.get("DEMO_RATE", "+4%")
OUT_DIR = sys.argv[1]
MAX_CHARS = 48


def split_words(sentence):
    """Break one sentence into short caption lines at word boundaries."""
    lines, current = [], []
    for word in sentence.split():
        candidate = " ".join(current + [word])
        if current and len(candidate) > MAX_CHARS:
            lines.append(" ".join(current))
            current = [word]
        else:
            current.append(word)
    if current:
        lines.append(" ".join(current))
    return lines


def cues_for(sentences):
    cues = []
    for sentence in sentences:
        lines = split_words(sentence["text"])
        total = sum(len(line) for line in lines) or 1
        span = sentence["end"] - sentence["start"]
        at = sentence["start"]
        for line in lines:
            take = span * (len(line) / total)
            cues.append({"text": line, "start": at, "end": at + take})
            at += take
    return cues


async def synth(beat):
    path = os.path.join(OUT_DIR, beat["id"] + ".mp3")
    communicate = edge_tts.Communicate(beat["text"], VOICE, rate=RATE)
    sentences = []
    with open(path, "wb") as fh:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                fh.write(chunk["data"])
            elif chunk["type"] in ("SentenceBoundary", "WordBoundary"):
                sentences.append(
                    {
                        "text": chunk["text"],
                        "start": chunk["offset"] / 1e7,
                        "end": (chunk["offset"] + chunk["duration"]) / 1e7,
                    }
                )
    cues = cues_for(sentences)
    if not cues:
        raise SystemExit("no boundary events for " + beat["id"])
    return {
        "id": beat["id"],
        "audio": "audio/" + beat["id"] + ".mp3",
        "duration": cues[-1]["end"] + 0.3,
        "cues": cues,
    }


async def main():
    beats = json.load(sys.stdin)
    os.makedirs(OUT_DIR, exist_ok=True)
    out = []
    for beat in beats:
        out.append(await synth(beat))
        print("voiced " + beat["id"], file=sys.stderr)
    json.dump(out, sys.stdout, indent=2)


asyncio.run(main())
