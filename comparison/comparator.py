# -*- coding: utf-8 -*-
"""השוואת תקופות עבודה בין קובץ DAT לקבצי PDF.

ההתאמה בין שורות נעשית לפי מפתח (תאריך התחלה, תאריך סיום),
ולאחר מכן מושווים: סוג תקופה, אורך שירות, סוג זכויות והיקף משרה.
"""
from dataclasses import dataclass, field

from .dat_parser import fmt_date
from .mappings import (
    EXCLUDED_TKUFA_CODES,
    PDF_TKUFA_LABELS,
    PDF_ZCHUYOT_LABELS,
    SABBATICAL_LABEL,
    SABBATICAL_TKUFA_CODE,
    SABBATICAL_ZCHUYOT_CODE,
    SUG_TKUFA,
    SUG_ZCHUYOT,
)

MONTHS_TOLERANCE = 0.001
HEIKEF_TOLERANCE = 0.0005

# סטטוסים לשורה בודדת
ROW_MATCH = "match"           # כל השדות זהים
ROW_DIFF = "diff"             # נמצאה אי-התאמה בשדות
ROW_DAT_ONLY = "dat_only"     # תקופה שקיימת רק ב-DAT
ROW_PDF_ONLY = "pdf_only"     # תקופה שקיימת רק ב-PDF


@dataclass
class FieldDiff:
    field_name: str     # שם השדה בעברית
    pdf_value: str
    dat_value: str


@dataclass
class RowResult:
    status: str
    start: str = None
    end: str = None
    diffs: list = field(default_factory=list)   # [FieldDiff]
    pdf_row: dict = None
    dat_row: dict = None

    @property
    def start_display(self):
        return fmt_date(self.start) if self.start else ""

    @property
    def end_display(self):
        return fmt_date(self.end) if self.end else ""


@dataclass
class IdResult:
    """תוצאת השוואה עבור מספר זהות אחד."""
    id_number: str
    status: str                 # 'match' / 'mismatch' / 'missing_pdf' / 'missing_dat' / 'error'
    pdf_file: str = None
    total_compared: int = 0     # מספר התקופות שהושוו
    matched: int = 0            # מכללן - כמה זהות לחלוטין
    rows: list = field(default_factory=list)        # [RowResult]
    excluded: list = field(default_factory=list)    # שורות עזיבה שלא הושוו
    warnings: list = field(default_factory=list)
    errors: list = field(default_factory=list)

    @property
    def percent(self):
        if self.total_compared == 0:
            return 0.0
        return round(100.0 * self.matched / self.total_compared, 1)

    @property
    def mismatch_count(self):
        return self.total_compared - self.matched


def _dat_row_dict(d):
    return {
        "sug_tkufa": d.sug_tkufa,
        "sug_tkufa_teur": SUG_TKUFA.get(d.sug_tkufa, f"קוד לא מוכר ({d.sug_tkufa})"),
        "start": d.start,
        "end": d.end,
        "months": d.months,
        "sug_zchuyot": d.sug_zchuyot,
        "sug_zchuyot_teur": SUG_ZCHUYOT.get(d.sug_zchuyot, f"קוד לא מוכר ({d.sug_zchuyot})"),
        "heikef": d.heikef,
    }


def _pdf_row_dict(p):
    return {
        "tkufa_label": p.tkufa_label,
        "start": p.start,
        "end": p.end,
        "months": p.months,
        "zchuyot_label": p.zchuyot_label,
        "heikef": p.heikef,
        "mekadem": p.mekadem,
    }


def _compare_row(pdf_row, dat_row, warnings):
    """השוואת שורה בודדת. מחזיר רשימת FieldDiff (ריקה = זהה)."""
    diffs = []

    # סוג תקופה. כלל מיוחד: "שבתון" ב-PDF = קוד 2 + זכויות 67 ב-DAT
    if pdf_row.tkufa_label == SABBATICAL_LABEL:
        ok = (dat_row.sug_tkufa == SABBATICAL_TKUFA_CODE
              and dat_row.sug_zchuyot == SABBATICAL_ZCHUYOT_CODE)
        if not ok:
            diffs.append(FieldDiff(
                "סוג תקופה",
                pdf_value="שבתון",
                dat_value=f"{dat_row.sug_tkufa} ({SUG_TKUFA.get(dat_row.sug_tkufa, 'לא מוכר')}) "
                          f"+ זכויות {dat_row.sug_zchuyot}",
            ))
    else:
        allowed = PDF_TKUFA_LABELS.get(pdf_row.tkufa_label)
        if allowed is None:
            warnings.append(
                f'תווית סוג תקופה לא מוכרת ב-PDF: "{pdf_row.tkufa_label}" '
                f"(תקופה {fmt_date(pdf_row.start)} - {fmt_date(pdf_row.end)}) - נדרש עדכון מיפוי"
            )
            diffs.append(FieldDiff(
                "סוג תקופה",
                pdf_value=f"{pdf_row.tkufa_label} (תווית לא מוכרת)",
                dat_value=f"{dat_row.sug_tkufa} ({SUG_TKUFA.get(dat_row.sug_tkufa, 'לא מוכר')})",
            ))
        elif dat_row.sug_tkufa not in allowed:
            diffs.append(FieldDiff(
                "סוג תקופה",
                pdf_value=pdf_row.tkufa_label,
                dat_value=f"{dat_row.sug_tkufa} ({SUG_TKUFA.get(dat_row.sug_tkufa, 'לא מוכר')})",
            ))

    # אורך שירות (חודשים)
    if abs(pdf_row.months - dat_row.months) > MONTHS_TOLERANCE:
        diffs.append(FieldDiff("אורך שירות (חודשים)",
                               pdf_value=f"{pdf_row.months:g}",
                               dat_value=f"{dat_row.months:g}"))

    # סוג זכויות
    allowed_z = PDF_ZCHUYOT_LABELS.get(pdf_row.zchuyot_label)
    if allowed_z is None:
        warnings.append(
            f'תווית סוג זכויות לא מוכרת ב-PDF: "{pdf_row.zchuyot_label}" '
            f"(תקופה {fmt_date(pdf_row.start)} - {fmt_date(pdf_row.end)}) - נדרש עדכון מיפוי"
        )
        diffs.append(FieldDiff(
            "סוג זכויות",
            pdf_value=f"{pdf_row.zchuyot_label} (תווית לא מוכרת)",
            dat_value=f"{dat_row.sug_zchuyot} ({SUG_ZCHUYOT.get(dat_row.sug_zchuyot, 'לא מוכר')})",
        ))
    elif dat_row.sug_zchuyot not in allowed_z:
        diffs.append(FieldDiff(
            "סוג זכויות",
            pdf_value=pdf_row.zchuyot_label,
            dat_value=f"{dat_row.sug_zchuyot} ({SUG_ZCHUYOT.get(dat_row.sug_zchuyot, 'לא מוכר')})",
        ))

    # היקף משרה
    if abs(pdf_row.heikef - dat_row.heikef) > HEIKEF_TOLERANCE:
        diffs.append(FieldDiff("היקף משרה",
                               pdf_value=f"{pdf_row.heikef:.3f}",
                               dat_value=f"{dat_row.heikef:.3f}"))
    return diffs


