/**
 * הצד השני של הסימולציה: מה שהמערכת הקיימת עושה מול ה-API שלנו.
 *
 * הממשק עובד אחד-על-אחד: כל קריאה נושאת את שורות הטבלה של תעודת זהות
 * אחת + מסמך ה-PDF שלה. הסקריפט שולף את השורות מהטבלה (SELECT אמיתי,
 * שמות העמודות הופכים למפתחות - כמו ב-Oracle), מקבץ לפי ת"ז, מאתר לכל
 * ת"ז את קובץ ה-PDF שלה לפי שם הקובץ, ושולח קריאה נפרדת לכל אחת.
 *
 * הרצה (אחרי node examples/simulateCtlLoad.js, וכשהשרת פעיל ב-npm start):
 *     node examples/apiFromTable.js [http://localhost:5000] [תיקיית-PDF]
 *        (ברירת מחדל לתיקיית ה-PDF: samples/)
 * דורש Node 22.5 ומעלה (node:sqlite מובנה).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { normalizeId } from "../src/datParser.js";
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

/** קיבוץ שורות הטבלה לפי תעודת זהות (מנורמלת, ללא אפסים מובילים). */
export function groupRowsById(rows) {
  const byId = new Map();
  for (const r of rows) {
    const id = normalizeId(String(r.MISPAR_ZEHUT ?? ""));
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(r);
  }
  return byId;
}

/** איתור מסמך ה-PDF של ת"ז לפי שם הקובץ (עם או בלי אפס מוביל). */
export function pdfForId(pdfDir, idNumber) {
  const hit = fs
    .readdirSync(pdfDir)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .sort()
    .find((f) => f.includes(idNumber) || f.includes(`0${idNumber}`));
  if (!hit) return null;
  return {
    filename: hit,
    content: fs.readFileSync(path.join(pdfDir, hit)).toString("base64"),
  };
}

/** קריאה אחת לפי האפיון: שורות של ת"ז אחת + מסמך PDF אחד. */
export async function compareIdViaApi(baseUrl, rows, pdf) {
  const resp = await fetch(`${baseUrl}/api/compare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows, pdf }),
  });
  if (!resp.ok) {
    throw new Error(`שגיאה ${resp.status}: ${await resp.text()}`);
  }
  return resp.json();
}

/**
 * הזרימה המלאה: קריאה נפרדת לכל ת"ז שבטבלה, עם המסמך שלה מ-pdfDir.
 * מדפיס את התוצאות ומחזיר את רשימת התשובות.
 */
export async function compareAllIds(baseUrl, pdfDir) {
  const byId = groupRowsById(readTableRows());
  console.log(`בטבלה ${byId.size} תעודות זהות - נשלחת קריאה נפרדת לכל אחת:`);
  const responses = [];
  for (const [id, rows] of byId) {
    const pdf = pdfForId(pdfDir, id);
    if (!pdf) {
      console.log(`\nת"ז ${id}: לא נמצא מסמך PDF בתיקייה - לא נשלחה קריאה`);
      continue;
    }
    const body = await compareIdViaApi(baseUrl, rows, pdf);
    responses.push(body);
    console.log(`\nת"ז ${id} (${pdf.filename}): valid=${body.valid}`);
    console.log(body.text.split("\n").map((l) => `  ${l}`).join("\n"));
  }
  return responses;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const baseUrl = process.argv[2] ?? "http://localhost:5000";
  const pdfDir = process.argv[3] ?? path.join(HERE, "..", "samples");

  if (!fs.existsSync(DB_PATH)) {
    console.error(`לא נמצאה הטבלה (${DB_PATH}) - יש להריץ קודם: node examples/simulateCtlLoad.js`);
    process.exit(1);
  }
  await compareAllIds(baseUrl, pdfDir);
}
