/**
 * בניית גוף בקשה ל-POST /api/compare - כמו במציאות: מתוך הטבלה.
 *
 * במציאות אין קובץ DAT אצל הקורא ל-API - יש שורות בטבלה הזמנית. הסקריפט
 * מפענח את ה-PDF כדי לזהות את תעודת הזהות שלו, שולף מהטבלה
 * (LD_CHINUCH_9050_TKUFOT_RETSIF שנטענה קודם) רק את השורות של אותה ת"ז
 * (חוזה אחד-על-אחד), וכותב קובץ JSON מוכן לשליחה מפוסטמן.
 *
 * שימוש:
 *     node examples/simulateCtlLoad.js [קובץ.dat]     # קודם: מילוי הטבלה
 *     node examples/makeRequestBody.js <קובץ.pdf> [קובץ-פלט.json]
 * ואז בפוסטמן: POST {{baseUrl}}/api/compare, לשונית Body -> raw -> JSON,
 * ומדביקים את תוכן הקובץ.
 */
import fs from "node:fs";

import { normalizeId } from "../src/parsers/datParser.js";
import { parsePdfBuffer } from "../src/parsers/pdfChinuchParser.js";
import { readTableRows } from "./apiFromTable.js";
import { DB_PATH } from "./simulateCtlLoad.js";

const [pdfPath, outPath = "request_body.json"] = process.argv.slice(2);
if (!pdfPath) {
  console.error("שימוש: node examples/makeRequestBody.js <קובץ.pdf> [קובץ-פלט.json]");
  process.exit(1);
}
if (!fs.existsSync(DB_PATH)) {
  console.error(`הטבלה עוד לא נטענה (אין ${DB_PATH}) - יש להריץ קודם: node examples/simulateCtlLoad.js`);
  process.exit(1);
}

const pdfBuf = fs.readFileSync(pdfPath);
const parsed = await parsePdfBuffer(pdfBuf);
if (parsed.idNumber === null) {
  console.error(`לא זוהתה תעודת זהות ב-${pdfPath}:`);
  for (const e of parsed.errors) console.error(`  ${e}`);
  process.exit(1);
}

// מה שהמערכת הקיימת עושה במציאות:
// SELECT * FROM LD_CHINUCH_9050_TKUFOT_RETSIF WHERE <ת"ז> ORDER BY SEQ
const allRows = readTableRows();
const rows = allRows.filter(
  (r) => normalizeId(String(r.MISPAR_ZEHUT ?? "")) === parsed.idNumber
);

const body = {
  rows,
  pdf: { filename: pdfPath.split(/[\\/]/).pop(), content: pdfBuf.toString("base64") },
};
fs.writeFileSync(outPath, JSON.stringify(body, null, 1));

console.log(`ת"ז שזוהתה במסמך: ${parsed.idNumber}`);
console.log(`שורות שנשלפו מהטבלה עבור הת"ז: ${rows.length} (מתוך ${allRows.length} בטבלה)`);
console.log(`נכתב: ${outPath} - מוכן לשליחה מפוסטמן אל POST /api/compare`);
