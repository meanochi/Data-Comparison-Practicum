/**
 * ממשק ווב להשוואת קבצי DAT מול קבצי PDF.
 *
 * הרצה:  npm start  (או node server.js)  ואז לפתוח בדפדפן  http://localhost:5000
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import multer from "multer";

import { compareAll } from "./src/comparator.js";
import { parseDatBytes } from "./src/datParser.js";
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
    const summary = {
      total: results.length,
      match: results.filter((r) => r.status === "match").length,
      mismatch: results.filter((r) => r.status === "mismatch").length,
      missing: results.filter((r) => r.status === "missing_pdf" || r.status === "missing_dat").length,
      error: results.filter((r) => r.status === "error").length,
    };
    res.render("results", {
      results,
      warnings,
      summary,
      datName: Buffer.from(datFile.originalname, "latin1").toString("utf8"),
      ...helpers,
    });
  }
);

const PORT = process.env.PORT || 5000;
app.listen(PORT, "127.0.0.1", () => {
  console.log(`השרת פעיל: http://localhost:${PORT}`);
});
