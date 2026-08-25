/**
 * השוואת תקופות עבודה בין קובץ DAT לקבצי PDF.
 *
 * ההתאמה בין שורות נעשית לפי מפתח (תאריך התחלה, תאריך סיום),
 * ולאחר מכן מושווים: סוג תקופה, אורך שירות, סוג זכויות והיקף משרה.
 */
import { fmtDate } from "./parsers/datParser.js";
import {
  EXCLUDED_TKUFA_CODES,
  PDF_TKUFA_LABELS,
  PDF_ZCHUYOT_LABELS,
  SABBATICAL_LABEL,
  SABBATICAL_TKUFA_CODE,
  SABBATICAL_ZCHUYOT_CODE,
  SUG_TKUFA,
  SUG_ZCHUYOT,
} from "./mappings.js";

const MONTHS_TOLERANCE = 0.001;
const HEIKEF_TOLERANCE = 0.0005;

// סטטוסים לשורה בודדת
export const ROW_MATCH = "match";        // כל השדות זהים
export const ROW_DIFF = "diff";          // נמצאה אי-התאמה בשדות
export const ROW_DAT_ONLY = "dat_only";  // תקופה שקיימת רק ב-DAT
export const ROW_PDF_ONLY = "pdf_only";  // תקופה שקיימת רק ב-PDF

/** עיצוב מספר בסגנון %g של פייתון (6 ספרות משמעותיות, בלי אפסים עודפים). */
export function fmtG(n) {
  return String(parseFloat(Number(n).toPrecision(6)));
}

function rowResult(status, start = null, end = null, extra = {}) {
  return {
    status,
    start,
    end,
    diffs: [],
    pdfRow: null,
    datRow: null,
    startDisplay: start ? fmtDate(start) : "",
    endDisplay: end ? fmtDate(end) : "",
    ...extra,
  };
}

function datRowDict(d) {
  return {
    sugTkufa: d.sugTkufa,
    sugTkufaTeur: SUG_TKUFA[d.sugTkufa] ?? `קוד לא מוכר (${d.sugTkufa})`,
    start: d.start,
    end: d.end,
    months: d.months,
    sugZchuyot: d.sugZchuyot,
    sugZchuyotTeur: SUG_ZCHUYOT[d.sugZchuyot] ?? `קוד לא מוכר (${d.sugZchuyot})`,
    heikef: d.heikef,
  };
}

function pdfRowDict(p) {
  return {
    tkufaLabel: p.tkufaLabel,
    start: p.start,
    end: p.end,
    months: p.months,
    zchuyotLabel: p.zchuyotLabel,
    heikef: p.heikef,
    mekadem: p.mekadem,
  };
}

