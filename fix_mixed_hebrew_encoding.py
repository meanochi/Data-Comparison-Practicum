#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
מתקן קבצי SQL עם קידוד מעורב: טקסט שברובו UTF-8 תקין, אבל חלקים ספציפיים
(מילים בעברית שהוזרקו/הודבקו בטעות בקידוד חד-בייטי כמו ISO-8859-8) שבורים.

איך זה עובד: קורא את הקובץ כ-bytes, ומנסה לפרש UTF-8 בזרימה. בכל מקום
שהפענוח נכשל (רצף בייטים לא-תקין ל-UTF-8) - מפרש *רק* את הרצף הזה
כ-ISO-8859-8 (עברית חד-בייטית ישנה), ומשאיר את כל שאר הקובץ (שכבר תקין)
בלי לגעת בו.

שימוש:
    python fix_mixed_hebrew_encoding.py <input_file> [output_file]

אם לא מציינים output_file, נכתב קובץ חדש עם סיומת .fixed.sql
"""
import sys
import codecs


def fix_mixed_encoding(data: bytes) -> str:
    result = []
    i = 0
    n = len(data)
    while i < n:
        # ננסה לפענח כמה שיותר בייטים כ-UTF-8 תקין, בבת אחת
        # (כדי לא לפצל תווי UTF-8 מולטי-בייט תקינים לאמצע)
        ok_end = i
        try:
            # ננסה תת-מחרוזת גדולה, ואם נכשל נקצר בהדרגה
            chunk_end = n
            while chunk_end > i:
                try:
                    data[i:chunk_end].decode("utf-8")
                    ok_end = chunk_end
                    break
                except UnicodeDecodeError as e:
                    chunk_end = i + e.start
            if ok_end > i:
                result.append(data[i:ok_end].decode("utf-8"))
                i = ok_end
                continue
        except Exception:
            pass

        # אם הגענו לכאן - הבייט הנוכחי לא פותח רצף UTF-8 תקין.
        # נאסוף רצף רציף של בייטים "גבוהים" (0x80-0xFF) ונפרש אותו כ-ISO-8859-8.
        start = i
        while i < n and data[i] >= 0x80:
            i += 1
        if i > start:
            bad_chunk = data[start:i]
            try:
                decoded = bad_chunk.decode("iso-8859-8")
            except UnicodeDecodeError:
                decoded = bad_chunk.decode("iso-8859-8", errors="replace")
            result.append(decoded)
        else:
            # בייט בודד רגיל (ASCII) שנתקע - נוסיף כמו שהוא ונתקדם
            result.append(chr(data[i]))
            i += 1
    return "".join(result)


def main():
    if len(sys.argv) < 2:
        print("שימוש: python fix_mixed_hebrew_encoding.py <input_file> [output_file]")
        sys.exit(1)

    in_path = sys.argv[1]
    out_path = sys.argv[2] if len(sys.argv) > 2 else in_path.rsplit(".", 1)[0] + ".fixed.sql"

    with open(in_path, "rb") as f:
        raw = f.read()

    fixed_text = fix_mixed_encoding(raw)

    with codecs.open(out_path, "w", encoding="utf-8") as f:
        f.write(fixed_text)

    print(f"נכתב קובץ מתוקן: {out_path}")
    print("בדקי אותו לפני הרצה - חפשי בקובץ תווי '?' או '�' שנשארו (אם יש, יש עוד קטע לתקן ידנית).")


if __name__ == "__main__":
    main()
