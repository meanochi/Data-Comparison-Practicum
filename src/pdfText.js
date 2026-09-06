/**
 * שכבת חילוץ טקסט גנרית מקובצי PDF (mupdf).
 *
 * השכבה הזו אינה יודעת דבר על מבנה דוח ספציפי - היא רק ממירה PDF לרשימת
 * שורות טקסט בסדר חזותי, לכל עמוד. פרסרים של דוחות (כמו pdfChinuchParser.js)
 * בנויים מעליה, ופורמט דוח חדש = פרסר חדש שמשתמש באותה שכבה.
 *
 * מה השכבה פותרת:
 *
 * 1. עברית בסדר חזותי: חילוץ טקסט מ-PDF עברי מחזיר את האותיות בסדר שבו הן
 *    מצוירות על הדף (שמאל לימין), כלומר עברית הפוכה וספרות בסדר רגיל.
 *    למשל "פחות מ-1/3" מחולץ כ-"1/3-מ תוחפ". הפונקציות toVisual/toLogical
 *    ממירות בין שתי הצורות (פעולה סימטרית).
 *
 * 2. עצמאות מ-BiDi: כל תו נאסף עם קואורדינטת ה-X שלו וממוין משמאל לימין
 *    בתוך כל שורה, כך שמתקבל תמיד הסדר החזותי שעל הדף (זהה לפלט של
 *    pdfplumber בפייתון) ללא תלות בסידור ה-BiDi הפנימי של ספריית החילוץ.
 *
 * 3. פונטים משובצים ללא ToUnicode: בדוחות אמיתיים הפונטים העבריים הם לרוב
 *    Type0 בקידוד Identity-H ללא טבלת ToUnicode, כך שהטקסט בקובץ מפנה
 *    למספרי גליפים (GID) ולא לתווים. הפתרון (כמו ב-pdfminer): קריאת טבלת
 *    ה-cmap מתוך קובץ הפונט המשובץ (FontFile2) והיפוכה למיפוי GID -> Unicode.
 *
 * 4. קיבוץ שורות לפי קו הבסיס (Y) על פני כל העמוד - כי בדוחות טבלאיים כל
 *    תא הוא פיסת טקסט נפרדת - והוספת רווח כשיש מרווח גיאומטרי ממשי.
 */
import * as mupdf from "mupdf";

// בחלק מהפונטים העבריים המשובצים (ללא ToUnicode תקין) טבלת ה-cmap עצמה
// ממפה את האלף-בית העברי (א-ת, כולל אותיות סופיות: 0x05D0-0x05EA) בהיסט
// קבוע של 0x330 אל תחום IPA Extensions (0x02A0-0x02BA) - תחום שלא אמור
// להכיל טקסט עברי אמיתי, ולכן בטוח לתקן אוטומטית בכל מקום שבו מופיע.
const HEBREW_CMAP_SHIFT_LOW = 0x02a0;
const HEBREW_CMAP_SHIFT_HIGH = 0x02ba;
const HEBREW_CMAP_SHIFT_OFFSET = 0x0330;
function fixHebrewCmapShift(codePoint) {
  if (codePoint >= HEBREW_CMAP_SHIFT_LOW && codePoint <= HEBREW_CMAP_SHIFT_HIGH) {
    return codePoint + HEBREW_CMAP_SHIFT_OFFSET;
  }
  return codePoint;
}

// באותם פונטים, גם תווי פיסוק (רווח, נקודתיים) יוצאים כתווי בקרה שגויים -
// אבל בהיסט אחר מזה של האותיות. תווי הבקרה האלה (U+0000-U+001F) לא אמורים
// להופיע בטקסט אמיתי בכלל, אז בטוח למפות אותם תמיד.
const CONTROL_CHAR_FIX = new Map([
  [0x03, 0x20], // רווח
  [0x1d, 0x3a], // נקודתיים ':'
]);
function fixControlChar(codePoint) {
  return CONTROL_CHAR_FIX.get(codePoint) ?? codePoint;
}

// מרווח אופקי (בנקודות) שמעליו מוכנס רווח בין תווים סמוכים -
// מקביל ל-x_tolerance של pdfplumber.
const SPACE_GAP = 3;

// תווים באותה שורת טקסט: הפרש עד 3 נקודות בקו הבסיס (y_tolerance של pdfplumber)
const LINE_Y_TOLERANCE = 3;

/** היפוך מחרוזת תוך שמירת רצפי ספרות (וסימנים כמו / % .) בסדר המקורי. */
function reverseKeepDigits(s) {
  const tokens = s.match(/[0-9/.%()]+|[^0-9/.%()]+/g) || [];
  return tokens
    .reverse()
    .map((tok) => (/^[0-9/.%()]/.test(tok) ? tok : [...tok].reverse().join("")))
    .join("");
}

/** תווית עברית לוגית -> הצורה שבה היא מופיעה בטקסט המחולץ מה-PDF. */
export function toVisual(logical) {
  return reverseKeepDigits(logical);
}

