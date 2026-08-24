/**
 * סימולציה של הטעינה שקורית במציאות: SQL*Loader עם LD_Chinuch.ctl.
 *
 * במערכת הקיימת רץ:
 *     sqlldr ... control=LD_Chinuch.ctl data=TIK_..._MIMSHAK_LA_OTZAR.dat
 * שטוען את קובץ ה-DAT לטבלאות LD_CHINUCH_*. הסקריפט הזה משחזר את בלוק
 * ה-9050 של ה-CTL בדיוק, לתוך טבלת SQLite מקומית (examples/chinuch.db):
 *
 *     truncate                             -> ריקון הטבלה לפני הטעינה
 *     when MISPAR_TNUA = '9050'            -> רק שורות 9050 נטענות
 *     fields terminated by '~'             -> פיצול לפי טילדה
 *     TRAILING NULLCOLS                    -> שדות חסרים בסוף שורה = NULL
 *     "trim(:FIELD)"                       -> trim לכל שדה
 *     LOAD_DATE SYSDATE                    -> חותמת זמן הטעינה
 *     seq sequence(1,1)                    -> מספר רץ לפי סדר השורות בקובץ
 *
 * הרצה:  node examples/simulateCtlLoad.js [נתיב-לקובץ-DAT]
 *        (ברירת מחדל: samples/sample.dat)
 * דורש Node 22.5 ומעלה (node:sqlite מובנה).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { decodeDat } from "../src/datParser.js";

const { DatabaseSync } = await import("node:sqlite").catch(() => {
  console.error("נדרש Node 22.5 ומעלה (מודול node:sqlite המובנה).");
  process.exit(1);
});

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DB_PATH = path.join(HERE, "chinuch.db");
const datPath = process.argv[2] ?? path.join(HERE, "..", "samples", "sample.dat");

// סדר העמודות בבלוק ה-9050 של LD_Chinuch.ctl (לפי סדר השדות בקובץ)
const FILE_COLUMNS = [
  "MISPAR_TNUA", "KOD_PEULA", "SEMEL_MISRAD", "MISPAR_ZEHUT", "ZIHUY_NOSAF",
  "SUG_TKUFA", "TAARICH_ME", "TAARICH_AD", "ORECH_SHERUT",
  "SUG_ZECHUYOT_LEGIMLA", "HEKEF_MISRA",
];

const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS LD_CHINUCH_9050_TKUFOT_RETSIF (
    MISPAR_TNUA          TEXT,
    KOD_PEULA            TEXT,
    SEMEL_MISRAD         TEXT,
    MISPAR_ZEHUT         TEXT,
    ZIHUY_NOSAF          TEXT,
    SUG_TKUFA            TEXT,
    TAARICH_ME           TEXT,
    TAARICH_AD           TEXT,
    ORECH_SHERUT         TEXT,
    SUG_ZECHUYOT_LEGIMLA TEXT,
    HEKEF_MISRA          TEXT,
    LOAD_DATE            TEXT,
    SEQ                  INTEGER
  )
`);
db.exec("DELETE FROM LD_CHINUCH_9050_TKUFOT_RETSIF"); // truncate

const insert = db.prepare(`
  INSERT INTO LD_CHINUCH_9050_TKUFOT_RETSIF
    (${FILE_COLUMNS.join(", ")}, LOAD_DATE, SEQ)
  VALUES (${FILE_COLUMNS.map(() => "?").join(", ")}, datetime('now'), ?)
`);

const lines = decodeDat(fs.readFileSync(datPath)).split(/\r\n|\r|\n/);
let seq = 0;
let skipped = 0;
for (const line of lines) {
  const fields = line.replace(/\s+$/, "").split("~");
  if (fields[0]?.trim() !== "9050") {           // when MISPAR_TNUA = '9050'
    if (line.trim() !== "") skipped++;
    continue;
  }
  const values = FILE_COLUMNS.map((_, i) => fields[i]?.trim() ?? null); // trim + TRAILING NULLCOLS
  // נאמן ל-CTL כפי שהוא: SEMEL_MISRAD מקבל את ערך KOD_PEULA (כנראה באג ב-CTL,
  // אבל כך הטבלה נראית במציאות; לא משפיע על ההשוואה)
  values[2] = values[1];
  insert.run(...values, ++seq);                 // seq sequence(1,1)
}
db.close();

console.log(`נטענו ${seq} שורות 9050 לטבלת LD_CHINUCH_9050_TKUFOT_RETSIF (${DB_PATH})`);
console.log(`${skipped} שורות מסוגים אחרים לא נטענו (תנאי ה-when), כמו במציאות.`);
