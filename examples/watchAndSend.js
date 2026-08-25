/**
 * התהליך המלא כמו בתפעול אמיתי (בסגנון ControlM שמריץ את ה-sqlldr במציאות):
 * מנטרים תיקיית קליטה - ברגע שנוחת בה קובץ DAT, הוא נטען לטבלה (סימולציית
 * ה-CTL), השורות נשלפות ב-SELECT ונשלחות עם קבצי ה-PDF ל-POST /api/compare,
 * והתוצאות מודפסות. הקובץ שטופל מועבר לתיקיית processed/.
 *
 * הרצה (כשהשרת פעיל ב-npm start):
 *     node examples/watchAndSend.js [תיקיית-קליטה] [כתובת-השרת]
 *        ברירות מחדל: examples/incoming/ , http://localhost:5000
 *
 * ואז פשוט:  cp somefile.dat examples/incoming/
 * קבצי PDF שמונחים בתיקיית הקליטה נשלחים יחד עם ה-DAT (ונשארים שם לקבצים
 * הבאים); אם אין בה אף PDF - נלקחים קבצי הדוגמה מ-samples/.
 * דורש Node 22.5 ומעלה (node:sqlite מובנה).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadDatToTable } from "./simulateCtlLoad.js";
import { compareAllIds } from "./apiFromTable.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES = path.join(HERE, "..", "samples");

const watchDir = path.resolve(process.argv[2] ?? path.join(HERE, "incoming"));
const baseUrl = process.argv[3] ?? "http://localhost:5000";
const processedDir = path.join(watchDir, "processed");

fs.mkdirSync(processedDir, { recursive: true });

let busy = Promise.resolve();

async function processDatFile(fname) {
  const fullPath = path.join(watchDir, fname);
  if (!fs.existsSync(fullPath) || fs.statSync(fullPath).size === 0) return;

  console.log(`\n========== נקלט קובץ: ${fname} ==========`);

  // שלב 1: "sqlldr" - טעינה לטבלה לפי הלוגיקה של LD_Chinuch.ctl
  const { loaded, skipped } = loadDatToTable(fullPath);
  console.log(`נטענו ${loaded} שורות 9050 לטבלה (${skipped} שורות מסוגים אחרים דולגו).`);
  if (loaded === 0) {
    console.log("אין שורות 9050 בקובץ - לא נשלחת בקשה.");
  } else {
    // שלב 2: מה שהמערכת הקיימת תעשה - קריאה נפרדת לכל ת"ז (אחד-על-אחד),
    // עם מסמך ה-PDF שלה. המסמכים מאותרים בתיקיית הקליטה, ואם אין בה
    // PDF-ים - בתיקיית הדוגמאות.
    const hasPdfs = fs.readdirSync(watchDir).some((f) => f.toLowerCase().endsWith(".pdf"));
    if (!hasPdfs) console.log("אין קבצי PDF בתיקיית הקליטה - המסמכים יאותרו ב-samples/.");
    await compareAllIds(baseUrl, hasPdfs ? watchDir : SAMPLES);
  }

  // שלב 3: העברה ל-processed/ עם חותמת זמן, כדי שהתיקייה תישאר נקייה
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.renameSync(fullPath, path.join(processedDir, `${stamp}_${fname}`));
  console.log(`הקובץ הועבר אל processed/${stamp}_${fname}`);
  console.log("ממתין לקובץ הבא...");
}

function enqueue(fname) {
  busy = busy
    .then(() => processDatFile(fname))
    .catch((exc) => console.error(`שגיאה בטיפול ב-${fname}:`, exc.message));
}

// קבצים שכבר ממתינים בתיקייה בעת ההפעלה
for (const f of fs.readdirSync(watchDir).sort()) {
  if (f.toLowerCase().endsWith(".dat")) enqueue(f);
}

// ניטור: אירועי fs.watch מגיעים כמה פעמים לכל קובץ - ממתינים רגע שההעתקה
// תסתיים (debounce) ורק אז מטפלים
const timers = new Map();
fs.watch(watchDir, (event, fname) => {
  if (!fname || !fname.toLowerCase().endsWith(".dat")) return;
  clearTimeout(timers.get(fname));
  timers.set(fname, setTimeout(() => {
    timers.delete(fname);
    enqueue(fname);
  }, 500));
});

console.log(`מנטר את ${watchDir}`);
console.log(`קבצי DAT שיונחו כאן ייטענו לטבלה ויישלחו אל ${baseUrl}/api/compare`);
console.log("ממתין לקובץ... (עצירה: Ctrl+C)");