def compare_id(id_number, dat_periods, pdf_result, pdf_file=None):
    """השוואת כל התקופות של מספר זהות אחד."""
    res = IdResult(id_number=id_number, status="match", pdf_file=pdf_file)
    if pdf_result is not None:
        res.warnings.extend(pdf_result.warnings)
        res.errors.extend(pdf_result.errors)

    dat_periods = dat_periods or []
    active = [d for d in dat_periods if d.sug_tkufa not in EXCLUDED_TKUFA_CODES]
    res.excluded = [_dat_row_dict(d) for d in dat_periods
                    if d.sug_tkufa in EXCLUDED_TKUFA_CODES]

    if pdf_result is None:
        res.status = "missing_pdf"
        res.rows = [RowResult(ROW_DAT_ONLY, d.start, d.end, dat_row=_dat_row_dict(d))
                    for d in active]
        return res
    if not dat_periods:
        res.status = "missing_dat"
        res.rows = [RowResult(ROW_PDF_ONLY, p.start, p.end, pdf_row=_pdf_row_dict(p))
                    for p in pdf_result.periods]
        return res
    if pdf_result.errors:
        res.status = "error"
        return res

    pdf_map = {(p.start, p.end): p for p in pdf_result.periods}
    matched_keys = set()

    for d in active:
        key = (d.start, d.end)
        p = pdf_map.get(key)
        res.total_compared += 1
        if p is None:
            res.rows.append(RowResult(ROW_DAT_ONLY, d.start, d.end,
                                      dat_row=_dat_row_dict(d)))
            continue
        matched_keys.add(key)
        diffs = _compare_row(p, d, res.warnings)
        status = ROW_MATCH if not diffs else ROW_DIFF
        if not diffs:
            res.matched += 1
        res.rows.append(RowResult(status, d.start, d.end, diffs=diffs,
                                  pdf_row=_pdf_row_dict(p), dat_row=_dat_row_dict(d)))

    for p in pdf_result.periods:
        if (p.start, p.end) not in matched_keys:
            res.total_compared += 1
            res.rows.append(RowResult(ROW_PDF_ONLY, p.start, p.end,
                                      pdf_row=_pdf_row_dict(p)))

    # מיון לפי תאריך התחלה (YYYYMMDD) מהחדש לישן, כמו בדו"ח
    res.rows.sort(key=lambda r: (r.start or "")[4:] + (r.start or "")[2:4] + (r.start or "")[:2],
                  reverse=True)
    res.status = "match" if res.matched == res.total_compared else "mismatch"
    return res


def compare_all(dat_result, pdf_results):
    """השוואה מלאה: קובץ DAT מול רשימת (שם קובץ, PdfParseResult).

    מחזיר (רשימת IdResult ממוינת, רשימת אזהרות כלליות).
    """
    results = []
    warnings = list(dat_result.warnings)
    if dat_result.errors:
        warnings.extend(dat_result.errors)

    pdf_by_id = {}
    for fname, pres in pdf_results:
        if pres.id_number is None:
            results.append(IdResult(id_number=f"? ({fname})", status="error",
                                    pdf_file=fname, errors=list(pres.errors)))
            continue
        if pres.id_number in pdf_by_id:
            warnings.append(f'ת"ז {pres.id_number}: הועלה יותר מקובץ PDF אחד - נלקח הראשון ({pdf_by_id[pres.id_number][0]})')
            continue
        pdf_by_id[pres.id_number] = (fname, pres)

    all_ids = sorted(set(dat_result.periods_by_id) | set(pdf_by_id))
    for id_number in all_ids:
        fname, pres = pdf_by_id.get(id_number, (None, None))
        results.append(compare_id(
            id_number,
            dat_result.periods_by_id.get(id_number),
            pres,
            pdf_file=fname,
        ))
    # קודם אי-התאמות ושגיאות, אחר כך חסרים, ובסוף התאמות מלאות
    order = {"error": 0, "mismatch": 1, "missing_pdf": 2, "missing_dat": 3, "match": 4}
    results.sort(key=lambda r: (order.get(r.status, 9), r.id_number))
    return results, warnings
