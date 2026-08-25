/**
 * מקור נתונים מטבלה זמנית (במקום קובץ DAT).
 *
 * המערכת הקיימת טוענת את קובץ הממשק לאוצר עם SQL*Loader (קובץ LD_Chinuch.ctl)
 * לטבלאות LD_Chinuch_*, ומעבירה אלינו ב-API את שורות טבלת
 * LD_CHINUCH_9050_TKUFOT_RETSIF כרשומות JSON. כל רשומה - אובייקט שהמפתחות בו הם
 * שמות העמודות בטבלה (כל השדות VARCHAR2 אחרי trim, כפי שה-CTL יצר אותם):
 *
 *     MISPAR_TNUA            קוד רשומה ('9050')
 *     MISPAR_ZEHUT           מספר זהות
 *     SUG_TKUFA              קוד סוג תקופה
 *     TAARICH_ME             תאריך התחלה (DDMMYYYY)
 *     TAARICH_AD             תאריך סיום (DDMMYYYY)
 *     ORECH_SHERUT           אורך שירות בחודשים כפול 100
 *     SUG_ZECHUYOT_LEGIMLA   קוד סוג זכויות
 *     HEKEF_MISRA            היקף משרה כפול 1000
 *     SEQ                    מספר רץ שה-CTL יצר לפי סדר השורות בקובץ המקורי
 *     (KOD_PEULA, ZIHUY_NOSAF, SEMEL_MISRAD, LOAD_DATE - לא בשימוש בהשוואה)
 *
 * הפלט זהה במבנהו לפלט של parseDatBytes: { periodsById, warnings, errors },
 * כך ששאר המערכת (comparator, ממשק הווב) לא מבחינה מאיזה מקור הגיעו הנתונים.
 */
import { checkDuplicatePeriods, decodeDat, normalizeId, toInt } from "./parsers/datParser.js";


const RECORD_CODE_9050 = "9050";

// סדר העמודות בבלוק ה-9050 של LD_Chinuch.ctl (לפי סדר השדות בקובץ)
export const CTL_9050_COLUMNS = [
  "MISPAR_TNUA", "KOD_PEULA", "SEMEL_MISRAD", "MISPAR_ZEHUT", "ZIHUY_NOSAF",
  "SUG_TKUFA", "TAARICH_ME", "TAARICH_AD", "ORECH_SHERUT",
  "SUG_ZECHUYOT_LEGIMLA", "HEKEF_MISRA",
];

/**
 * המרת קובץ DAT לשורות בפורמט הטבלה הזמנית - מה שהטעינה (ה-CTL) עושה
 * במציאות. משמש את מסך ההעלאה כדי לקרוא ל-API באותו חוזה אחד-על-אחד.
 */
export function tableRowsFromDatBytes(buf) {
  return decodeDat(buf)
    .split(/\r\n|\r|\n/)
    .filter((line) => line.startsWith(`${RECORD_CODE_9050}~`))
    .map((line, i) => {
      const fields = line.replace(/\s+$/, "").split("~");
      const row = Object.fromEntries(
        CTL_9050_COLUMNS.map((col, c) => [col, fields[c]?.trim() ?? null])
      );
      row.SEQ = i + 1;
      return row;
    });
}

// העמודות שההשוואה צריכה; רשומה שחסרה אחת מהן מדווחת כשגיאה ומדולגת.
const REQUIRED_COLUMNS = [
  "MISPAR_ZEHUT",
  "SUG_TKUFA",
  "TAARICH_ME",
  "TAARICH_AD",
  "ORECH_SHERUT",
  "SUG_ZECHUYOT_LEGIMLA",
  "HEKEF_MISRA",
];

/** מפתחות העמודות מגיעים מ-Oracle באותיות גדולות; מנרמלים ליתר ביטחון. */
function normalizeKeys(raw) {
  const row = {};
  for (const [key, value] of Object.entries(raw)) {
    row[key.trim().toUpperCase()] = typeof value === "string" ? value.trim() : value;
  }
  return row;
}

/**
 * פענוח רשימת שורות מהטבלה הזמנית לאותו מבנה תוצאה של פענוח DAT.
 *
 * שורות עם קוד רשומה שאינו 9050 מדולגות בשקט (כמו בפענוח ה-DAT); שורות
 * פגומות (עמודה חסרה או ערך לא מספרי) נרשמות כשגיאה ומדולגות.
 */
export function parseTableRows(rows) {
  const result = { periodsById: {}, warnings: [], errors: [] };
  if (!Array.isArray(rows)) {
    result.errors.push("קלט לא תקין: נדרש מערך של שורות טבלה");
    return result;
  }

  rows.forEach((raw, i) => {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      result.errors.push(`רשומה ${i + 1}: אינה אובייקט - הרשומה דולגה`);
      return;
    }
    const row = normalizeKeys(raw);
    // SEQ משמר את סדר השורות בקובץ המקורי - מקביל למספר השורה בפענוח ה-DAT
    const rowLabel = row.SEQ ?? i + 1;

    if (row.MISPAR_TNUA !== undefined && String(row.MISPAR_TNUA) !== RECORD_CODE_9050) {
      return;
    }
    const missing = REQUIRED_COLUMNS.filter(
      (col) => row[col] === undefined || row[col] === null || String(row[col]) === ""
    );
    if (missing.length > 0) {
      result.errors.push(
        `שורה ${rowLabel}: חסרים ערכים בעמודות ${missing.join(", ")} - השורה דולגה`
      );
      return;
    }

    try {
      const period = {
        idNumber: normalizeId(String(row.MISPAR_ZEHUT)),
        sugTkufa: toInt(String(row.SUG_TKUFA)),
        start: String(row.TAARICH_ME),
        end: String(row.TAARICH_AD),
        months: toInt(String(row.ORECH_SHERUT)) / 100.0,
        sugZchuyot: toInt(String(row.SUG_ZECHUYOT_LEGIMLA)),
        heikef: toInt(String(row.HEKEF_MISRA)) / 1000.0,
        lineNumber: rowLabel,
      };
      (result.periodsById[period.idNumber] ??= []).push(period);
    } catch (exc) {
      result.errors.push(`שורה ${rowLabel}: ערך לא מספרי (${exc.message}) - השורה דולגה`);
    }
  });

  checkDuplicatePeriods(result);
  return result;
}
