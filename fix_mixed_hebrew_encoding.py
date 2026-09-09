#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
מתקן קבצי SQL עם קידוד מעורב: טקסט שברובו UTF-8 תקין, אבל חלקים ספציפיים
(מילים בעברית שהוזרקו/הודבקו בטעות בקידוד חד-בייטי כמו ISO-8859-8) שבורים.

גרסה 2: מעבר יחיד על הקובץ (O(n), בייט אחר בייט) - בטוח ומהיר גם על
קבצים גדולים מאוד (לא מבצע ניסיונות פענוח חוזרים על המשך הקובץ).

שימוש:
    python fix_mixed_hebrew_encoding.py <input_file> [output_file]
"""
import sys


def utf8_seq_len(first_byte: int) -> int:
    """כמה בייטים אורך רצף UTF-8 שמתחיל בבייט הזה, או 0 אם לא בייט-מוביל תקין."""
    if first_byte < 0x80:
        return 1
    if 0xC2 <= first_byte <= 0xDF:
        return 2
    if 0xE0 <= first_byte <= 0xEF:
        return 3
    if 0xF0 <= first_byte <= 0xF4:
        return 4
    return 0  # לא בייט מוביל תקין (או 0x80-0xC1 שאסורים כבייט מוביל)


def is_valid_utf8_seq(data: bytes, start: int, length: int) -> bool:
    if start + length > len(data):
        return False
    try:
        data[start:start + length].decode("utf-8")
        return True
    except UnicodeDecodeError:
        return False


def fix_mixed_encoding(data: bytes) -> str:
    result = []
    i = 0
    n = len(data)
    bad_run_start = None

    def flush_bad_run(end):
        nonlocal bad_run_start
        if bad_run_start is not None and end > bad_run_start:
            chunk = data[bad_run_start:end]
            result.append(chunk.decode("iso-8859-8", errors="replace"))
        bad_run_start = None

    while i < n:
        b = data[i]
        seq_len = utf8_seq_len(b)
        if seq_len == 1:
            flush_bad_run(i)
            result.append(chr(b))
            i += 1
        elif seq_len > 1 and is_valid_utf8_seq(data, i, seq_len):
            flush_bad_run(i)
            result.append(data[i:i + seq_len].decode("utf-8"))
            i += seq_len
        else:
            # בייט לא-תקין כבייט מוביל UTF-8 - חלק מרצף שבור, נצבור אותו
            if bad_run_start is None:
                bad_run_start = i
            i += 1

    flush_bad_run(n)
    return "".join(result)


def main():
    if len(sys.argv) < 2:
        print("שימוש: python fix_mixed_hebrew_encoding.py <input_file> [output_file]")
        sys.exit(1)

    in_path = sys.argv[1]
    out_path = sys.argv[2] if len(sys.argv) > 2 else in_path.rsplit(".", 1)[0] + ".fixed.sql"

    with open(in_path, "rb") as f:
        raw = f.read()

    print(f"קורא {len(raw):,} בייטים...")
    fixed_text = fix_mixed_encoding(raw)

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(fixed_text)

    print(f"נכתב קובץ מתוקן: {out_path} ({len(fixed_text):,} תווים)")
    print("בדקי אותו לפני הרצה - חפשי תווי '?' או '�' שנשארו.")


if __name__ == "__main__":
    main()
