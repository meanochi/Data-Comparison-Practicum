/**
 * פרסר דו"ח "סיכום נתוני פרישה": מספר זהות + טבלת "פירוט תקופות עבודה".
 *
 * הפרסר בנוי מעל שכבת החילוץ הגנרית (pdfText.js), שמספקת את שורות הטקסט
 * של כל עמוד בסדר חזותי. פורמט דו"ח נוסף בעתיד = קובץ פרסר חדש כמו זה,
 * שמשתמש באותו extractVisualLines ומגדיר רק את הרג'קסים ומבנה השורה שלו.
 */
import fs from "node:fs";
import { extractVisualLines, normalizeDashes, toLogical, toVisual } from "../pdfText.js";

// ייצוא חוזר לנוחות הצרכנים (בדיקות, פרסרים עתידיים)
export { toLogical, toVisual, normalizeDashes };

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// שורת טבלה בטקסט המחולץ (משמאל לימין):
// מקדם | היקף משרה | סוג זכויות | אורך שירות | תאריך עד | מתאריך | סוג תקופה
const ROW_RE = new RegExp(
  "^([\\d.]+)\\s+([\\d.]+)\\s+(\\S.*?)\\s+([\\d.]+)\\s+" +
  "(\\d{2}-\\d{2}-\\d{4})\\s+(\\d{2}-\\d{2}-\\d{4})\\s+(\\S.*)$"
);

// "מספר זהות: 12345678" - בטקסט החזותי התווית הפוכה והמספר לפניה
const ID_RE = new RegExp("(\\d{5,9})\\s*:" + escapeRegExp(toVisual("מספר זהות")));

/** פענוח PDF מתוך Buffer. */
export function parsePdfBuffer(buf) {
  const result = { idNumber: null, periods: [], warnings: [], errors: [] };
  let extracted;
  try {
    extracted = extractVisualLines(buf);
  } catch (exc) {
    // קובץ פגום, מוצפן וכו'
    result.errors.push(`שגיאה בקריאת ה-PDF: ${exc.message || exc}`);
    return result;
  }

  extracted.pages.forEach((lines, i) => parsePageLines(lines, i + 1, result));
  for (const name of extracted.unmappedFonts) {
    result.warnings.push(
      `הפונט המשובץ "${name}" מכיל תווים שלא ניתן לפענח - ייתכן טקסט חסר`
    );
  }

  if (result.idNumber === null) {
    result.errors.push('לא נמצא "מספר זהות" בכותרת הדו"ח');
  }
  if (result.periods.length === 0) {
    result.errors.push('לא נמצאו שורות בטבלת "פירוט תקופות עבודה"');
  }
  return result;
}

export function parsePdfFile(path) {
  return parsePdfBuffer(fs.readFileSync(path));
}

function parsePageLines(lines, pageNo, result) {
  for (let line of lines) {
    line = normalizeDashes(line.trim());
    if (result.idNumber === null) {
      const m = ID_RE.exec(line);
      if (m) {
        result.idNumber = m[1].replace(/^0+/, "");
      }
    }
    const m = ROW_RE.exec(line);
    if (!m) continue;
    const [, mekadem, heikef, zchuyotVis, months, end, start, tkufaVis] = m;
    const parsed = {
      tkufaLabel: toLogical(tkufaVis.trim()),
      start: start.replaceAll("-", ""),
      end: end.replaceAll("-", ""),
      months: parseFloat(months),
      zchuyotLabel: toLogical(zchuyotVis.trim()),
      heikef: parseFloat(heikef),
      mekadem: parseFloat(mekadem),
      page: pageNo,
    };
    if ([parsed.months, parsed.heikef, parsed.mekadem].some((n) => !Number.isFinite(n))) {
      result.warnings.push(`עמוד ${pageNo}: שורת טבלה לא תקינה (ערך מספרי שגוי)`);
      continue;
    }
    result.periods.push(parsed);
  }
}
