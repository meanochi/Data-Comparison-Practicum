/**
 * הצד השני של הסימולציה: מה שהמערכת הקיימת עושה מול ה-API שלנו.
 *
 * שולף את השורות מהטבלה (SELECT אמיתי, שמות העמודות הופכים למפתחות של כל
 * רשומת JSON - בדיוק כמו ב-Oracle), מצרף את קבצי ה-PDF ב-base64, ושולח
 * ל-POST /api/compare.
 *
 * הרצה (אחרי node examples/simulateCtlLoad.js, וכשהשרת פעיל ב-npm start):
 *     node examples/apiFromTable.js [http://localhost:5000] [תיקיית-PDF]
 *        (ברירת מחדל לתיקיית ה-PDF: samples/)
 * דורש Node 22.5 ומעלה (node:sqlite מובנה).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { DatabaseSync } = await import("node:sqlite").catch(() => {
  console.error("נדרש Node 22.5 ומעלה (מודול node:sqlite המובנה).");
  process.exit(1);
});

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(HERE, "chinuch.db");
const baseUrl = process.argv[2] ?? "http://localhost:5000";
const pdfDir = process.argv[3] ?? path.join(HERE, "..", "samples");

if (!fs.existsSync(DB_PATH)) {
  console.error(`לא נמצאה הטבלה (${DB_PATH}) - יש להריץ קודם: node examples/simulateCtlLoad.js`);
  process.exit(1);
}

// --- 1. שליפה מהטבלה: כל שורה הופכת לאובייקט {עמודה: ערך} -------------------
const db = new DatabaseSync(DB_PATH, { readOnly: true });
const rows = db
  .prepare("SELECT * FROM LD_CHINUCH_9050_TKUFOT_RETSIF ORDER BY SEQ")
  .all();
db.close();

// --- 2. קבצי ה-PDF ב-base64 ------------------------------------------------
const pdfs = fs
  .readdirSync(pdfDir)
  .filter((f) => f.toLowerCase().endsWith(".pdf"))
  .map((f) => ({
    filename: f,
    content: fs.readFileSync(path.join(pdfDir, f)).toString("base64"),
  }));

// --- 3. הקריאה ל-API --------------------------------------------------------
console.log(`נשלפו ${rows.length} שורות מהטבלה; שולח עם ${pdfs.length} קבצי PDF אל ${baseUrl}/api/compare ...`);
const resp = await fetch(`${baseUrl}/api/compare`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ rows, pdfs }),
});
if (!resp.ok) {
  console.error(`שגיאה ${resp.status}:`, await resp.text());
  process.exit(1);
}

// --- 4. הצגת התשובה ----------------------------------------------------------
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
