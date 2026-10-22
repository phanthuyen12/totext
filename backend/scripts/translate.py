import sys

import argostranslate.translate


def main():
    source = sys.argv[1].split("-")[0].split("_")[0].lower()
    text = sys.stdin.read()
    if not text.strip() or source == "vi":
        sys.stdout.write(text)
        return

    installed_languages = argostranslate.translate.get_installed_languages()
    source_language = next((lang for lang in installed_languages if lang.code == source), None)
    target_language = next((lang for lang in installed_languages if lang.code == "vi"), None)
    if source_language is None or target_language is None:
        raise RuntimeError(
            f"Chưa cài mô hình Argos {source}->vi. Cài gói ngôn ngữ Argos cho {source} và vi trước."
        )

    translation = source_language.get_translation(target_language)
    if translation is None:
        raise RuntimeError(f"Không tìm thấy mô hình Argos dịch {source}->vi")
    sys.stdout.write(translation.translate(text))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
