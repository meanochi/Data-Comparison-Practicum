#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
מסנן קובץ SQL גדול כך שיישארו רק בלוקי CREATE OR REPLACE (חבילות, גופי
חבילות, פרוצדורות, פונקציות, טריגרים, types, synonyms) - בטוחים להרצה גם
כשהאובייקט כבר קיים. מסיר CREATE TABLE / CREATE SEQUENCE / CREATE INDEX
(לא "OR REPLACE") וגם שורות 'prompt' (SQL*Plus בלבד, לא SQL תקין).

עובד שורה-אחר-שורה (לא לפי בלוקים מופרדי '/'), כדי לתפוס נכון גם מקרים בהם
כמה הצהרות "נצמדות" זו לזו בלי '/' ביניהן (כמו הרבה CREATE TABLE ברצף,
או CREATE OR REPLACE SYNONYM/TYPE קצרים).

שימוש:
    python filter_replace_only.py <input_file> <output_file>
"""
import sys
import re

START_KEEP_RE = re.compile(
    r'^\s*create\s+or\s+replace\s+(package\s+body|package|procedure|function|trigger|type|synonym)\b',
    re.IGNORECASE,
)
START_DROP_RE = re.compile(
    r'^\s*create\s+(table|sequence|index|unique\s+index)\b',
    re.IGNORECASE,
)
PROMPT_RE = re.compile(r'^\s*prompt\b', re.IGNORECASE)
SLASH_ONLY_RE = re.compile(r'^\s*/\s*$')


def main():
    if len(sys.argv) != 3:
        print("שימוש: python filter_replace_only.py <input_file> <output_file>")
        sys.exit(1)

    in_path, out_path = sys.argv[1], sys.argv[2]

    with open(in_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    out_lines = []
    keeping = False
    kept_count = 0
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]

        if PROMPT_RE.match(line):
            i += 1
            continue

        if not keeping:
            if START_KEEP_RE.match(line):
                keeping = True
                kept_count += 1
                out_lines.append(line)
            # אם זו שורת CREATE TABLE/SEQUENCE/INDEX או כל שורה אחרת בזמן
            # שלא שומרים - פשוט מדלגים עליה
            i += 1
            continue

        # keeping == True: אנחנו בתוך הצהרת CREATE OR REPLACE שרוצים לשמור
        if START_DROP_RE.match(line) or START_KEEP_RE.match(line):
            # הגענו להצהרה חדשה בלי '/' מפריד - נסגור את הקודמת כאן
            out_lines.append("/\n\n")
            if START_KEEP_RE.match(line):
                keeping = True
                kept_count += 1
                out_lines.append(line)
            else:
                keeping = False
            i += 1
            continue

        if SLASH_ONLY_RE.match(line):
            out_lines.append(line)
            out_lines.append("\n")
            keeping = False
            i += 1
            continue

        out_lines.append(line)
        i += 1

    # אם הקובץ נגמר באמצע שמירה (בלי '/' סוגר) - נוסיף '/' בסוף
    if keeping:
        out_lines.append("\n/\n")

    with open(out_path, "w", encoding="utf-8") as f:
        f.writelines(out_lines)

    print(f"נשמרו {kept_count} הצהרות CREATE OR REPLACE.")


if __name__ == "__main__":
    main()
