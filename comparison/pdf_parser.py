# -*- coding: utf-8 -*-
"""פענוח קובץ PDF - דו"ח סיכום נתוני פרישה.

מחלץ את מספר הזהות מכותרת הדו"ח ואת טבלת "פירוט תקופות עבודה".

הערה על עברית ב-PDF: חילוץ הטקסט מחזיר עברית בסדר חזותי (הפוך),
בעוד שרצפי ספרות נשארים בסדר לוגי. למשל "פחות מ-1/3" מחולץ
כ-"1/3-מ תוחפ". הפונקציה to_visual ממירה תווית לוגית לצורה החזותית
כדי שנוכל להשוות מול הטקסט המחולץ.
"""
import re
from dataclasses import dataclass, field

import pdfplumber


@dataclass
class PdfPeriod:
    """שורה אחת מטבלת פירוט תקופות עבודה."""
    tkufa_label: str        # סוג תקופה (עברית לוגית)
    start: str              # DDMMYYYY
    end: str                # DDMMYYYY
    months: float           # אורך שירות בחודשים
    zchuyot_label: str      # סוג זכויות לפנסיה (עברית לוגית)
    heikef: float           # היקף משרה
    mekadem: float          # מקדם אם (לא מושווה - אין מקבילה ב-DAT)
    page: int


@dataclass
class PdfParseResult:
    id_number: str = None
    periods: list = field(default_factory=list)
    warnings: list = field(default_factory=list)
    errors: list = field(default_factory=list)


def _reverse_keep_digits(s: str) -> str:
    """היפוך מחרוזת תוך שמירת רצפי ספרות (וסימנים כמו / % .) בסדר המקורי."""
    tokens = re.findall(r"[0-9/.%()]+|[^0-9/.%()]+", s)
    return "".join(
        tok if re.match(r"[0-9/.%()]", tok) else tok[::-1]
        for tok in reversed(tokens)
    )


def to_visual(logical: str) -> str:
    """תווית עברית לוגית -> הצורה שבה היא מופיעה בטקסט המחולץ מה-PDF."""
    return _reverse_keep_digits(logical)


def to_logical(visual: str) -> str:
    """טקסט מחולץ (חזותי) -> עברית לוגית. פעולה סימטרית להיפוך."""
    return _reverse_keep_digits(visual)


def normalize_dashes(s: str) -> str:
    """נרמול מקפים מסוגים שונים (כולל מקף רך U+00AD ומקף עברי) למקף רגיל."""
    return re.sub(r"[­־‐-―]", "-", s)


# שורת טבלה בטקסט המחולץ (משמאל לימין):
# מקדם | היקף משרה | סוג זכויות | אורך שירות | תאריך עד | מתאריך | סוג תקופה
ROW_RE = re.compile(
    r"^([\d.]+)\s+([\d.]+)\s+(\S.*?)\s+([\d.]+)\s+"
    r"(\d{2}-\d{2}-\d{4})\s+(\d{2}-\d{2}-\d{4})\s+(\S.*)$"
)

# "מספר זהות: 12345678" - בטקסט החזותי התווית הפוכה והמספר לפניה
ID_RE = re.compile(r"(\d{5,9})\s*:" + re.escape(to_visual("מספר זהות")))


def parse_pdf_file(path: str) -> PdfParseResult:
    result = PdfParseResult()
    try:
        with pdfplumber.open(path) as pdf:
            for page_no, page in enumerate(pdf.pages, start=1):
                text = page.extract_text() or ""
                _parse_page_text(text, page_no, result)
    except Exception as exc:  # קובץ פגום, מוצפן וכו'
        result.errors.append(f"שגיאה בקריאת ה-PDF: {exc}")
        return result

    if result.id_number is None:
        result.errors.append('לא נמצא "מספר זהות" בכותרת הדו"ח')
    if not result.periods:
        result.errors.append('לא נמצאו שורות בטבלת "פירוט תקופות עבודה"')
    return result


def _parse_page_text(text: str, page_no: int, result: PdfParseResult):
    for line in text.splitlines():
        line = normalize_dashes(line.strip())
        if result.id_number is None:
            m = ID_RE.search(line)
            if m:
                result.id_number = m.group(1).lstrip("0")
        m = ROW_RE.match(line)
        if not m:
            continue
        mekadem, heikef, zchuyot_vis, months, end, start, tkufa_vis = m.groups()
        try:
            result.periods.append(PdfPeriod(
                tkufa_label=to_logical(tkufa_vis.strip()),
                start=start.replace("-", ""),
                end=end.replace("-", ""),
                months=float(months),
                zchuyot_label=to_logical(zchuyot_vis.strip()),
                heikef=float(heikef),
                mekadem=float(mekadem),
                page=page_no,
            ))
        except ValueError as exc:
            result.warnings.append(f"עמוד {page_no}: שורת טבלה לא תקינה ({exc})")