/** השוואת שורה בודדת. מחזיר רשימת אי-התאמות (ריקה = זהה). */
function compareRow(pdfRow, datRow, warnings) {
  const diffs = [];

  // סוג תקופה. כלל מיוחד: "שבתון" ב-PDF = קוד 2 + זכויות 67 ב-DAT
  if (pdfRow.tkufaLabel === SABBATICAL_LABEL) {
    const ok =
      datRow.sugTkufa === SABBATICAL_TKUFA_CODE &&
      datRow.sugZchuyot === SABBATICAL_ZCHUYOT_CODE;
    if (!ok) {
      diffs.push({
        fieldName: "סוג תקופה",
        pdfValue: "שבתון",
        datValue:
          `${datRow.sugTkufa} (${SUG_TKUFA[datRow.sugTkufa] ?? "לא מוכר"}) ` +
          `+ זכויות ${datRow.sugZchuyot}`,
      });
    }
  } else {
    const allowed = PDF_TKUFA_LABELS[pdfRow.tkufaLabel];
    if (allowed === undefined) {
      warnings.push(
        `תווית סוג תקופה לא מוכרת ב-PDF: "${pdfRow.tkufaLabel}" ` +
        `(תקופה ${fmtDate(pdfRow.start)} - ${fmtDate(pdfRow.end)}) - נדרש עדכון מיפוי`
      );
      diffs.push({
        fieldName: "סוג תקופה",
        pdfValue: `${pdfRow.tkufaLabel} (תווית לא מוכרת)`,
        datValue: `${datRow.sugTkufa} (${SUG_TKUFA[datRow.sugTkufa] ?? "לא מוכר"})`,
      });
    } else if (!allowed.has(datRow.sugTkufa)) {
      diffs.push({
        fieldName: "סוג תקופה",
        pdfValue: pdfRow.tkufaLabel,
        datValue: `${datRow.sugTkufa} (${SUG_TKUFA[datRow.sugTkufa] ?? "לא מוכר"})`,
      });
    }
  }

  // אורך שירות (חודשים)
  if (Math.abs(pdfRow.months - datRow.months) > MONTHS_TOLERANCE) {
    diffs.push({
      fieldName: "אורך שירות (חודשים)",
      pdfValue: fmtG(pdfRow.months),
      datValue: fmtG(datRow.months),
    });
  }

  // סוג זכויות
  const allowedZ = PDF_ZCHUYOT_LABELS[pdfRow.zchuyotLabel];
  if (allowedZ === undefined) {
    warnings.push(
      `תווית סוג זכויות לא מוכרת ב-PDF: "${pdfRow.zchuyotLabel}" ` +
      `(תקופה ${fmtDate(pdfRow.start)} - ${fmtDate(pdfRow.end)}) - נדרש עדכון מיפוי`
    );
    diffs.push({
      fieldName: "סוג זכויות",
      pdfValue: `${pdfRow.zchuyotLabel} (תווית לא מוכרת)`,
      datValue: `${datRow.sugZchuyot} (${SUG_ZCHUYOT[datRow.sugZchuyot] ?? "לא מוכר"})`,
    });
  } else if (!allowedZ.has(datRow.sugZchuyot)) {
    diffs.push({
      fieldName: "סוג זכויות",
      pdfValue: pdfRow.zchuyotLabel,
      datValue: `${datRow.sugZchuyot} (${SUG_ZCHUYOT[datRow.sugZchuyot] ?? "לא מוכר"})`,
    });
  }

  // היקף משרה
  if (Math.abs(pdfRow.heikef - datRow.heikef) > HEIKEF_TOLERANCE) {
    diffs.push({
      fieldName: "היקף משרה",
      pdfValue: pdfRow.heikef.toFixed(3),
      datValue: datRow.heikef.toFixed(3),
    });
  }
  return diffs;
}

function finalizeIdResult(res) {
  res.percent =
    res.totalCompared === 0
      ? 0.0
      : Math.round((1000.0 * res.matched) / res.totalCompared) / 10;
  res.mismatchCount = res.totalCompared - res.matched;
  return res;
}

