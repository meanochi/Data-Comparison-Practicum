/**
 * הזרימה האמיתית מקצה לקצה: שליפה מאורקל ושליחה ל-API, אחד-על-אחד.
 *
 * זהה ל-apiFromTable.js, רק שהמקור הוא Oracle אמיתי (הקונטיינר מ-oracle/,
 * או - בהמשך - האורקל של המערכת הקיימת, ע"י שינוי פרטי החיבור בלבד).
 *
 * דרישה חד-פעמית:  npm install oracledb
 * (דרייבר ה-thin של oracledb הוא JavaScript טהור - לא צריך Oracle Client)
 *
 * הרצה (כשהשרת פעיל ב-npm start והאורקל טעון):
 *     node examples/apiFromOracle.js [http://localhost:5000] [תיקיית-PDF]
 * פרטי חיבור (ברירות המחדל תואמות את oracle/docker-compose.yml):
 *     ORACLE_USER=chinuch  ORACLE_PASSWORD=chinuch123  ORACLE_CONNECT=localhost:1521/FREEPDB1
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compareIdViaApi, groupRowsById, pdfForId } from "./apiFromTable.js";

const oracledb = await import("oracledb").then((m) => m.default).catch(() => {
  console.error("חסרה ספריית oracledb - יש להתקין פעם אחת:  npm install oracledb");
  process.exit(1);
});

const HERE = path.dirname(fileURLToPath(import.meta.url));
const baseUrl = process.argv[2] ?? "http://localhost:5000";
const pdfDir = process.argv[3] ?? path.join(HERE, "..", "samples");

const connection = await oracledb.getConnection({
  user: process.env.ORACLE_USER ?? "chinuch",
  password: process.env.ORACLE_PASSWORD ?? "chinuch123",
  connectString: process.env.ORACLE_CONNECT ?? "localhost:1521/FREEPDB1",
});

// כל שורה חוזרת כאובייקט {עמודה: ערך} - בדיוק הפורמט ששדה rows מצפה לו
const { rows } = await connection.execute(
  "SELECT * FROM LD_CHINUCH_9050_TKUFOT_RETSIF ORDER BY SEQ",
  [],
  { outFormat: oracledb.OUT_FORMAT_OBJECT }
);
await connection.close();

const byId = groupRowsById(rows);
console.log(`נשלפו ${rows.length} שורות מאורקל, ${byId.size} תעודות זהות - קריאה נפרדת לכל אחת:`);
for (const [id, idRows] of byId) {
  const pdf = pdfForId(pdfDir, id);
  if (!pdf) {
    console.log(`\nת"ז ${id}: לא נמצא מסמך PDF בתיקייה - לא נשלחה קריאה`);
    continue;
  }
  const body = await compareIdViaApi(baseUrl, idRows, pdf);
  console.log(`\nת"ז ${id} (${pdf.filename}): valid=${body.valid}`);
  console.log(body.text.split("\n").map((l) => `  ${l}`).join("\n"));
}
