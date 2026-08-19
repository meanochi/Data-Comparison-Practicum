# -*- coding: utf-8 -*-
"""יצירת קבצי דוגמה פיקטיביים לבדיקות: קובץ DAT וקבצי PDF תואמים.

כל הנתונים מומצאים. הדוגמאות כוללות בכוונה גם אי-התאמות:

  ת"ז 12345678 - התאמה מלאה (כולל שורת עזיבה שמופיעה רק ב-DAT ושורת שבתון).
  ת"ז 23456789 - אי-התאמות מכוונות:
      * היקף משרה שונה (PDF 0.750 מול DAT 0.700)
      * סוג זכויות שונה (PDF "מוקפא" מול DAT קוד 68)
      * אורך שירות שונה (PDF 11 מול DAT 12)
      * תקופה שקיימת רק ב-DAT
      * תקופה שקיימת רק ב-PDF
  ת"ז 34567890 - קיימת ב-DAT בלבד (אין PDF).
  ת"ז 45678901 - קיימת ב-PDF בלבד (אין ב-DAT).

הרצה:  python scripts/generate_samples.py [תיקיית יעד, ברירת מחדל samples/]
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from comparison.pdf_parser import to_visual

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans.ttf",
    "C:\\Windows\\Fonts\\arial.ttf",
]

# (סוג תקופה ב-DAT, התחלה, סיום, חודשים*100, סוג זכויות, היקף*1000)
DAT_ROWS = {
    "012345678": [
        (9999, "01092010", "31082015", "06000", "02", "1000"),
        (9999, "01092015", "31082016", "01200", "69", "0300"),
        (2,    "01092016", "31082017", "01200", "67", "1000"),   # שבתון
        (2,    "01092017", "31082018", "01200", "10", "0000"),   # חל"ת
        (4,    "01092018", "31122018", "00400", "71", "0000"),   # עזיבה - לא ב-PDF
        (9999, "01012019", "31082020", "02000", "68", "1000"),
    ],
    "023456789": [
        (9999, "01092000", "31082005", "06000", "02", "1000"),
        (9999, "01092005", "31082010", "06000", "68", "0700"),   # PDF יציג 0.750
        (9999, "01092010", "31082012", "02400", "68", "1000"),   # PDF יציג "מוקפא"
        (9999, "01092012", "31082013", "01200", "68", "1000"),   # PDF יציג 11 חודשים
        (9999, "01092013", "31082014", "01200", "68", "1000"),   # חסרה ב-PDF
        (9999, "01092014", "31082015", "01200", "68", "1000"),   # תקינה
    ],
    "034567890": [
        (9999, "01091995", "31082000", "06000", "02", "1000"),
    ],
}

# שורות טבלת ה-PDF (בעברית לוגית, מהחדש לישן כמו בדו"ח האמיתי):
# (סוג תקופה, מתאריך, עד, חודשים, סוג זכויות, היקף, מקדם)
PDF_ROWS = {
    "12345678": [
        ("קביעות", "01-01-2019", "31-08-2020", "20", "נושא זכויות", "1.000", "0"),
        ('חל"ת',   "01-09-2017", "31-08-2018", "12", "לא נושא זכויות", "0.000", "0"),
        ("שבתון",  "01-09-2016", "31-08-2017", "12", "שבתון", "1.000", "0"),
        ("קביעות", "01-09-2015", "31-08-2016", "12", "פחות מ-1/3", "0.300", "0"),
        ("קביעות", "01-09-2010", "31-08-2015", "60", "מוקפא", "1.000", "0.10"),
    ],
    "23456789": [
        ("קביעות", "01-09-2014", "31-08-2015", "12", "נושא זכויות", "1.000", "0"),
        ("קביעות", "01-09-2012", "31-08-2013", "11", "נושא זכויות", "1.000", "0"),
        ("קביעות", "01-09-2010", "31-08-2012", "24", "מוקפא", "1.000", "0"),
        ("קביעות", "01-09-2005", "31-08-2010", "60", "נושא זכויות", "0.750", "0"),
        ("קביעות", "01-09-2000", "31-08-2005", "60", "מוקפא", "1.000", "0"),
        ("קביעות", "01-09-1998", "31-08-2000", "24", "נושא זכויות", "1.000", "0"),  # רק ב-PDF
    ],
    "45678901": [
        ("קביעות", "01-09-2001", "31-08-2003", "24", "נושא זכויות", "1.000", "0"),
    ],
}

PDF_NAMES = {"12345678": "דוגמה ראשונה", "23456789": "דוגמה שנייה", "45678901": "דוגמה רביעית"}


def write_dat(path):
    lines = []
    for id_number, rows in DAT_ROWS.items():
        # שורות נלוות שהמערכת אמורה להתעלם מהן, כמו בקובץ אמיתי
        lines.append(f"9015~{id_number}~9~1")
        lines.append(f"9022~0~1~{id_number}~9~דוגמה~בדיקה~1099~01011970~2~2~ ~ ~test@example.com")
        for (tkufa, start, end, months, zchuyot, heikef) in rows:
            tk = f"{tkufa:04d}" if tkufa < 9000 else str(tkufa)
            lines.append(f"9050~0~1099~{id_number}~0~{tk}~{start}~{end}~{months}~{zchuyot}~{heikef}")
        lines.append(f"9031~0~{id_number}~9~31082020~0132~2200~1~17~000000")
    data = ("\r\n".join(lines) + "\r\n").encode("cp862")
    with open(path, "wb") as f:
        f.write(data)
    print(f"נוצר: {path}")


def _register_font():
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            pdfmetrics.registerFont(TTFont("Heb", p))
            return "Heb"
    raise RuntimeError("לא נמצא גופן עברי (DejaVu) ליצירת קבצי הדוגמה")


def write_pdf(path, id_number, rows, name):
    font = _register_font()
    c = canvas.Canvas(path, pagesize=A4)
    width, height = A4
    y = height - 50

    def line(text, size=10):
        nonlocal y
        c.setFont(font, size)
        c.drawRightString(width - 40, y, text)
        y -= 16

    line(f"08:00:00 01/01/2025 :{to_visual('תאריך הפקה')}")
    line(to_visual('דו"ח סיכום נתוני פרישה - קובץ דוגמה לבדיקות'), size=12)
    line(f"01/01/1970 :{to_visual('תאריך לידה')} {to_visual('מחוז בדיקה')} :{to_visual('מחוז')} "
         f"{id_number} :{to_visual('מספר זהות')} {to_visual(name)} :{to_visual('שם')}")
    y -= 10
    line(f":{to_visual('פירוט תקופות עבודה')}", size=11)
    line(f"{to_visual('מקדם אם')} {to_visual('היקף משרה')} {to_visual('סוג זכויות לפנסיה')} "
         f"{to_visual('אורך שירות')} {to_visual('תאריך עד')} {to_visual('מתאריך')} {to_visual('סוג תקופה')}")
    for (tkufa, start, end, months, zchuyot, heikef, mekadem) in rows:
        line(f"{mekadem} {heikef} {to_visual(zchuyot)} {months} {end} {start} {to_visual(tkufa)}")
    c.save()
    print(f"נוצר: {path}")


def main(out_dir="samples"):
    os.makedirs(out_dir, exist_ok=True)
    write_dat(os.path.join(out_dir, "sample.dat"))
    for id_number, rows in PDF_ROWS.items():
        write_pdf(os.path.join(out_dir, f"sample_{id_number}.pdf"),
                  id_number, rows, PDF_NAMES[id_number])


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "samples")
