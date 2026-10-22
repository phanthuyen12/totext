import json
import sys
import time

from deep_translator import GoogleTranslator


def main():
    source = sys.argv[1].split("-")[0].split("_")[0].lower()
    texts = json.loads(sys.stdin.read())
    if not isinstance(texts, list):
        raise ValueError("Expected a JSON array of subtitle texts")
    if source == "vi":
        sys.stdout.write(json.dumps(texts, ensure_ascii=False))
        return

    translator = GoogleTranslator(source=source, target="vi")
    translated = [""] * len(texts)
    for index, text in enumerate(texts):
        text = str(text or "")
        if not text.strip():
            translated[index] = text
            continue
        if len(text) > 4500:
            raise ValueError(f"Subtitle cue {index + 1} exceeds the Google Translate character limit")
        for attempt in range(4):
            try:
                translated[index] = translator.translate(text)
                if not translated[index]:
                    raise RuntimeError("Google Translate returned an empty result")
                break
            except Exception:
                if attempt == 3:
                    raise
                time.sleep(2 ** (attempt + 1))
        if index + 1 < len(texts):
            time.sleep(1.2)

    sys.stdout.write(json.dumps(translated, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Lỗi dịch bằng Google Translate: {error}", file=sys.stderr)
        sys.exit(1)
