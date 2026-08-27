/**
 * POST /api/compare - הממשק המרכזי של המערכת: השוואה מול נתוני הטבלה
 * הזמנית, כפי שהמערכת הקיימת (.NET ואורקל, משרד האוצר) קוראת לו בפועל.
 *
 * GET/POST /compare - מסך ווב להעלאת קובץ DAT מול קבצי PDF; כלי בדיקה
 * מקומי בלבד שעובד כלקוח של אותו API (ראו tableSource.js), לא נתיב נפרד
 * בהשוואה עצמה.
 *
 * הרצה:  npm start  (או node server.js)  ואז לפתוח בדפדפן  http://localhost:5000
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import express from "express";
import multer from "multer";
import swaggerUi from "swagger-ui-express";

import { compareId, unifiedText } from "./src/comparator.js";
import { normalizeId } from "./src/parsers/datParser.js";
import { normalizeKeys, parseTableRows, tableRowsFromDatBytes } from "./src/tableSource.js";
import { parsePdfBuffer } from "./src/parsers/pdfChinuchParser.js";
import { fmtG } from "./src/comparator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// הקבצים נשמרים בזיכרון בלבד - לא נכתבים לדיסק
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB לקובץ
});

const helpers = {
  fmtG,
  fmtF3: (n) => Number(n).toFixed(3),
};

/**
 * החזרת השורות שנשלחו כפי שהן, עם תוספת לכל שורה:
 *   valid  - 1 אם השורה נמצאה תואמת במלואה במסמך, 0 אחרת
 *   reason - פירוט קצר כשהשורה אינה תקינה (או הערה כשאינה מושווית)
 */
function annotateSentRows(rawRows, results) {
  const rowIndex = new Map();
  const excludedKeys = new Set();
  for (const r of results) {
    for (const row of r.rows) {
      if (row.dataRow) rowIndex.set(`${r.idNumber}|${row.dataRow.start}|${row.dataRow.end}`, row);
    }
    for (const ex of r.excluded) excludedKeys.add(`${r.idNumber}|${ex.start}|${ex.end}`);
  }

  return rawRows.map((raw) => {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return { row: raw, valid: 0, reason: "רשומה שאינה אובייקט - לא נבדקה" };
    }
    const row = normalizeKeys(raw);
    const key =
      `${normalizeId(String(row.MISPAR_ZEHUT ?? ""))}|` +
      `${String(row.TAARICH_ME ?? "")}|${String(row.TAARICH_AD ?? "")}`;

    const resultRow = rowIndex.get(key);
    if (resultRow) {
      if (resultRow.status === "match") return { ...raw, valid: 1 };
      if (resultRow.status === "diff") {
        return {
          ...raw,
          valid: 0,
          reason: resultRow.diffs
            .map((d) => `${d.fieldName}: במסמך "${d.pdfValue}" מול "${d.dataValue}" בנתונים`)
            .join("; "),
        };
      }
      return { ...raw, valid: 0, reason: "לא נמצאה תקופה תואמת במסמך" };
    }
    if (excludedKeys.has(key)) {
      return { ...raw, valid: 1, reason: "עזיבה - אינה מודפסת במסמך ולא נכללת בהשוואה" };
    }
    return { ...raw, valid: 0, reason: "השורה לא נקלטה (ערך שגוי או רשומה שאינה 9050)" };
  });
}

function buildSummary(results) {
  return {
    total: results.length,
    match: results.filter((r) => r.status === "match").length,
    mismatch: results.filter((r) => r.status === "mismatch").length,
    missing: results.filter((r) => r.status === "missing_pdf" || r.status === "missing_data").length,
    error: results.filter((r) => r.status === "error").length,
  };
}

// תיעוד אינטראקטיבי של ה-API: http://localhost:5000/api-docs
const openapiSpec = JSON.parse(readFileSync(path.join(__dirname, "openapi.json"), "utf8"));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));

app.get("/", (req, res) => {
  res.render("index", { error: null });
});