/** השוואת כל התקופות של מספר זהות אחד. */
export function compareId(idNumber, datPeriods, pdfResult, pdfFile = null) {
  const res = {
    idNumber,
    status: "match", // 'match' / 'mismatch' / 'missing_pdf' / 'missing_dat' / 'error'
    pdfFile,
    totalCompared: 0, // מספר התקופות שהושוו
    matched: 0,       // מכללן - כמה זהות לחלוטין
    rows: [],
    excluded: [],     // שורות עזיבה שלא הושוו
    warnings: [],
    errors: [],
  };
  if (pdfResult !== null && pdfResult !== undefined) {
    res.warnings.push(...pdfResult.warnings);
    res.errors.push(...pdfResult.errors);
  }

  datPeriods = datPeriods || [];
  const active = datPeriods.filter((d) => !EXCLUDED_TKUFA_CODES.has(d.sugTkufa));
  res.excluded = datPeriods
    .filter((d) => EXCLUDED_TKUFA_CODES.has(d.sugTkufa))
    .map(datRowDict);

  if (pdfResult === null || pdfResult === undefined) {
    res.status = "missing_pdf";
    res.rows = active.map((d) =>
      rowResult(ROW_DAT_ONLY, d.start, d.end, { datRow: datRowDict(d) })
    );
    return finalizeIdResult(res);
  }
  if (datPeriods.length === 0) {
    res.status = "missing_dat";
    res.rows = pdfResult.periods.map((p) =>
      rowResult(ROW_PDF_ONLY, p.start, p.end, { pdfRow: pdfRowDict(p) })
    );
    return finalizeIdResult(res);
  }
  if (pdfResult.errors.length > 0) {
    res.status = "error";
    return finalizeIdResult(res);
  }

  const pdfMap = new Map(pdfResult.periods.map((p) => [`${p.start}|${p.end}`, p]));
  const matchedKeys = new Set();

  for (const d of active) {
    const key = `${d.start}|${d.end}`;
    const p = pdfMap.get(key);
    res.totalCompared += 1;
    if (p === undefined) {
      res.rows.push(rowResult(ROW_DAT_ONLY, d.start, d.end, { datRow: datRowDict(d) }));
      continue;
    }
    matchedKeys.add(key);
    const diffs = compareRow(p, d, res.warnings);
    const status = diffs.length === 0 ? ROW_MATCH : ROW_DIFF;
    if (diffs.length === 0) res.matched += 1;
    res.rows.push(
      rowResult(status, d.start, d.end, {
        diffs,
        pdfRow: pdfRowDict(p),
        datRow: datRowDict(d),
      })
    );
  }

  for (const p of pdfResult.periods) {
    if (!matchedKeys.has(`${p.start}|${p.end}`)) {
      res.totalCompared += 1;
      res.rows.push(rowResult(ROW_PDF_ONLY, p.start, p.end, { pdfRow: pdfRowDict(p) }));
    }
  }

  // מיון לפי תאריך התחלה (YYYYMMDD) מהחדש לישן, כמו בדו"ח
  const sortKey = (r) => {
    const s = r.start || "";
    return s.slice(4) + s.slice(2, 4) + s.slice(0, 2);
  };
  res.rows.sort((a, b) => (sortKey(a) < sortKey(b) ? 1 : sortKey(a) > sortKey(b) ? -1 : 0));
  res.status = res.matched === res.totalCompared ? "match" : "mismatch";
  return finalizeIdResult(res);
}

/**
 * השוואה מלאה: תוצאת פענוח DAT מול רשימת [שם קובץ, תוצאת פענוח PDF].
 *
 * מחזיר { results: רשימת תוצאות ממוינת, warnings: אזהרות כלליות }.
 */
export function compareAll(datResult, pdfResults) {
  const results = [];
  const warnings = [...datResult.warnings];
  if (datResult.errors.length > 0) {
    warnings.push(...datResult.errors);
  }

  const pdfById = new Map();
  for (const [fname, pres] of pdfResults) {
    if (pres.idNumber === null || pres.idNumber === undefined) {
      results.push(
        finalizeIdResult({
          idNumber: `? (${fname})`,
          status: "error",
          pdfFile: fname,
          totalCompared: 0,
          matched: 0,
          rows: [],
          excluded: [],
          warnings: [],
          errors: [...pres.errors],
        })
      );
      continue;
    }
    if (pdfById.has(pres.idNumber)) {
      warnings.push(
        `ת"ז ${pres.idNumber}: הועלה יותר מקובץ PDF אחד - נלקח הראשון (${pdfById.get(pres.idNumber)[0]})`
      );
      continue;
    }
    pdfById.set(pres.idNumber, [fname, pres]);
  }

  const allIds = [...new Set([...Object.keys(datResult.periodsById), ...pdfById.keys()])].sort();
  for (const idNumber of allIds) {
    const [fname, pres] = pdfById.get(idNumber) ?? [null, null];
    results.push(compareId(idNumber, datResult.periodsById[idNumber], pres, fname));
  }

  // קודם אי-התאמות ושגיאות, אחר כך חסרים, ובסוף התאמות מלאות
  const order = { error: 0, mismatch: 1, missing_pdf: 2, missing_dat: 3, match: 4 };
  results.sort((a, b) => {
    const oa = order[a.status] ?? 9;
    const ob = order[b.status] ?? 9;
    if (oa !== ob) return oa - ob;
    return a.idNumber < b.idNumber ? -1 : a.idNumber > b.idNumber ? 1 : 0;
  });
  return { results, warnings };
}
