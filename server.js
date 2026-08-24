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

import { compareAll } from "./src/comparator.js";
import { parseDatBytes } from "./src/datParser.js";
import { parseTableRows } from "./src/tableSource.js";
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

    const datResult = parseDatBytes(datFile.buffer);

    const pdfResults = [];
    for (const f of pdfFiles) {
      // שמות קבצים מגיעים מהדפדפן ב-latin1 - המרה חזרה ל-UTF-8 לתצוגה נכונה
      const fname = Buffer.from(f.originalname, "latin1").toString("utf8");
      pdfResults.push([fname, await parsePdfBuffer(f.buffer)]);
    }

    const { results, warnings } = compareAll(datResult, pdfResults);
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
 * גוף הבקשה (application/json):
 *   {
 *     "rows": [ { "MISPAR_TNUA": "9050", "MISPAR_ZEHUT": "...", ... }, ... ],
 *     "pdfs": [ { "filename": "a.pdf", "content": "<base64>" }, ... ]
 *   }
 * rows - שורות LD_CHINUCH_9050_TKUFOT_RETSIF; שמות העמודות כמפתחות.
 * התשובה: { summary, warnings, results } - אותם נתונים שמוצגים במסך התוצאות.
 */
app.post("/api/compare", express.json({ limit: "200mb" }), async (req, res) => {
  const startedAt = Date.now();
  const stamp = new Date().toISOString();
  const { rows, pdfs } = req.body ?? {};
  if (!Array.isArray(rows)) {
    console.log(`[${stamp}] /api/compare מ-${req.ip}: בקשה נדחתה - חסר rows`);
    return res.status(400).json({ error: "נדרש שדה rows: מערך שורות מהטבלה הזמנית" });
  }
  if (!Array.isArray(pdfs) || pdfs.length === 0) {
    console.log(`[${stamp}] /api/compare מ-${req.ip}: בקשה נדחתה - חסר pdfs`);
    return res.status(400).json({ error: "נדרש שדה pdfs: מערך של { filename, content (base64) }" });
  }
  console.log(`[${stamp}] /api/compare מ-${req.ip}: התקבלו ${rows.length} שורות טבלה ו-${pdfs.length} קבצי PDF`);

  // לתחקור: אם מוגדר API_DUMP_DIR, גוף הבקשה נשמר שם כקובץ JSON
  if (process.env.API_DUMP_DIR) {
    const fs = await import("node:fs");
    fs.mkdirSync(process.env.API_DUMP_DIR, { recursive: true });
    const dumpPath = path.join(process.env.API_DUMP_DIR, `request_${stamp.replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(dumpPath, JSON.stringify(req.body, null, 2));
    console.log(`    גוף הבקשה נשמר: ${dumpPath}`);
  }

  const datResult = parseTableRows(rows);

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
  console.log(
    `    הושוו ${summary.total} ת"ז (תואמות: ${summary.match}, שונות: ${summary.mismatch}, ` +
    `חסרות: ${summary.missing}, שגיאות: ${summary.error}) תוך ${Date.now() - startedAt}ms`
  );
  res.json({ summary, warnings, results });
});

const PORT = process.env.PORT || 5000;
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  app.listen(PORT, "127.0.0.1", () => {
    console.log(`השרת פעיל: http://localhost:${PORT}`);
  });
}

export { app };
