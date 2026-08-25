/**
 * ממשק ווב להשוואת קבצי DAT מול קבצי PDF,
 * ו-API להשוואה מול נתוני הטבלה הזמנית (POST /api/compare).
 *
 * הרצה:  npm start  (או node server.js)  ואז לפתוח בדפדפן  http://localhost:5000
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import express from "express";
import multer from "multer";

import { compareAll, unifiedText } from "./src/comparator.js";
import { normalizeId } from "./src/datParser.js";
import { parseTableRows, tableRowsFromDatBytes } from "./src/tableSource.js";
import { parsePdfBuffer } from "./src/pdfChinuchParser.js";
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

function buildSummary(results) {
  return {
    total: results.length,
    match: results.filter((r) => r.status === "match").length,
    mismatch: results.filter((r) => r.status === "mismatch").length,
    missing: results.filter((r) => r.status === "missing_pdf" || r.status === "missing_dat").length,
    error: results.filter((r) => r.status === "error").length,
  };
}

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
      const resp = await fetch(apiUrl, {
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
    const order = { error: 0, mismatch: 1, missing_pdf: 2, missing_dat: 3, match: 4 };
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
 * הממשק עובד אחד-על-אחד - כל קריאה נושאת ת"ז אחת ומסמך אחד:
 *   {
 *     "rows": [ { "MISPAR_TNUA": "9050", "MISPAR_ZEHUT": "...", ... }, ... ],
 *     "pdf":  { "filename": "a.pdf", "content": "<base64>" }
 *   }
 * rows - שורות LD_CHINUCH_9050_TKUFOT_RETSIF של אותה ת"ז; שמות העמודות
 * כמפתחות. בקשה עם יותר מת"ז אחת ב-rows נדחית עם 400.
 * התשובה: { valid, text, idNumber, summary, warnings, results }.
 */
app.post("/api/compare", express.json({ limit: "200mb" }), async (req, res) => {
  const startedAt = Date.now();
  const stamp = new Date().toISOString();
  const { rows, pdf } = req.body ?? {};
  if (!Array.isArray(rows)) {
    console.log(`[${stamp}] /api/compare מ-${req.ip}: בקשה נדחתה - חסר rows`);
    return res.status(400).json({ error: "נדרש שדה rows: מערך שורות מהטבלה הזמנית" });
  }
  if (!pdf || typeof pdf !== "object" || Array.isArray(pdf)) {
    console.log(`[${stamp}] /api/compare מ-${req.ip}: בקשה נדחתה - חסר pdf`);
    return res.status(400).json({ error: "נדרש שדה pdf: { filename, content (base64) } - מסמך אחד לקריאה" });
  }
  const pdfs = [pdf];
  console.log(`[${stamp}] /api/compare מ-${req.ip}: התקבלו ${rows.length} שורות טבלה ומסמך "${pdf.filename ?? "?"}"`);

  const datResult = parseTableRows(rows);

  // אכיפת מצב אחד-על-אחד: כל קריאה נושאת ת"ז אחת בלבד
  const idsInRows = Object.keys(datResult.periodsById);
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

  const pdfResults = [];
  for (let i = 0; i < pdfs.length; i++) {
    const { filename = `pdf-${i + 1}`, content } = pdfs[i] ?? {};
    try {
      if (typeof content !== "string" || content === "") {
        throw new Error("שדה content חסר או ריק");
      }
      pdfResults.push([filename, await parsePdfBuffer(Buffer.from(content, "base64"))]);
    } catch (exc) {
      // קובץ פגום לא מפיל את כל הבקשה - מדווח כתוצאת שגיאה עבור הקובץ הזה
      pdfResults.push([filename, {
        idNumber: null,
        periods: [],
        warnings: [],
        errors: [`שגיאה בפענוח ${filename}: ${exc.message}`],
      }]);
    }
  }

  const { results, warnings } = compareAll(datResult, pdfResults);
  const summary = buildSummary(results);
  // אינדיקציית תקינות לפי האפיון: 1 רק כשכל ההשוואות תקינות במלואן
  const valid = summary.total > 0 && summary.match === summary.total ? 1 : 0;
  console.log(
    `    הושוו ${summary.total} ת"ז (תואמות: ${summary.match}, שונות: ${summary.mismatch}, ` +
    `חסרות: ${summary.missing}, שגיאות: ${summary.error}) => valid=${valid}, ${Date.now() - startedAt}ms`
  );
  res.json({
    valid,
    idNumber: idsInRows.length === 1 ? idsInRows[0] : null,
    text: unifiedText(results, warnings),
    summary,
    warnings,
    results,
  });
});

const PORT = process.env.PORT || 5000;
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  app.listen(PORT, "127.0.0.1", () => {
    console.log(`השרת פעיל: http://localhost:${PORT}`);
  });
}

export { app };