app.post(
  "/compare",
  upload.fields([
    { name: "dat_file", maxCount: 1 },
    { name: "pdf_files" },
  ]),
  async (req, res) => {
    const datFile = req.files?.dat_file?.[0];
    const pdfFiles = (req.files?.pdf_files || []).filter((f) => f.originalname);

    if (!datFile) {
      return res.render("index", { error: "יש לבחור קובץ DAT" });
    }
    if (pdfFiles.length === 0) {
      return res.render("index", { error: "יש לבחור לפחות קובץ PDF אחד" });
    }

    // המעטפת עובדת כלקוח של ה-API, אחד-על-אחד כמו במציאות: קיבוץ שורות
    // הקובץ לפי ת"ז, וקריאה נפרדת ל-/api/compare עבור כל מסמך עם השורות שלו.
    const rowsById = new Map();
    for (const row of tableRowsFromDatBytes(datFile.buffer)) {
      const id = normalizeId(String(row.MISPAR_ZEHUT ?? ""));
      if (!rowsById.has(id)) rowsById.set(id, []);
      rowsById.get(id).push(row);
    }

    const apiUrl = `http://127.0.0.1:${req.socket.localPort}/api/compare`;
    const results = [];
    const warnings = [];
    const sentIds = new Set();
    for (const f of pdfFiles) {
      // שמות קבצים מגיעים מהדפדפן ב-latin1 - המרה חזרה ל-UTF-8 לתצוגה נכונה
      const fname = Buffer.from(f.originalname, "latin1").toString("utf8");
      // פענוח מקדים רק כדי לזהות לאיזו ת"ז המסמך שייך (הצימוד לשורות)
      const idNumber = (await parsePdfBuffer(f.buffer)).idNumber;
      if (idNumber !== null && sentIds.has(idNumber)) {
        warnings.push(`ת"ז ${idNumber}: הועלה יותר ממסמך אחד - נלקח הראשון`);
        continue;
      }
      const resp = await fetch(`${apiUrl}?full=1`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: rowsById.get(idNumber) ?? [],
          pdf: { filename: fname, content: f.buffer.toString("base64") },
        }),
      });
      const body = await resp.json();
      if (!resp.ok) {
        warnings.push(`${fname}: הקריאה נדחתה - ${body.error}`);
        continue;
      }
      if (idNumber !== null) sentIds.add(idNumber);
      results.push(...body.results);
      warnings.push(...body.warnings);
    }

    // ת"ז שיש להן שורות בקובץ אך לא הועלה מסמך - לא נשלחת קריאה, כמו במציאות
    for (const id of [...rowsById.keys()].sort()) {
      if (!sentIds.has(id)) {
        warnings.push(`ת"ז ${id}: לא הועלה מסמך PDF - לא נשלחה קריאה ל-API`);
      }
    }

    // מיון כמו קודם: שגיאות ואי-התאמות תחילה, התאמות מלאות בסוף
    const order = { error: 0, mismatch: 1, missing_pdf: 2, missing_data: 3, match: 4 };
    results.sort((a, b) => {
      const d = (order[a.status] ?? 9) - (order[b.status] ?? 9);
      return d !== 0 ? d : a.idNumber < b.idNumber ? -1 : a.idNumber > b.idNumber ? 1 : 0;
    });

    res.render("results", {
      results,
      warnings,
      summary: buildSummary(results),
      datName: Buffer.from(datFile.originalname, "latin1").toString("utf8"),
      ...helpers,
    });
  }
);

/**
 * API עבור המערכת הקיימת: השוואה מול נתוני הטבלה הזמנית במקום קובץ DAT.
 *
 * הממשק עובד אחד-על-אחד - כל קריאה נושאת ת"ז אחת ומסמך אחד.
 * שתי צורות קלט לאותו חוזה:
 *   JSON:      { "rows": [ {...} ], "pdf": { "filename", "content": <base64> } }
 *   form-data: שדה rows (טקסט, מערך JSON) + שדה pdf (קובץ ממש) - נוח מפוסטמן
 * rows - שורות LD_CHINUCH_9050_TKUFOT_RETSIF של אותה ת"ז; שמות העמודות
 * כמפתחות. בקשה עם יותר מת"ז אחת ב-rows נדחית עם 400.
 * התשובה: אותן שורות שנשלחו בתוספת valid (1/0) לכל שורה, לצד valid כולל
 * וטקסט מאוחד: { valid, idNumber, rows, text }; עם ?full=1 נוספים גם
 * summary/warnings/results (למסך התוצאות).
 */
