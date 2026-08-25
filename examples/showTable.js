/**
 * הצגת תוכן הטבלה הזמנית - הוכחה שהטעינה באמת קרתה.
 *
 * מציג כמה שורות יש בטבלה, מתי נטענו (LOAD_DATE), פילוח לפי מספר זהות,
 * ואת השורות עצמן.
 *
 * הרצה:  node examples/showTable.js [מספר-שורות-להצגה]
 *        (ברירת מחדל: 10; אפשר "all" להצגת הכל)
 * דורש Node 22.5 ומעלה (node:sqlite מובנה).
 */
import fs from "node:fs";

import { DB_PATH } from "./simulateCtlLoad.js";

const { DatabaseSync } = await import("node:sqlite").catch(() => {
  console.error("נדרש Node 22.5 ומעלה (מודול node:sqlite המובנה).");
  process.exit(1);
});

if (!fs.existsSync(DB_PATH)) {
  console.error(`הטבלה עוד לא נבנתה (אין ${DB_PATH}) - יש להריץ טעינה קודם.`);
  process.exit(1);
}

const arg = process.argv[2] ?? "10";
const limit = arg === "all" ? Number.MAX_SAFE_INTEGER : parseInt(arg, 10);

const db = new DatabaseSync(DB_PATH, { readOnly: true });
const total = db.prepare("SELECT COUNT(*) n FROM LD_CHINUCH_9050_TKUFOT_RETSIF").get().n;
console.log(`טבלת LD_CHINUCH_9050_TKUFOT_RETSIF (${DB_PATH})`);
console.log(`סה"כ שורות: ${total}`);

if (total > 0) {
  const loadDates = db
    .prepare("SELECT DISTINCT LOAD_DATE FROM LD_CHINUCH_9050_TKUFOT_RETSIF")
    .all()
    .map((r) => r.LOAD_DATE);
  console.log(`מועד הטעינה (LOAD_DATE, UTC): ${loadDates.join(", ")}`);

  console.log("\nפילוח לפי מספר זהות:");
  for (const r of db.prepare(
    "SELECT MISPAR_ZEHUT, COUNT(*) n FROM LD_CHINUCH_9050_TKUFOT_RETSIF GROUP BY MISPAR_ZEHUT ORDER BY MISPAR_ZEHUT"
  ).all()) {
    console.log(`  ${r.MISPAR_ZEHUT}: ${r.n} תקופות`);
  }

  console.log(`\nהשורות עצמן${total > limit ? ` (${limit} הראשונות; להצגת הכל: node examples/showTable.js all)` : ""}:`);
  console.table(
    db.prepare(
      `SELECT SEQ, MISPAR_ZEHUT, SUG_TKUFA, TAARICH_ME, TAARICH_AD,
              ORECH_SHERUT, SUG_ZECHUYOT_LEGIMLA, HEKEF_MISRA
       FROM LD_CHINUCH_9050_TKUFOT_RETSIF ORDER BY SEQ LIMIT ?`
    ).all(limit)
  );
}
db.close();
