/**
 * בדיקות למקור הטבלה הזמנית (tableSource) ול-API (POST /api/compare).
 *
 * בדיקת הליבה: אותם נתונים שמגיעים דרך קובץ DAT ודרך שורות טבלה חייבים
 * להניב בדיוק את אותה תוצאת פענוח.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";

import { compareAll } from "../src/comparator.js";
import { decodeDat, parseDatFile } from "../src/parsers/datParser.js";
import { parsePdfFile } from "../src/parsers/pdfChinuchParser.js";
import { parseTableRows } from "../src/tableSource.js";
import { app } from "../server.js";

const SAMPLES = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "samples");

/**
 * המרת שורת DAT לרשומת טבלה, לפי סדר העמודות בבלוק 9050 של LD_Chinuch.ctl:
 * MISPAR_TNUA, KOD_PEULA, SEMEL_MISRAD, MISPAR_ZEHUT, ZIHUY_NOSAF, SUG_TKUFA,
 * TAARICH_ME, TAARICH_AD, ORECH_SHERUT, SUG_ZECHUYOT_LEGIMLA, HEKEF_MISRA.
 */
function datLineToRow(line, seq) {
  const f = line.replace(/\s+$/, "").split("~");
  return {
    MISPAR_TNUA: f[0],
    KOD_PEULA: f[1],
    SEMEL_MISRAD: f[2],
    MISPAR_ZEHUT: f[3],
    ZIHUY_NOSAF: f[4],
    SUG_TKUFA: f[5],
    TAARICH_ME: f[6],
    TAARICH_AD: f[7],
    ORECH_SHERUT: f[8],
    SUG_ZECHUYOT_LEGIMLA: f[9],
    HEKEF_MISRA: f[10],
    SEQ: seq,
  };
}

/** שורות הדוגמה כפי שהיו נראות בטבלה הזמנית (רק רשומות 9050, SEQ = מספר שורה). */
function sampleTableRows() {
  const text = decodeDat(fs.readFileSync(path.join(SAMPLES, "sample.dat")));
  return text
    .split(/\r\n|\r|\n/)
    .map((line, i) => [line, i + 1])
    .filter(([line]) => line.startsWith("9050~"))
    .map(([line, lineNo]) => datLineToRow(line, lineNo));
}

const ROW_12345678 = {
  MISPAR_TNUA: "9050",
  MISPAR_ZEHUT: "012345678",
  SUG_TKUFA: "9999",
  TAARICH_ME: "01092010",
  TAARICH_AD: "31082015",
  ORECH_SHERUT: "06000",
  SUG_ZECHUYOT_LEGIMLA: "02",
  HEKEF_MISRA: "1000",
  SEQ: 1,
};

describe("פענוח שורות מהטבלה הזמנית", () => {
  it("שקילות מלאה לפענוח ה-DAT על נתוני הדוגמה", () => {
    const fromDat = parseDatFile(path.join(SAMPLES, "sample.dat"));
    const fromTable = parseTableRows(sampleTableRows());
    assert.deepEqual(fromTable, fromDat);
  });

  it("רשומות שאינן 9050 מדולגות בשקט", () => {
    const res = parseTableRows([{ ...ROW_12345678, MISPAR_TNUA: "9022" }, ROW_12345678]);
    assert.equal(res.periodsById["12345678"].length, 1);
    assert.equal(res.errors.length, 0);
  });

  it("שמות עמודות באותיות קטנות מתקבלים גם כן", () => {
    const lower = Object.fromEntries(
      Object.entries(ROW_12345678).map(([k, v]) => [k.toLowerCase(), v])
    );
    const res = parseTableRows([lower]);
    assert.equal(res.periodsById["12345678"].length, 1);
  });

  it("שורות פגומות מדווחות כשגיאות ומדולגות", () => {
    const res = parseTableRows([
      ROW_12345678,
      { ...ROW_12345678, SUG_TKUFA: "XXXX", TAARICH_ME: "01092015", SEQ: 2 }, // לא מספרי
      { ...ROW_12345678, MISPAR_ZEHUT: null, SEQ: 3 },                        // עמודה חסרה
      "לא אובייקט",
    ]);
    assert.equal(res.periodsById["12345678"].length, 1);
    assert.equal(res.errors.length, 3);
    assert.ok(res.errors[0].includes("שורה 2"));
    assert.ok(res.errors[1].includes("MISPAR_ZEHUT"));
  });

  it("אזהרה על תקופות כפולות", () => {
    const res = parseTableRows([ROW_12345678, { ...ROW_12345678, SEQ: 2 }]);
    assert.ok(res.warnings.some((w) => w.includes("אותם תאריכים")));
  });

  it("קלט שאינו מערך מוחזר כשגיאה", () => {
    const res = parseTableRows({ not: "array" });
    assert.equal(res.errors.length, 1);
  });
});

describe("השוואה מלאה מנתוני הטבלה הזמנית", () => {
  it("תוצאות זהות לקבצי הדוגמה", async () => {
    const table = parseTableRows(sampleTableRows());
    const pdfs = [];
    for (const fname of fs.readdirSync(SAMPLES).sort()) {
      if (fname.endsWith(".pdf")) {
        pdfs.push([fname, await parsePdfFile(path.join(SAMPLES, fname))]);
      }
    }
    const { results } = compareAll(table, pdfs);
    const byId = new Map(results.map((r) => [r.idNumber, r]));
    assert.equal(byId.get("12345678").status, "match");
    assert.equal(byId.get("23456789").status, "mismatch");
    assert.equal(byId.get("34567890").status, "missing_pdf");
    assert.equal(byId.get("45678901").status, "missing_dat");
  });
});