app.post("/api/compare", express.json({ limit: "200mb" }), upload.single("pdf"), async (req, res) => {
  const startedAt = Date.now();
  const stamp = new Date().toISOString();
  let { rows, pdf } = req.body ?? {};
  // form-data (למשל מפוסטמן): ה-PDF מצורף כקובץ ממש ו-rows כשדה טקסט JSON
  if (req.file) {
    pdf = {
      filename: Buffer.from(req.file.originalname, "latin1").toString("utf8"),
      content: req.file.buffer.toString("base64"),
    };
    if (rows != null) {
      try {
        rows = JSON.parse(rows);
      } catch {
        console.log(`[${stamp}] /api/compare מ-${req.ip}: בקשה נדחתה - rows אינו JSON תקין`);
        return res.status(400).json({ error: "שדה rows חייב להכיל מערך JSON תקין (כשדה טקסט לצד קובץ ה-pdf)" });
      }
    }
  }
  if (!Array.isArray(rows)) {
    console.log(`[${stamp}] /api/compare מ-${req.ip}: בקשה נדחתה - חסר rows`);
    return res.status(400).json({ error: "נדרש שדה rows: מערך שורות מהטבלה הזמנית" });
  }
  if (!pdf || typeof pdf !== "object" || Array.isArray(pdf)) {
    console.log(`[${stamp}] /api/compare מ-${req.ip}: בקשה נדחתה - חסר pdf`);
    return res.status(400).json({ error: "נדרש שדה pdf: { filename, content (base64) } - מסמך אחד לקריאה" });
  }
  console.log(`[${stamp}] /api/compare מ-${req.ip}: התקבלו ${rows.length} שורות טבלה ומסמך "${pdf.filename ?? "?"}"`);

  const tableResult = parseTableRows(rows);

  // אכיפת מצב אחד-על-אחד: כל קריאה נושאת ת"ז אחת בלבד
  const idsInRows = Object.keys(tableResult.periodsById);
  if (idsInRows.length > 1) {
    console.log(`    בקשה נדחתה - ${idsInRows.length} מספרי זהות בקריאה אחת (${idsInRows.join(", ")})`);
    return res.status(400).json({
      error: `הממשק עובד אחד-על-אחד: בקריאה נשלחות שורות של תעודת זהות אחת בלבד, ` +
             `אך נמצאו ${idsInRows.length}: ${idsInRows.join(", ")}`,
    });
  }

  // לתחקור: אם מוגדר API_DUMP_DIR, גוף הבקשה נשמר שם כקובץ JSON
  if (process.env.API_DUMP_DIR) {
    const fs = await import("node:fs");
    fs.mkdirSync(process.env.API_DUMP_DIR, { recursive: true });
    const dumpPath = path.join(process.env.API_DUMP_DIR, `request_${stamp.replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(dumpPath, JSON.stringify(req.body, null, 2));
    console.log(`    גוף הבקשה נשמר: ${dumpPath}`);
  }

  // פענוח מסמך ה-PDF היחיד; קובץ פגום לא מפיל את הבקשה - מדווח כשגיאת השוואה
  let pdfResult;
  try {
    if (typeof pdf.content !== "string" || pdf.content === "") {
      throw new Error("שדה content חסר או ריק");
    }
    pdfResult = await parsePdfBuffer(Buffer.from(pdf.content, "base64"));
  } catch (exc) {
    pdfResult = {
      idNumber: null,
      periods: [],
      warnings: [],
      errors: [`שגיאה בפענוח ${pdf.filename ?? "?"}: ${exc.message}`],
    };
  }

  // השוואה אחד-על-אחד: ת"ז אחת (מה-rows, ואם אין - מה-PDF) מול המסמך היחיד
  const compareIdNumber = idsInRows[0] ?? pdfResult.idNumber ?? "?";
  const results = [
    compareId(compareIdNumber, tableResult.periodsById[compareIdNumber], pdfResult, pdf.filename),
  ];
  const warnings = [...tableResult.warnings, ...tableResult.errors];
  const summary = buildSummary(results);
  // אינדיקציית תקינות לפי האפיון: 1 רק כשכל ההשוואות תקינות במלואן
  const valid = summary.total > 0 && summary.match === summary.total ? 1 : 0;
  console.log(
    `    הושוו ${summary.total} ת"ז (תואמות: ${summary.match}, שונות: ${summary.mismatch}, ` +
    `חסרות: ${summary.missing}, שגיאות: ${summary.error}) => valid=${valid}, ${Date.now() - startedAt}ms`
  );
  // התשובה: אותו JSON שנשלח - השורות על כל פרטיהן, בתוספת valid לכל שורה.
  // הפירוט המלא (summary/warnings/results) מוחזר רק למי שמבקש ?full=1
  // (מסך התוצאות משתמש בזה).
  const response = {
    valid,
    idNumber: idsInRows.length === 1 ? idsInRows[0] : null,
    rows: annotateSentRows(rows, results),
    text: unifiedText(results, warnings),
  };
  if (req.query.full === "1") {
    Object.assign(response, { summary, warnings, results });
  }
  res.json(response);
});

const PORT = process.env.PORT || 5000;
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  app.listen(PORT, "127.0.0.1", () => {
    console.log(`השרת פעיל: http://localhost:${PORT}`);
  });
}

export { app };
