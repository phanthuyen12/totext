import json
import sys

import argostranslate.translate as argos_translate


def main():
    source = sys.argv[1].split("-")[0].split("_")[0].lower()
    texts = json.loads(sys.stdin.read())
    if not isinstance(texts, list):
        raise ValueError("Expected a JSON array of subtitle texts")
    if source == "vi":
        sys.stdout.write(json.dumps(texts, ensure_ascii=False))
        return

    installed_languages = argos_translate.get_installed_languages()
    from_language = next((language for language in installed_languages if language.code == source), None)
    to_language = next((language for language in installed_languages if language.code == "vi"), None)
    if from_language is None or to_language is None:
        raise RuntimeError(
            f"Argos Translate language model {source}->vi is not installed. "
            "Install it with: python scripts/install_translation_model.py"
        )
    translation = from_language.get_translation(to_language)
    translated = [""] * len(texts)
    for index, text in enumerate(texts):
        text = str(text or "")
        if not text.strip():
            translated[index] = text
            continue
        translated[index] = translation.translate(text)
        if not translated[index]:
            raise RuntimeError(f"Argos Translate returned an empty result for subtitle cue {index + 1}")

    sys.stdout.write(json.dumps(translated, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Lỗi dịch bằng Google Translate: {error}", file=sys.stderr)
        sys.exit(1)
