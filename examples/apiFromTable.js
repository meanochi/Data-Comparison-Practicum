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
import { fileURLToPath, pathToFileURL } from "node:url";

import { DB_PATH } from "./simulateCtlLoad.js";

const { DatabaseSync } = await import("node:sqlite").catch(() => {
  console.error("נדרש Node 22.5 ומעלה (מודול node:sqlite המובנה).");
  process.exit(1);
});

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** שליפת שורות הטבלה: כל שורה - אובייקט {עמודה: ערך}, כמו SELECT ב-Oracle. */
export function readTableRows(dbPath = DB_PATH) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const rows = db
    .prepare("SELECT * FROM LD_CHINUCH_9050_TKUFOT_RETSIF ORDER BY SEQ")
    .all();
  db.close();
  return rows;
}

/** קריאת כל קבצי ה-PDF שבתיקייה, ב-base64. */
export function readPdfs(pdfDir) {
  return fs
    .readdirSync(pdfDir)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .sort()
    .map((f) => ({
      filename: f,
      content: fs.readFileSync(path.join(pdfDir, f)).toString("base64"),
    }));
}

/** הקריאה ל-API. מחזיר { summary, warnings, results }; זורק שגיאה על כישלון. */
export async function compareViaApi(baseUrl, rows, pdfs) {
  const resp = await fetch(`${baseUrl}/api/compare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows, pdfs }),
  });
  if (!resp.ok) {
    throw new Error(`שגיאה ${resp.status}: ${await resp.text()}`);
  }
  return resp.json();
}

/** הדפסת תוצאות ההשוואה לקונסול. */
export function printComparison({ summary, warnings, results }) {
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
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const baseUrl = process.argv[2] ?? "http://localhost:5000";
  const pdfDir = process.argv[3] ?? path.join(HERE, "..", "samples");

  if (!fs.existsSync(DB_PATH)) {
    console.error(`לא נמצאה הטבלה (${DB_PATH}) - יש להריץ קודם: node examples/simulateCtlLoad.js`);
    process.exit(1);
  }
  const rows = readTableRows();
  const pdfs = readPdfs(pdfDir);
  console.log(`נשלפו ${rows.length} שורות מהטבלה; שולח עם ${pdfs.length} קבצי PDF אל ${baseUrl}/api/compare ...`);
  printComparison(await compareViaApi(baseUrl, rows, pdfs));
}