/** טקסט מחולץ (חזותי) -> עברית לוגית. פעולה סימטרית להיפוך. */
export function toLogical(visual) {
  return reverseKeepDigits(visual);
}

/** נרמול מקפים מסוגים שונים (כולל מקף רך U+00AD ומקף עברי) למקף רגיל. */
export function normalizeDashes(s) {
  return s.replace(/[­־‐-―]/g, "-");
}

/** פענוח טבלת cmap של פונט TrueType: מחזיר מיפוי GID -> קוד יוניקוד. */
function ttfGidToUnicode(bytes) {
  try {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const u16 = (o) => dv.getUint16(o);
    const u32 = (o) => dv.getUint32(o);
    let base = 0;
    if (u32(0) === 0x74746366) base = u32(12); // 'ttcf' - אוסף פונטים, לוקחים את הראשון
    const numTables = u16(base + 4);
    let cmapOff = null;
    for (let i = 0; i < numTables; i++) {
      const rec = base + 12 + i * 16;
      const tag = String.fromCharCode(bytes[rec], bytes[rec + 1], bytes[rec + 2], bytes[rec + 3]);
      if (tag === "cmap") { cmapOff = u32(rec + 8); break; }
    }
    if (cmapOff === null) return null;

    // בחירת תת-הטבלה העדיפה: (3,10) מלא, (3,1) יוניקוד, (0,*), (3,0) סמלים
    const n = u16(cmapOff + 2);
    let best = null, bestScore = -1, bestSymbol = false;
    for (let i = 0; i < n; i++) {
      const rec = cmapOff + 4 + i * 8;
      const plat = u16(rec), enc = u16(rec + 2), off = u32(rec + 4);
      let score = 0;
      if (plat === 3 && enc === 10) score = 5;
      else if (plat === 3 && enc === 1) score = 4;
      else if (plat === 0) score = 3;
      else if (plat === 3 && enc === 0) score = 1;
      if (score > bestScore) { bestScore = score; best = cmapOff + off; bestSymbol = plat === 3 && enc === 0; }
    }
    if (best === null) return null;

    const map = new Map();
    const put = (code, gid) => {
      if (bestSymbol && code >= 0xf000 && code <= 0xf0ff) code -= 0xf000;
      if (gid !== 0 && !map.has(gid)) map.set(gid, code);
    };
    const format = u16(best);
    if (format === 4) {
      const segX2 = u16(best + 6);
      const endO = best + 14, startO = endO + segX2 + 2, deltaO = startO + segX2, rangeO = deltaO + segX2;
      for (let s = 0; s < segX2; s += 2) {
        const end = u16(endO + s), start = u16(startO + s);
        const delta = dv.getInt16(deltaO + s), ro = u16(rangeO + s);
        if (start === 0xffff) continue;
        for (let code = start; code <= end; code++) {
          let gid;
          if (ro === 0) {
            gid = (code + delta) & 0xffff;
          } else {
            const gi = rangeO + s + ro + (code - start) * 2;
            if (gi + 1 >= bytes.byteLength) continue;
            gid = u16(gi);
            if (gid !== 0) gid = (gid + delta) & 0xffff;
          }
          put(code, gid);
        }
      }
    } else if (format === 12) {
      const nGroups = u32(best + 12);
      for (let g = 0; g < nGroups; g++) {
        const o = best + 16 + g * 12;
        const sc = u32(o), ec = u32(o + 4), sg = u32(o + 8);
        for (let c = sc; c <= ec; c++) put(c, sg + (c - sc));
      }
    } else if (format === 6) {
      const first = u16(best + 6), cnt = u16(best + 8);
      for (let i = 0; i < cnt; i++) put(first + i, u16(best + 10 + i * 2));
    } else if (format === 0) {
      for (let c = 0; c < 256; c++) put(c, bytes[best + 6 + c]);
    } else {
      return null;
    }
    return map;
  } catch {
    return null;
  }
}

/**
 * מיפויי GID -> Unicode לכל הפונטים במסמך שהם Type0 ללא ToUnicode.
 * המפתח הוא שם ה-BaseFont, שהוא גם השם ש-walk מדווח לכל תו.
 */
