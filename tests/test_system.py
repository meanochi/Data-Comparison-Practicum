# -*- coding: utf-8 -*-
"""בדיקות מערכת: פענוח DAT, פענוח PDF והשוואה, על קבצי הדוגמה."""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from comparison.comparator import (
    ROW_DAT_ONLY, ROW_DIFF, ROW_MATCH, ROW_PDF_ONLY, compare_all,
)
from comparison.dat_parser import parse_dat_bytes, parse_dat_file
from comparison.pdf_parser import parse_pdf_file, to_logical, to_visual
from scripts.generate_samples import main as generate_samples

SAMPLES = os.path.join(os.path.dirname(__file__), "..", "samples")


@pytest.fixture(scope="module", autouse=True)
def ensure_samples():
    """יצירת קבצי הדוגמה אם אינם קיימים."""
    if not os.path.exists(os.path.join(SAMPLES, "sample.dat")):
        generate_samples(SAMPLES)


@pytest.fixture(scope="module")
def results():
    dat = parse_dat_file(os.path.join(SAMPLES, "sample.dat"))
    pdfs = []
    for fname in sorted(os.listdir(SAMPLES)):
        if fname.endswith(".pdf"):
            pdfs.append((fname, parse_pdf_file(os.path.join(SAMPLES, fname))))
    res_list, warnings = compare_all(dat, pdfs)
    return {r.id_number: r for r in res_list}, warnings


# ---------- פענוח בסיסי ----------

def test_visual_logical_roundtrip():
    for label in ["פחות מ-1/3", 'חל"ת', "נושא זכויות", "שבתון", "הפעלת סעיף 99"]:
        assert to_logical(to_visual(label)) == label
    # ספרות נשארות בסדר לוגי בצורה החזותית
    assert to_visual("פחות מ-1/3").startswith("1/3")


def test_dat_parsing():
    dat = parse_dat_file(os.path.join(SAMPLES, "sample.dat"))
    assert set(dat.periods_by_id) == {"12345678", "23456789", "34567890"}
    p = dat.periods_by_id["12345678"][0]
    assert p.sug_tkufa == 9999
    assert p.start == "01092010" and p.end == "31082015"
    assert p.months == 60.0
    assert p.sug_zchuyot == 2
    assert p.heikef == 1.0
    assert not dat.errors and not dat.warnings


def test_dat_bad_lines_reported():
    data = (
        "9050~0~1099~012345678~0~9999~01092010~31082015~06000~02~1000\r\n"
        "9050~0~1099~012345678~0~XXXX~01092015~31082016~01200~68~1000\r\n"  # לא מספרי
        "9050~0~1099\r\n"  # קצרה מדי
    ).encode("cp862")
    res = parse_dat_bytes(data)
    assert len(res.periods_by_id["12345678"]) == 1
    assert len(res.errors) == 2


def test_dat_duplicate_period_warning():
    row = "9050~0~1099~012345678~0~9999~01092010~31082015~06000~02~1000\r\n"
    res = parse_dat_bytes((row + row).encode("cp862"))
    assert any("אותם תאריכים" in w for w in res.warnings)


def test_pdf_parsing():
    pres = parse_pdf_file(os.path.join(SAMPLES, "sample_12345678.pdf"))
    assert pres.id_number == "12345678"
    assert not pres.errors
    assert len(pres.periods) == 5
    by_key = {(p.start, p.end): p for p in pres.periods}
    p = by_key[("01092015", "31082016")]
    assert p.zchuyot_label == "פחות מ-1/3"
    assert p.heikef == 0.3
    assert p.months == 12.0
    sab = by_key[("01092016", "31082017")]
    assert sab.tkufa_label == "שבתון" and sab.zchuyot_label == "שבתון"


# ---------- השוואה ----------

def test_full_match(results):
    res, _ = results
    r = res["12345678"]
    assert r.status == "match"
    assert r.total_compared == 5 and r.matched == 5
    assert r.percent == 100.0
    # שורת העזיבה לא נספרת אלא רק מוצגת לידיעה
    assert len(r.excluded) == 1
    assert r.excluded[0]["sug_tkufa"] == 4


def test_mismatches_detected(results):
    res, _ = results
    r = res["23456789"]
    assert r.status == "mismatch"
    assert r.total_compared == 7 and r.matched == 2
    rows = {(row.start, row.end): row for row in r.rows}

    diff = rows[("01092005", "31082010")]
    assert diff.status == ROW_DIFF
    assert [d.field_name for d in diff.diffs] == ["היקף משרה"]

    diff = rows[("01092010", "31082012")]
    assert [d.field_name for d in diff.diffs] == ["סוג זכויות"]

    diff = rows[("01092012", "31082013")]
    assert [d.field_name for d in diff.diffs] == ["אורך שירות (חודשים)"]

    assert rows[("01092013", "31082014")].status == ROW_DAT_ONLY
    assert rows[("01091998", "31082000")].status == ROW_PDF_ONLY
    assert rows[("01092000", "31082005")].status == ROW_MATCH


def test_missing_sides(results):
    res, _ = results
    assert res["34567890"].status == "missing_pdf"
    assert res["45678901"].status == "missing_dat"


def test_sabbatical_rule(results):
    res, _ = results
    r = res["12345678"]
    sab = next(row for row in r.rows if row.start == "01092016")
    assert sab.status == ROW_MATCH