describe("POST /api/compare", () => {
  let server;
  let baseUrl;

  before(async () => {
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => server.close());

  async function post(body, { full = false } = {}) {
    const resp = await fetch(`${baseUrl}/api/compare${full ? "?full=1" : ""}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return [resp.status, await resp.json()];
  }

  const pdfOf = (id) => ({
    filename: `sample_${id}.pdf`,
    content: fs.readFileSync(path.join(SAMPLES, `sample_${id}.pdf`)).toString("base64"),
  });
  const rowsOf = (id) => sampleTableRows().filter((r) => r.MISPAR_ZEHUT === id);

  it('קריאה נפרדת לכל ת"ז, כמו המעטפת והמערכת הקיימת', async () => {
    // ת"ז תקינה במלואה
    let [status, body] = await post({ rows: rowsOf("012345678"), pdf: pdfOf("12345678") });
    assert.equal(status, 200);
    assert.equal(body.valid, 1);
    assert.equal(body.idNumber, "12345678");
    assert.ok(body.text.includes("זהה במלואו"));

    // ת"ז עם אי-התאמות - עם ?full=1 מקבלים גם את הפירוט המלא
    [status, body] = await post({ rows: rowsOf("023456789"), pdf: pdfOf("23456789") }, { full: true });
    assert.equal(status, 200);
    assert.equal(body.valid, 0);
    assert.equal(body.summary.mismatch, 1);
    assert.ok(body.text.includes("מול"));

    // מסמך שאין לו שורות בטבלה
    [status, body] = await post({ rows: [], pdf: pdfOf("45678901") }, { full: true });
    assert.equal(status, 200);
    assert.equal(body.valid, 0);
    assert.equal(body.results[0].status, "missing_dat");
  });

  it("התשובה כברירת מחדל רזה: valid, idNumber, rows, text בלבד", async () => {
    const [status, body] = await post({ rows: rowsOf("012345678"), pdf: pdfOf("12345678") });
    assert.equal(status, 200);
    assert.deepEqual(Object.keys(body).sort(), ["idNumber", "rows", "text", "valid"]);
  });

  it("form-data: ה-PDF מצורף כקובץ ממש ו-rows כשדה טקסט", async () => {
    const fd = new FormData();
    fd.append("rows", JSON.stringify(rowsOf("012345678")));
    fd.append(
      "pdf",
      new Blob([fs.readFileSync(path.join(SAMPLES, "sample_12345678.pdf"))], { type: "application/pdf" }),
      "sample_12345678.pdf"
    );
    const resp = await fetch(`${baseUrl}/api/compare`, { method: "POST", body: fd });
    const body = await resp.json();
    assert.equal(resp.status, 200);
    assert.equal(body.valid, 1);
    assert.equal(body.idNumber, "12345678");
    assert.ok(body.rows.every((r) => r.valid === 1));
  });

  it("form-data עם rows שאינו JSON תקין נדחה ב-400", async () => {
    const fd = new FormData();
    fd.append("rows", "לא JSON");
    fd.append("pdf", new Blob([Buffer.from("x")], { type: "application/pdf" }), "a.pdf");
    const resp = await fetch(`${baseUrl}/api/compare`, { method: "POST", body: fd });
    assert.equal(resp.status, 400);
  });

  it("התשובה מחזירה את השורות שנשלחו עם valid לכל שורה", async () => {
    const sent = rowsOf("023456789");
    const [status, body] = await post({ rows: sent, pdf: pdfOf("23456789") });
    assert.equal(status, 200);
    assert.equal(body.rows.length, sent.length);
    // השורות חוזרות כפי שנשלחו, בתוספת valid (ו-reason כשלא תקין)
    for (const [i, row] of body.rows.entries()) {
      assert.equal(row.MISPAR_ZEHUT, sent[i].MISPAR_ZEHUT);
      assert.equal(row.SEQ, sent[i].SEQ);
      assert.ok(row.valid === 0 || row.valid === 1);
      if (row.valid === 0) assert.ok(row.reason.length > 0);
    }
    const byStart = new Map(body.rows.map((r) => [r.TAARICH_ME, r]));
    assert.equal(byStart.get("01092000").valid, 1);                    // תואמת במלואה
    assert.equal(byStart.get("01092005").valid, 0);                    // היקף משרה שונה
    assert.ok(byStart.get("01092005").reason.includes("היקף משרה"));
    assert.equal(byStart.get("01092013").valid, 0);                    // אין תקופה כזו במסמך
  });

  it('יותר מת"ז אחת בקריאה נדחית ב-400', async () => {
    const [status, body] = await post({ rows: sampleTableRows(), pdf: pdfOf("12345678") });
    assert.equal(status, 400);
    assert.ok(body.error.includes("אחד-על-אחד"));
  });

  it("בקשה ללא rows נדחית", async () => {
    const [status] = await post({ pdf: pdfOf("12345678") });
    assert.equal(status, 400);
  });

  it("בקשה ללא pdf נדחית", async () => {
    const [status, body] = await post({ rows: rowsOf("012345678") });
    assert.equal(status, 400);
    assert.ok(body.error.includes("pdf"));
  });

  it("PDF פגום מדווח כשגיאה בלי להפיל את הבקשה", async () => {
    const [status, body] = await post({
      rows: rowsOf("012345678"),
      pdf: { filename: "broken.pdf", content: Buffer.from("לא PDF").toString("base64") },
    }, { full: true });
    assert.equal(status, 200);
    assert.equal(body.valid, 0);
    assert.equal(body.summary.error, 1);
  });
});
