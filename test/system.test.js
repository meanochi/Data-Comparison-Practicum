/** בדיקות מערכת: פענוח DAT, פענוח PDF והשוואה, על קבצי הדוגמה שב-samples/. */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { before, describe, it } from "node:test";

import iconv from "iconv-lite";

import {
  ROW_DAT_ONLY,
  ROW_DIFF,
  ROW_MATCH,
  ROW_PDF_ONLY,
  compareAll,
} from "../src/comparator.js";
import { parseDatBytes, parseDatFile } from "../src/parsers/datParser.js";
import { parsePdfFile, toLogical, toVisual } from "../src/parsers/pdfChinuchParser.js";

const SAMPLES = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "samples");

// ---------- פענוח בסיסי ----------

describe("היפוך חזותי/לוגי", () => {
  it("פעולה סימטרית על תוויות", () => {
    for (const label of ["פחות מ-1/3", 'חל"ת', "נושא זכויות", "שבתון", "הפעלת סעיף 99"]) {
      assert.equal(toLogical(toVisual(label)), label);
    }
    // ספרות נשארות בסדר לוגי בצורה החזותית
    assert.ok(toVisual("פחות מ-1/3").startsWith("1/3"));
  });
});

describe("פענוח DAT", () => {
  it("פענוח קובץ הדוגמה", () => {
    const dat = parseDatFile(path.join(SAMPLES, "sample.dat"));
    assert.deepEqual(
      Object.keys(dat.periodsById).sort(),
      ["12345678", "23456789", "34567890"]
    );
    const p = dat.periodsById["12345678"][0];
    assert.equal(p.sugTkufa, 9999);
    assert.equal(p.start, "01092010");
    assert.equal(p.end, "31082015");
    assert.equal(p.months, 60.0);
    assert.equal(p.sugZchuyot, 2);
    assert.equal(p.heikef, 1.0);
    assert.equal(dat.errors.length, 0);
    assert.equal(dat.warnings.length, 0);
  });

  it("שורות פגומות מדווחות כשגיאות", () => {
    const data = iconv.encode(
      "9050~0~1099~012345678~0~9999~01092010~31082015~06000~02~1000\r\n" +
      "9050~0~1099~012345678~0~XXXX~01092015~31082016~01200~68~1000\r\n" + // לא מספרי
      "9050~0~1099\r\n", // קצרה מדי
      "cp862"
    );
    const res = parseDatBytes(data);
    assert.equal(res.periodsById["12345678"].length, 1);
    assert.equal(res.errors.length, 2);
  });

  it("אזהרה על תקופות כפולות", () => {
    const row = "9050~0~1099~012345678~0~9999~01092010~31082015~06000~02~1000\r\n";
    const res = parseDatBytes(iconv.encode(row + row, "cp862"));
    assert.ok(res.warnings.some((w) => w.includes("אותם תאריכים")));
  });
});

describe("פענוח PDF", () => {
  it("פענוח קובץ הדוגמה", async () => {
    const pres = await parsePdfFile(path.join(SAMPLES, "sample_12345678.pdf"));
    assert.equal(pres.idNumber, "12345678");
    assert.equal(pres.errors.length, 0);
    assert.equal(pres.periods.length, 5);
    const byKey = new Map(pres.periods.map((p) => [`${p.start}|${p.end}`, p]));
    const p = byKey.get("01092015|31082016");
    assert.equal(p.zchuyotLabel, "פחות מ-1/3");
    assert.equal(p.heikef, 0.3);
    assert.equal(p.months, 12.0);
    const sab = byKey.get("01092016|31082017");
    assert.equal(sab.tkufaLabel, "שבתון");
    assert.equal(sab.zchuyotLabel, "שבתון");
  });
});

// ---------- השוואה ----------

describe("השוואה מלאה על קבצי הדוגמה", () => {
  let res;

  before(async () => {
    const dat = parseDatFile(path.join(SAMPLES, "sample.dat"));
    const fs = await import("node:fs");
    const pdfs = [];
    for (const fname of fs.readdirSync(SAMPLES).sort()) {
      if (fname.endsWith(".pdf")) {
        pdfs.push([fname, await parsePdfFile(path.join(SAMPLES, fname))]);
      }
    }
    const { results } = compareAll(dat, pdfs);
    res = new Map(results.map((r) => [r.idNumber, r]));
  });

  it("התאמה מלאה כולל עזיבה מוחרגת", () => {
    const r = res.get("12345678");
    assert.equal(r.status, "match");
    assert.equal(r.totalCompared, 5);
    assert.equal(r.matched, 5);
    assert.equal(r.percent, 100.0);
    // שורת העזיבה לא נספרת אלא רק מוצגת לידיעה
    assert.equal(r.excluded.length, 1);
    assert.equal(r.excluded[0].sugTkufa, 4);
  });

  it("זיהוי כל אי-ההתאמות המכוונות", () => {
    const r = res.get("23456789");
    assert.equal(r.status, "mismatch");
    assert.equal(r.totalCompared, 7);
    assert.equal(r.matched, 2);
    const rows = new Map(r.rows.map((row) => [`${row.start}|${row.end}`, row]));

    let diff = rows.get("01092005|31082010");
    assert.equal(diff.status, ROW_DIFF);
    assert.deepEqual(diff.diffs.map((d) => d.fieldName), ["היקף משרה"]);

    diff = rows.get("01092010|31082012");
    assert.deepEqual(diff.diffs.map((d) => d.fieldName), ["סוג זכויות"]);

    diff = rows.get("01092012|31082013");
    assert.deepEqual(diff.diffs.map((d) => d.fieldName), ["אורך שירות (חודשים)"]);

    assert.equal(rows.get("01092013|31082014").status, ROW_DAT_ONLY);
    assert.equal(rows.get("01091998|31082000").status, ROW_PDF_ONLY);
    assert.equal(rows.get("01092000|31082005").status, ROW_MATCH);
  });

  it("צדדים חסרים", () => {
    assert.equal(res.get("34567890").status, "missing_pdf");
    assert.equal(res.get("45678901").status, "missing_dat");
  });

  it("כלל השבתון", () => {
    const r = res.get("12345678");
    const sab = r.rows.find((row) => row.start === "01092016");
    assert.equal(sab.status, ROW_MATCH);
  });
});
