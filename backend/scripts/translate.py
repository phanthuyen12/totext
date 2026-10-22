import sys

from deep_translator import GoogleTranslator


def main():
    source = sys.argv[1].split("-")[0].split("_")[0].lower()
    text = sys.stdin.read()
    if not text.strip() or source == "vi":
        sys.stdout.write(text)
        return

    translated = GoogleTranslator(source=source, target="vi").translate(text)
    if not translated:
        raise RuntimeError("Google Translate trả về nội dung trống")
    sys.stdout.write(translated)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Lỗi dịch bằng Google Translate: {error}", file=sys.stderr)
        sys.exit(1)
