#!/usr/bin/env python3
"""Transcribe a single audio file with faster-whisper, printing JSON to stdout.

Usage: transcribe.py <audio_path> [model] [device] [compute_type]

Loads the model fresh on every call (simple, but slow for high-throughput use —
swap for a long-running model server if you need low latency at scale).
"""
import json
import sys
import wave

import numpy as np


def load_wav_as_float32(path):
    """Reads a 16-bit PCM WAV file into a float32 numpy array in [-1, 1].

    Bypasses faster-whisper's PyAV-based decode_audio() entirely — we always
    feed it a WAV produced by ffmpeg (16kHz mono), so decoding it ourselves
    avoids depending on a PyAV version matching what this faster-whisper
    release expects.
    """
    with wave.open(path, "rb") as wf:
        if wf.getsampwidth() != 2:
            raise ValueError(f"Expected 16-bit PCM WAV, got sampwidth={wf.getsampwidth()}")
        raw = wf.readframes(wf.getnframes())
        channels = wf.getnchannels()

    audio = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    if channels > 1:
        audio = audio.reshape(-1, channels).mean(axis=1)
    return audio


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "missing audio_path argument"}), file=sys.stderr)
        sys.exit(1)

    audio_path = sys.argv[1]
    model_size = sys.argv[2] if len(sys.argv) > 2 else "small"
    device = sys.argv[3] if len(sys.argv) > 3 else "cpu"
    compute_type = sys.argv[4] if len(sys.argv) > 4 else "int8"

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print(
            json.dumps(
                {
                    "error": "faster-whisper is not installed. Run: pip install -r requirements.txt"
                }
            ),
            file=sys.stderr,
        )
        sys.exit(1)

    model = WhisperModel(model_size, device=device, compute_type=compute_type)
    audio = load_wav_as_float32(audio_path)
    segments_iter, info = model.transcribe(audio, vad_filter=True)

    segments = [
        {"start": round(s.start, 3), "end": round(s.end, 3), "text": s.text.strip()}
        for s in segments_iter
    ]

    print(
        json.dumps(
            {
                "language": info.language,
                "language_probability": round(info.language_probability, 3),
                "segments": segments,
            }
        )
    )


if __name__ == "__main__":
    main()
