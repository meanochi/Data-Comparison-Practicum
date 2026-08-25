/**
 * יצירת קולקציית Postman לבדיקת ה-API, עם תרחישי בדיקה למקרי קצה.
 *
 * הסקריפט בונה את הבקשות מנתוני הדוגמה שב-samples/ (כולל ה-PDF-ים ב-base64,
 * מוטמעים בגוף הבקשה) וכותב את הקובץ examples/postman_collection.json.
 * בכל תרחיש מוטמעים גם Tests של Postman שמאמתים את התשובה אוטומטית.
 *
 * שימוש:
 *   1. node examples/makePostmanCollection.js
 *   2. Postman -> Import -> examples/postman_collection.json
 *   3. להריץ כשהשרת פעיל (npm start); כתובת השרת במשתנה הקולקציה baseUrl.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { decodeDat } from "../src/datParser.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES = path.join(HERE, "..", "samples");
const OUT = path.join(HERE, "postman_collection.json");

// --- בניית הנתונים מהדוגמאות ------------------------------------------------
const COLUMNS = [
  "MISPAR_TNUA", "KOD_PEULA", "SEMEL_MISRAD", "MISPAR_ZEHUT", "ZIHUY_NOSAF",
  "SUG_TKUFA", "TAARICH_ME", "TAARICH_AD", "ORECH_SHERUT",
  "SUG_ZECHUYOT_LEGIMLA", "HEKEF_MISRA",
];

const allRows = decodeDat(fs.readFileSync(path.join(SAMPLES, "sample.dat")))
  .split(/\r\n|\r|\n/)
  .filter((line) => line.startsWith("9050~"))
  .map((line, i) => {
    const f = line.replace(/\s+$/, "").split("~");
    return { ...Object.fromEntries(COLUMNS.map((c, j) => [c, f[j] ?? null])), SEQ: i + 1 };
  });

const rowsOf = (id) => allRows.filter((r) => r.MISPAR_ZEHUT === id);
const pdfOf = (id) => ({
  filename: `sample_${id}.pdf`,
  content: fs.readFileSync(path.join(SAMPLES, `sample_${id}.pdf`)).toString("base64"),
});
const allPdfs = ["12345678", "23456789", "45678901"].map(pdfOf);

// --- עזרי Postman ------------------------------------------------------------
function request(name, body, testLines) {
  return {
    name,
    event: [{
      listen: "test",
      script: { type: "text/javascript", exec: testLines },
    }],
    request: {
      method: "POST",
      header: [{ key: "Content-Type", value: "application/json" }],
      url: {
        raw: "{{baseUrl}}/api/compare",
        host: ["{{baseUrl}}"],
        path: ["api", "compare"],
      },
      body: { mode: "raw", raw: JSON.stringify(body, null, 1) },
    },
  };
}

const ok = 'pm.test("סטטוס 200", () => pm.response.to.have.status(200));';
const json = "const body = pm.response.json();";

// --- התרחישים ----------------------------------------------------------------
const collection = {
  info: {
    name: "השוואת נתוני תקופות עבודה - API",
    description:
      "תרחישי בדיקה ל-POST /api/compare. להריץ כשהשרת פעיל (npm start). " +
      "נוצר על ידי examples/makePostmanCollection.js מנתוני הדוגמה.",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  variable: [{ key: "baseUrl", value: "http://localhost:5000" }],
  item: [
    request(
      "1. תקין לחלוטין - valid=1",
      { rows: rowsOf("012345678"), pdfs: [pdfOf("12345678")] },
      [ok, json,
        'pm.test("valid=1", () => pm.expect(body.valid).to.eql(1));',
        'pm.test("ההתאמה מלאה", () => pm.expect(body.summary.match).to.eql(body.summary.total));',
        'pm.test("יש טקסט מאוחד", () => pm.expect(body.text).to.include("זהה במלואו"));'],
    ),
    request(
      "2. אי-התאמות - valid=0 עם פירוט הפערים",
      { rows: rowsOf("023456789"), pdfs: [pdfOf("23456789")] },
      [ok, json,
        'pm.test("valid=0", () => pm.expect(body.valid).to.eql(0));',
        'pm.test("יש אי-התאמות", () => pm.expect(body.summary.mismatch).to.be.above(0));',
        'pm.test("הטקסט מפרט פערים", () => pm.expect(body.text).to.include("מול"));'],
    ),
    request(
      "3. כל נתוני הדוגמה - כולל חסרים בשני הצדדים",
      { rows: allRows, pdfs: allPdfs },
      [ok, json,
        'pm.test("valid=0", () => pm.expect(body.valid).to.eql(0));',
        'pm.test("4 מספרי זהות", () => pm.expect(body.summary.total).to.eql(4));',
        'pm.test("2 חסרים בצד אחד", () => pm.expect(body.summary.missing).to.eql(2));'],
    ),
    request(
      "4. שדה pdf בודד (לפי האפיון) במקום מערך",
      { rows: rowsOf("012345678"), pdf: pdfOf("12345678") },
      [ok, json,
        'pm.test("valid=1", () => pm.expect(body.valid).to.eql(1));'],
    ),
    request(
      "5. מקרה קצה: חסר rows - נדחה עם 400",
      { pdfs: [pdfOf("12345678")] },
      ['pm.test("סטטוס 400", () => pm.response.to.have.status(400));',
        json,
        'pm.test("הודעת שגיאה", () => pm.expect(body.error).to.include("rows"));'],
    ),
    request(
      "6. מקרה קצה: חסר pdf - נדחה עם 400",
      { rows: rowsOf("012345678") },
      ['pm.test("סטטוס 400", () => pm.response.to.have.status(400));'],
    ),
    request(
      "7. מקרה קצה: PDF פגום - לא מפיל את הבקשה",
      {
        rows: rowsOf("012345678"),
        pdfs: [{ filename: "broken.pdf", content: Buffer.from("לא PDF").toString("base64") }],
      },
      [ok, json,
        'pm.test("valid=0", () => pm.expect(body.valid).to.eql(0));',
        'pm.test("שגיאה אחת", () => pm.expect(body.summary.error).to.eql(1));'],
    ),
    request(
      "8. מקרה קצה: rows ריק - הכל מדווח כחסר בנתונים",
      { rows: [], pdfs: [pdfOf("12345678")] },
      [ok, json,
        'pm.test("valid=0", () => pm.expect(body.valid).to.eql(0));',
        'pm.test("חסר בנתונים", () => pm.expect(body.results[0].status).to.eql("missing_dat"));'],
    ),
    request(
      '9. מקרה קצה: pdf בודד עם יותר מת"ז אחת - נדחה עם 400',
      { rows: allRows, pdf: pdfOf("12345678") },
      ['pm.test("סטטוס 400", () => pm.response.to.have.status(400));',
        json,
        'pm.test("הודעה על אחד-על-אחד", () => pm.expect(body.error).to.include("אחד-על-אחד"));'],
    ),
    request(
      "10. מקרה קצה: שורה עם ערך לא מספרי - מדולגת עם אזהרה",
      {
        rows: [
          ...rowsOf("012345678"),
          { ...rowsOf("012345678")[0], SUG_TKUFA: "XXX", TAARICH_ME: "01011999", SEQ: 99 },
        ],
        pdfs: [pdfOf("12345678")],
      },
      [ok, json,
        'pm.test("השורה הפגומה דווחה", () => pm.expect(JSON.stringify(body.warnings)).to.include("99"));'],
    ),
  ],
};

fs.writeFileSync(OUT, JSON.stringify(collection, null, 2));
console.log(`נוצרה קולקציית Postman עם ${collection.item.length} תרחישים: ${OUT}`);
console.log("ייבוא: Postman -> Import -> בחירת הקובץ. להריץ כשהשרת פעיל (npm start).");
