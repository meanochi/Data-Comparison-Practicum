/**
 * דוגמת לקוח ל-API: כך המערכת הקיימת אמורה לקרוא ל-POST /api/compare.
 *
 * בפועל המערכת הקיימת שולפת את השורות מהטבלה הזמנית
 * (SELECT על LD_CHINUCH_9050_TKUFOT_RETSIF) ומצרפת את קבצי ה-PDF.
 * הדוגמה כאן בונה את אותה בקשה בדיוק מתוך נתוני הדוגמה שב-samples/:
 * שורות ה-9050 של sample.dat ממלאות את תפקיד שורות הטבלה.
 *
 * הרצה (כשהשרת פעיל ב-npm start):
 *     node examples/apiClientDemo.js [http://localhost:5000]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { decodeDat } from "../src/datParser.js";

const SAMPLES = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "samples");
const baseUrl = process.argv[2] ?? "http://localhost:5000";

// --- 1. שורות הטבלה הזמנית -------------------------------------------------
// במערכת האמיתית זו תוצאת SELECT מהטבלה; שמות העמודות הם המפתחות.
// כאן: המרת שורות ה-9050 של קובץ הדוגמה לפי סדר העמודות ב-LD_Chinuch.ctl.
const COLUMNS = [
  "MISPAR_TNUA", "KOD_PEULA", "SEMEL_MISRAD", "MISPAR_ZEHUT", "ZIHUY_NOSAF",
  "SUG_TKUFA", "TAARICH_ME", "TAARICH_AD", "ORECH_SHERUT",
  "SUG_ZECHUYOT_LEGIMLA", "HEKEF_MISRA",
];

const rows = decodeDat(fs.readFileSync(path.join(SAMPLES, "sample.dat")))
  .split(/\r\n|\r|\n/)
  .filter((line) => line.startsWith("9050~"))
  .map((line, i) => {
    const fields = line.replace(/\s+$/, "").split("~");
    const row = Object.fromEntries(COLUMNS.map((col, c) => [col, fields[c] ?? null]));
    row.SEQ = i + 1; // ה-CTL ממלא את SEQ לפי סדר השורות בקובץ המקורי
    return row;
  });

// --- 2. קבצי ה-PDF ב-base64 ------------------------------------------------
const pdfs = fs
  .readdirSync(SAMPLES)
  .filter((f) => f.endsWith(".pdf"))
  .map((f) => ({
    filename: f,
    content: fs.readFileSync(path.join(SAMPLES, f)).toString("base64"),
  }));

// --- 3. הקריאה עצמה ---------------------------------------------------------
console.log(`שולח ${rows.length} שורות טבלה ו-${pdfs.length} קבצי PDF אל ${baseUrl}/api/compare ...`);
const resp = await fetch(`${baseUrl}/api/compare`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ rows, pdfs }),
});
if (!resp.ok) {
  console.error(`שגיאה ${resp.status}:`, await resp.text());
  process.exit(1);
}

// --- 4. שימוש בתשובה --------------------------------------------------------
const { summary, warnings, results } = await resp.json();
console.log("\nסיכום:", summary);
for (const w of warnings) console.log("אזהרה:", w);
console.log("");
for (const r of results) {
  console.log(
    `ת"ז ${r.idNumber}: ${r.status}` +
    (r.totalCompared ? ` (${r.matched}/${r.totalCompared} תקופות תואמות, ${r.percent}%)` : "")
  );
  for (const row of r.rows) {
    for (const d of row.diffs) {
      console.log(`    ${row.startDisplay} - ${row.endDisplay} | ${d.fieldName}: ` +
        `PDF="${d.pdfValue}" מול טבלה="${d.datValue}"`);
    }
  }
}
