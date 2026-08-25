/**
 * בניית גוף בקשה ל-POST /api/compare מקובץ DAT וקובץ PDF אמיתיים.
 *
 * הסקריפט ממיר את ה-DAT לשורות בפורמט הטבלה (כמו שהטעינה עושה במציאות),
 * מפענח את ה-PDF כדי לזהות את תעודת הזהות שלו, בוחר מהקובץ רק את השורות
 * של אותה ת"ז (חוזה אחד-על-אחד), וכותב קובץ JSON מוכן לשליחה מפוסטמן.
 *
 * שימוש:
 *     node examples/makeRequestBody.js <קובץ.dat> <קובץ.pdf> [קובץ-פלט.json]
 * ואז בפוסטמן: POST {{baseUrl}}/api/compare, לשונית Body -> raw -> JSON,
 * ומדביקים את תוכן הקובץ (או משתמשים ב-binary/import).
 */
import fs from "node:fs";

import { normalizeId } from "../src/datParser.js";
import { tableRowsFromDatBytes } from "../src/tableSource.js";
import { parsePdfBuffer } from "../src/pdfChinuchParser.js";

const [datPath, pdfPath, outPath = "request_body.json"] = process.argv.slice(2);
if (!datPath || !pdfPath) {
  console.error("שימוש: node examples/makeRequestBody.js <קובץ.dat> <קובץ.pdf> [קובץ-פלט.json]");
  process.exit(1);
}

const pdfBuf = fs.readFileSync(pdfPath);
const parsed = await parsePdfBuffer(pdfBuf);
if (parsed.idNumber === null) {
  console.error(`לא זוהתה תעודת זהות ב-${pdfPath}:`);
  for (const e of parsed.errors) console.error(`  ${e}`);
  process.exit(1);
}

const allRows = tableRowsFromDatBytes(fs.readFileSync(datPath));
const rows = allRows.filter(
  (r) => normalizeId(String(r.MISPAR_ZEHUT ?? "")) === parsed.idNumber
);

const body = {
  rows,
  pdf: { filename: pdfPath.split(/[\\/]/).pop(), content: pdfBuf.toString("base64") },
};
fs.writeFileSync(outPath, JSON.stringify(body, null, 1));

console.log(`ת"ז שזוהתה במסמך: ${parsed.idNumber}`);
console.log(`שורות 9050 של הת"ז בקובץ ה-DAT: ${rows.length} (מתוך ${allRows.length} בסך הכל)`);
console.log(`נכתב: ${outPath} - מוכן לשליחה מפוסטמן אל POST /api/compare`);