function buildGidMaps(doc) {
  const maps = new Map();
  const numPages = doc.countPages();
  for (let i = 0; i < numPages; i++) {
    const page = doc.loadPage(i);
    try {
      const res = page.getObject().get("Resources");
      if (!res || res.isNull()) continue;
      const fonts = res.resolve().get("Font");
      if (!fonts || fonts.isNull()) continue;
      fonts.forEach((fontRef) => {
        try {
          const f = fontRef.resolve();
          if (String(f.get("Subtype")) !== "/Type0") return;
          const tu = f.get("ToUnicode");
          if (tu && !tu.isNull()) return; // ל-mupdf יש כבר פענוח מלא
          const name = String(f.get("BaseFont")).replace(/^\//, "");
          if (maps.has(name)) return;
          const dFont = f.get("DescendantFonts").resolve().get(0).resolve();
          const fd = dFont.get("FontDescriptor").resolve();
          const ff = fd.get("FontFile2");
          let entry = null;
          if (ff && !ff.isNull()) {
            const gidToUni = ttfGidToUnicode(ff.readStream().asUint8Array());
            if (gidToUni) {
              let cidToGid = null;
              const c2g = dFont.get("CIDToGIDMap");
              if (c2g && !c2g.isNull() && c2g.isStream && c2g.isStream()) {
                cidToGid = c2g.readStream().asUint8Array();
              }
              entry = { gidToUni, cidToGid };
            }
          }
          maps.set(name, entry); // null = פונט שלא ניתן לפענח
        } catch {
          /* פונט בעייתי - נתעלם, תווים ממנו יסומנו כלא מפוענחים */
        }
      });
    } finally {
      page.destroy();
    }
  }
  return maps;
}

/** חילוץ שורות הטקסט החזותיות של עמוד אחד. */
function pageToVisualLines(page, gidMaps, unmappedFonts) {
  // inhibit-spaces: בלי רווחים מסונתזים של mupdf (הם מקבלים את הפונט של התו
  // הקודם ומתנגשים עם פענוח ה-GID); הרווחים נבנים אצלנו מהמרווח הגיאומטרי.
  const st = page.toStructuredText("preserve-whitespace,use-cid-for-unknown-unicode,inhibit-spaces");
  const chars = [];
  try {
    st.walk({
      onChar(c, origin, font, size, quad) {
        // תו מפונט Type0 ללא ToUnicode מגיע כמספר גליף (GID) - מפוענח דרך ה-cmap
        const info = gidMaps.get(font.getName());
        if (info !== undefined) {
          let cid = c.codePointAt(0);
          if (info && info.cidToGid) {
            cid = (info.cidToGid[2 * cid] << 8) | info.cidToGid[2 * cid + 1];
          }
          const uni = info ? info.gidToUni.get(cid) : undefined;
          if (uni === undefined) {
            unmappedFonts.add(font.getName());
            c = "�";
          } else {
            c = String.fromCodePoint(uni);
          }
        }
        // תיקון ההיסט חל תמיד, גם כשהתו הגיע ישירות מטבלת ToUnicode של mupdf
        // (לא רק מהמיפוי המותאם למעלה) - כי גם ToUnicode עצמה יכולה להיות מוזזת.
        if (c !== "�") {
          c = [...c]
            .map((ch) => fixControlChar(fixHebrewCmapShift(ch.codePointAt(0))))
            .map((cp) => String.fromCodePoint(cp))
            .join("");
        }
        // quad: [ulx, uly, urx, ury, llx, lly, lrx, lry]
        chars.push({
          c,
          left: Math.min(quad[0], quad[4]),
          right: Math.max(quad[2], quad[6]),
          y: origin[1],
        });
      },
    });
  } finally {
    st.destroy();
  }

  // קיבוץ לשורות לפי קו הבסיס, מלמעלה למטה
  chars.sort((a, b) => a.y - b.y || a.left - b.left);
  const lines = [];
  let current = null;
  let currentY = null;
  for (const ch of chars) {
    if (current === null || Math.abs(ch.y - currentY) > LINE_Y_TOLERANCE) {
      current = [];
      currentY = ch.y;
      lines.push(current);
    }
    current.push(ch);
  }

  return lines.map((lineChars) => {
    lineChars.sort((a, b) => a.left - b.left);
    let text = "";
    let prevRight = null;
    for (const ch of lineChars) {
      if (prevRight !== null && ch.left - prevRight > SPACE_GAP && !/\s/.test(text.slice(-1))) {
        text += " ";
      }
      text += ch.c;
      prevRight = ch.right;
    }
    // כיווץ רצפי רווחים כדי שהתוויות יתאימו למיפוי גם אם נוצר רווח כפול
    return text.replace(/\s+/g, " ").trim();
  });
}

/**
 * חילוץ כל שורות הטקסט מקובץ PDF, בסדר חזותי.
 *
 * מחזיר { pages: [[שורות עמוד 1], [שורות עמוד 2], ...], unmappedFonts: [שמות] }.
 * זורק שגיאה על קובץ פגום/מוצפן - באחריות הקורא לתפוס.
 */
export function extractVisualLines(buf) {
  const doc = mupdf.Document.openDocument(new Uint8Array(buf), "application/pdf");
  try {
    const gidMaps = buildGidMaps(doc);
    const unmappedFonts = new Set();
    const pages = [];
    for (let i = 0; i < doc.countPages(); i++) {
      const page = doc.loadPage(i);
      try {
        pages.push(pageToVisualLines(page, gidMaps, unmappedFonts));
      } finally {
        page.destroy();
      }
    }
    return { pages, unmappedFonts: [...unmappedFonts] };
  } finally {
    doc.destroy();
  }
}
