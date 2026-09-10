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
    r'^\s*create\s+or\s+replace\s+(package\s+body|package|procedure|function|trigger|type\s+body|type|synonym|force\s+view|view)\b',
    re.IGNORECASE,
)
# משפטים "פשוטים" (לא בלוק PL/SQL) - synonym/view מסתיימים כבר ב-';' עצמם
# במקור, בלי '/' בכלל; '/' שאנחנו מוסיפים גורם ל-DBeaver לנסות להריץ אותו
# כמשפט נפרד (ORA-00900). לעומת זאת: type (object, בלי body) מסתיים ב-')'
# *בלי* ';' - הוא חייב '/' (אין שום דבר אחר שמסמן את סוף ההצהרה). אושר ישירות
# מול קובץ המקור: synonym/view => אין '/' במקור; type object => יש '/' במקור.
SIMPLE_STATEMENT_RE = re.compile(
    r'^\s*create\s+or\s+replace\s+(synonym|force\s+view|view)\b',
    re.IGNORECASE,
)
START_DROP_RE = re.compile(
    r'^\s*create\s+(global\s+temporary\s+table|table|sequence|unique\s+index|index)\b',
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
    current_is_simple = False
    kept_count = 0
    i = 0
    n = len(lines)

    def close_block():
        # משפט פשוט (synonym/view/type) - בלי '/' (הוא כבר הסתיים ב-';').
        # בלוק PL/SQL (package/body/procedure/function/trigger) - עם '/'.
        if current_is_simple:
            out_lines.append("\n")
        else:
            out_lines.append("/\n\n")

    while i < n:
        line = lines[i]

        if PROMPT_RE.match(line):
            i += 1
            continue

        if not keeping:
            if START_KEEP_RE.match(line):
                keeping = True
                current_is_simple = bool(SIMPLE_STATEMENT_RE.match(line))
                kept_count += 1
                out_lines.append(line)
            # אם זו שורת CREATE TABLE/SEQUENCE/INDEX או כל שורה אחרת בזמן
            # שלא שומרים - פשוט מדלגים עליה
            i += 1
            continue

        # keeping == True: אנחנו בתוך הצהרת CREATE OR REPLACE שרוצים לשמור
        if START_DROP_RE.match(line) or START_KEEP_RE.match(line):
            # הגענו להצהרה חדשה בלי '/' מפריד - נסגור את הקודמת כאן
            close_block()
            if START_KEEP_RE.match(line):
                keeping = True
                current_is_simple = bool(SIMPLE_STATEMENT_RE.match(line))
                kept_count += 1
                out_lines.append(line)
            else:
                keeping = False
            i += 1
            continue

        if SLASH_ONLY_RE.match(line):
            if current_is_simple:
                # מדלגים על ה-'/' המיותר אחרי משפט פשוט (זה מה שגרם ל-ORA-00900
                # ב-DBeaver - הוא ניסה להריץ את ה-'/' כמשפט בפני עצמו)
                out_lines.append("\n")
            else:
                out_lines.append(line)
                out_lines.append("\n")
            keeping = False
            i += 1
            continue

        out_lines.append(line)
        i += 1

    # אם הקובץ נגמר באמצע שמירה - לסגור כראוי
    if keeping:
        close_block()

    with open(out_path, "w", encoding="utf-8") as f:
        f.writelines(out_lines)

    print(f"נשמרו {kept_count} הצהרות CREATE OR REPLACE.")


if __name__ == "__main__":
    main()
