# -*- coding: utf-8 -*-
"""פענוח קובץ DAT (ממשק לאוצר).

הקובץ מופרד בתו '~' ומקודד בקידוד עברי ישן (IBM/DOS-862).
בשלב זה מפוענחות רק שורות שמתחילות ב-9050 (תקופות עבודה).

מבנה שורת 9050 (לפי סדר השדות בקובץ):
    0: קוד רשומה (9050)
    1: לא ידוע
    2: לא ידוע
    3: מספר זהות
    4: לא ידוע
    5: קוד סוג תקופה
    6: תאריך התחלה (DDMMYYYY)
    7: תאריך סיום (DDMMYYYY)
    8: אורך שירות בחודשים כפול 100 (למשל 01200 = 12 חודשים)
    9: קוד סוג זכויות
   10: היקף משרה כפול 1000 (למשל 0667 = 0.667)
"""
from dataclasses import dataclass, field

ENCODINGS = ("cp862", "iso-8859-8", "utf-8")
MIN_9050_FIELDS = 11


@dataclass
class DatPeriod:
    """תקופת עבודה אחת משורת 9050."""
    id_number: str          # מספר זהות מנורמל (ללא אפסים מובילים)
    sug_tkufa: int          # קוד סוג תקופה
    start: str              # DDMMYYYY
    end: str                # DDMMYYYY
    months: float           # אורך שירות בחודשים
    sug_zchuyot: int        # קוד סוג זכויות
    heikef: float           # היקף משרה (0-1)
    line_number: int        # מספר שורה בקובץ, להודעות שגיאה


@dataclass
class DatParseResult:
    periods_by_id: dict = field(default_factory=dict)   # id -> [DatPeriod]
    warnings: list = field(default_factory=list)
    errors: list = field(default_factory=list)


def normalize_id(raw):
    """נרמול מספר זהות: הסרת רווחים ואפסים מובילים (ב-PDF מודפס ללא אפס מוביל)."""
    return raw.strip().lstrip("0")


def decode_dat(data: bytes) -> str:
    """פענוח בייטים של קובץ DAT. מנסה קידוד DOS-862 (הרגיל) ואז חלופות."""
    for enc in ENCODINGS:
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    # קידוד לא מזוהה - פענוח סלחני כדי שהשורות המספריות עדיין יעבדו
    return data.decode("cp862", errors="replace")


def parse_dat_bytes(data: bytes) -> DatParseResult:
    result = DatParseResult()
    text = decode_dat(data)
    for line_no, line in enumerate(text.splitlines(), start=1):
        if not line.startswith("9050~"):
            continue
        fields = line.rstrip().split("~")
        if len(fields) < MIN_9050_FIELDS:
            result.errors.append(
                f"שורה {line_no}: שורת 9050 עם {len(fields)} שדות בלבד "
                f"(נדרשים {MIN_9050_FIELDS}) - השורה דולגה"
            )
            continue
        try:
            period = DatPeriod(
                id_number=normalize_id(fields[3]),
                sug_tkufa=int(fields[5]),
                start=fields[6].strip(),
                end=fields[7].strip(),
                months=int(fields[8]) / 100.0,
                sug_zchuyot=int(fields[9]),
                heikef=int(fields[10]) / 1000.0,
                line_number=line_no,
            )
        except ValueError as exc:
            result.errors.append(f"שורה {line_no}: ערך לא מספרי בשורת 9050 ({exc}) - השורה דולגה")
            continue
        result.periods_by_id.setdefault(period.id_number, []).append(period)

    # בדיקת שפיות: לא אמורות להיות שתי תקופות עם אותם תאריכי התחלה וסיום לאותה ת"ז
    for id_number, periods in result.periods_by_id.items():
        seen = {}
        for p in periods:
            key = (p.start, p.end)
            if key in seen:
                result.warnings.append(
                    f'ת"ז {id_number}: נמצאו שתי תקופות עם אותם תאריכים '
                    f"({fmt_date(p.start)} - {fmt_date(p.end)}, שורות {seen[key]} ו-{p.line_number}). "
                    f"ההשוואה עבור התקופה הזו עלולה להיות שגויה."
                )
            else:
                seen[key] = p.line_number
    return result


def parse_dat_file(path: str) -> DatParseResult:
    with open(path, "rb") as f:
        return parse_dat_bytes(f.read())


def fmt_date(ddmmyyyy: str) -> str:
    """DDMMYYYY -> DD/MM/YYYY לתצוגה."""
    if len(ddmmyyyy) == 8:
        return f"{ddmmyyyy[:2]}/{ddmmyyyy[2:4]}/{ddmmyyyy[4:]}"
    return ddmmyyyy
