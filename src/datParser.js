/**
 * פענוח קובץ DAT (ממשק לאוצר).
 *
 * הקובץ מופרד בתו '~' ומקודד בקידוד עברי ישן (IBM/DOS-862). כל שורה מתחילה
 * בקוד רשומה (9015 / 9022 / 9023 / 9024 / 9031 / 9050...), והפענוח נעשה לפי
 * טבלת RECORD_PARSERS: קוד רשומה -> פונקציית פענוח.
 *
 * להוספת סוג רשומה חדש:
 *   1. כותבים פונקציית parseXXXX(fields, lineNo, result) שקוראת את השדות
 *      ומוסיפה את הנתונים ל-result (אפשר להוסיף ל-result אוסף חדש משלה).
 *   2. רושמים אותה ב-RECORD_PARSERS עם מספר השדות המינימלי.
 * שורות עם קוד שאינו רשום מדולגות בשקט (כמו עד היום).
 *
 * מבנה שורת 9050 - תקופות עבודה (לפי סדר השדות בקובץ):
 *     0: קוד רשומה (9050)
 *     1: לא ידוע
 *     2: לא ידוע
 *     3: מספר זהות
 *     4: לא ידוע
 *     5: קוד סוג תקופה
 *     6: תאריך התחלה (DDMMYYYY)
 *     7: תאריך סיום (DDMMYYYY)
 *     8: אורך שירות בחודשים כפול 100 (למשל 01200 = 12 חודשים)
 *     9: קוד סוג זכויות
 *    10: היקף משרה כפול 1000 (למשל 0667 = 0.667)
 */
import fs from "node:fs";
import iconv from "iconv-lite";

/** נרמול מספר זהות: הסרת רווחים ואפסים מובילים (ב-PDF מודפס ללא אפס מוביל). */
export function normalizeId(raw) {
  return raw.trim().replace(/^0+/, "");
}

/** פענוח בייטים של קובץ DAT בקידוד DOS-862 (כל 256 הבייטים מוגדרים בו). */
export function decodeDat(buf) {
  return iconv.decode(buf, "cp862");
}

/** DDMMYYYY -> DD/MM/YYYY לתצוגה. */
export function fmtDate(ddmmyyyy) {
  if (ddmmyyyy && ddmmyyyy.length === 8) {
    return `${ddmmyyyy.slice(0, 2)}/${ddmmyyyy.slice(2, 4)}/${ddmmyyyy.slice(4)}`;
  }
  return ddmmyyyy;
}

/** המרת שדה מספרי; זורק שגיאה על ערך לא מספרי (כמו int() בפייתון). */
function toInt(s) {
  const t = s.trim();
  if (!/^-?\d+$/.test(t)) {
    throw new Error(`ערך לא מספרי: '${s}'`);
  }
  return parseInt(t, 10);
}

/** רשומת 9050: תקופת עבודה אחת - נוספת ל-result.periodsById. */
function parse9050(fields, lineNo, result) {
  const period = {
    idNumber: normalizeId(fields[3]),
    sugTkufa: toInt(fields[5]),
    start: fields[6].trim(),
    end: fields[7].trim(),
    months: toInt(fields[8]) / 100.0,
    sugZchuyot: toInt(fields[9]),
    heikef: toInt(fields[10]) / 1000.0,
    lineNumber: lineNo,
  };
  (result.periodsById[period.idNumber] ??= []).push(period);
}

// קוד רשומה -> { מספר שדות מינימלי, פונקציית פענוח }.
// רשומות נוספות (9015, 9022, 9023...) יתווספו כאן כשיהיה מידע על המבנה שלהן.
const RECORD_PARSERS = {
  "9050": { minFields: 11, parse: parse9050 },
};

export function parseDatBytes(buf) {
  const result = { periodsById: {}, warnings: [], errors: [] };
  const text = decodeDat(buf);
  const lines = text.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i];
    const code = line.slice(0, line.indexOf("~"));
    const recordParser = RECORD_PARSERS[code];
    if (!recordParser) continue;
    const fields = line.replace(/\s+$/, "").split("~");
    if (fields.length < recordParser.minFields) {
      result.errors.push(
        `שורה ${lineNo}: שורת ${code} עם ${fields.length} שדות בלבד ` +
        `(נדרשים ${recordParser.minFields}) - השורה דולגה`
      );
      continue;
    }
    try {
      recordParser.parse(fields, lineNo, result);
    } catch (exc) {
      result.errors.push(`שורה ${lineNo}: ערך לא מספרי בשורת ${code} (${exc.message}) - השורה דולגה`);
    }
  }

  checkDuplicatePeriods(result);
  return result;
}

/** בדיקת שפיות: לא אמורות להיות שתי תקופות עם אותם תאריכים לאותה ת"ז. */
function checkDuplicatePeriods(result) {
  for (const [idNumber, periods] of Object.entries(result.periodsById)) {
    const seen = new Map();
    for (const p of periods) {
      const key = `${p.start}|${p.end}`;
      if (seen.has(key)) {
        result.warnings.push(
          `ת"ז ${idNumber}: נמצאו שתי תקופות עם אותם תאריכים ` +
          `(${fmtDate(p.start)} - ${fmtDate(p.end)}, שורות ${seen.get(key)} ו-${p.lineNumber}). ` +
          `ההשוואה עבור התקופה הזו עלולה להיות שגויה.`
        );
      } else {
        seen.set(key, p.lineNumber);
      }
    }
  }
}

export function parseDatFile(path) {
  return parseDatBytes(fs.readFileSync(path));
}
