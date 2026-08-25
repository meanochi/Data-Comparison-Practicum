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
import { decodeDat, parseDatFile } from "../src/datParser.js";
import { parsePdfFile } from "../src/pdfChinuchParser.js";
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

  async function post(body) {
    const resp = await fetch(`${baseUrl}/api/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return [resp.status, await resp.json()];
  }

  it("השוואה מלאה דרך ה-API", async () => {
    const pdfs = fs
      .readdirSync(SAMPLES)
      .filter((f) => f.endsWith(".pdf"))
      .map((f) => ({
        filename: f,
        content: fs.readFileSync(path.join(SAMPLES, f)).toString("base64"),
      }));
    const [status, body] = await post({ rows: sampleTableRows(), pdfs });
    assert.equal(status, 200);
    assert.equal(body.summary.total, 4);
    assert.equal(body.summary.match, 1);
    assert.equal(body.summary.mismatch, 1);
    assert.equal(body.summary.missing, 2);
    const byId = new Map(body.results.map((r) => [r.idNumber, r]));
    assert.equal(byId.get("12345678").percent, 100.0);
    // חוזה האפיון: אינדיקציית תקינות וטקסט מאוחד
    assert.equal(body.valid, 0);
    assert.ok(body.text.includes('ת"ז 12345678: זהה במלואו'));
    assert.ok(body.text.includes("מול"));
  });

  it("valid=1 כשכל ההשוואות תקינות, כולל שדה pdf בודד לפי האפיון", async () => {
    const rows = sampleTableRows().filter((r) => r.MISPAR_ZEHUT === "012345678");
    const pdf = {
      filename: "sample_12345678.pdf",
      content: fs.readFileSync(path.join(SAMPLES, "sample_12345678.pdf")).toString("base64"),
    };
    const [status, body] = await post({ rows, pdf });
    assert.equal(status, 200);
    assert.equal(body.valid, 1);
    assert.equal(body.summary.match, body.summary.total);
  });

  it("בקשה ללא rows נדחית", async () => {
    const [status] = await post({ pdfs: [{ filename: "a.pdf", content: "AA==" }] });
    assert.equal(status, 400);
  });

  it("בקשה ללא pdfs נדחית", async () => {
    const [status] = await post({ rows: [] });
    assert.equal(status, 400);
  });

  it("PDF פגום מדווח כשגיאה בלי להפיל את הבקשה", async () => {
    const [status, body] = await post({
      rows: sampleTableRows(),
      pdfs: [{ filename: "broken.pdf", content: Buffer.from("לא PDF").toString("base64") }],
    });
    assert.equal(status, 200);
    assert.equal(body.summary.error, 1);
  });
});
