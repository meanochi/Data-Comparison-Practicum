--------------------------------------------------------------------------------
-- LD_CHINUCH_9050_TKUFOT_RETSIF - טבלת יעד ל-SQL*Loader (LD_Chinuch.ctl)
--
-- הטבלה נטענת מקובץ הממשק לאוצר (בלוק רשומות 9050 - "תקופות עבודה") ומועברת
-- דרכה למערכת השוואת הנתונים (ראו src/tableSource.js). כל השדות שמגיעים
-- מהקובץ נטענים כ-VARCHAR2 אחרי TRIM, כפי שמפורש בכתובית ה-CTL
-- ("trim(:FIELD)"); LOAD_DATE ו-SEQ נוצרים בזמן הטעינה עצמה ואינם מגיעים
-- מהקובץ.
--
-- מבנה ואורכי השדות לפי סדר הופעתם בקובץ (src/tableSource.js,
-- src/parsers/datParser.js, examples/simulateCtlLoad.js); בהיעדר LD_Chinuch.ctl
-- עצמו בריפו, אורכי ה-VARCHAR2 נבחרו ברוחב בטוח מעל הערכים הנצפים בדוגמאות
-- ובקודים המתועדים (src/mappings.js) - יש להצר אותם אם ה-CTL האמיתי קובע
-- אחרת.
--------------------------------------------------------------------------------

CREATE TABLE LD_CHINUCH_9050_TKUFOT_RETSIF
(
  MISPAR_TNUA          VARCHAR2(4)  NOT NULL,                  -- קוד רשומה, קבוע '9050'
  KOD_PEULA            VARCHAR2(10),                            -- קוד פעולה - לא בשימוש בהשוואה
  SEMEL_MISRAD         VARCHAR2(10),                            -- סמל משרד - לא בשימוש בהשוואה
  MISPAR_ZEHUT         VARCHAR2(9)  NOT NULL,                  -- מספר זהות, כולל אפס מוביל
  ZIHUY_NOSAF          VARCHAR2(20),                            -- זיהוי נוסף - לא בשימוש בהשוואה
  SUG_TKUFA            VARCHAR2(4)  NOT NULL,                  -- קוד סוג תקופה (CODE_SUG_TKUFA_GOLMI)
  TAARICH_ME           VARCHAR2(8)  NOT NULL,                  -- תאריך התחלה, DDMMYYYY
  TAARICH_AD           VARCHAR2(8)  NOT NULL,                  -- תאריך סיום, DDMMYYYY
  ORECH_SHERUT         VARCHAR2(10) NOT NULL,                  -- אורך שירות בחודשים כפול 100
  SUG_ZECHUYOT_LEGIMLA VARCHAR2(4)  NOT NULL,                  -- קוד סוג זכויות (CODE_SUG_ZCHUYOT)
  HEKEF_MISRA          VARCHAR2(10) NOT NULL,                  -- היקף משרה כפול 1000
  LOAD_DATE            DATE         DEFAULT SYSDATE NOT NULL,  -- חותמת זמן הטעינה
  SEQ                  NUMBER       NOT NULL                   -- מספר רץ לפי סדר השורות בקובץ המקורי
);

COMMENT ON TABLE LD_CHINUCH_9050_TKUFOT_RETSIF IS
  'תקופות עבודה (בלוק 9050 של ממשק ה-DAT לאוצר) - נטענת ב-SQL*Loader לפי LD_Chinuch.ctl';

COMMENT ON COLUMN LD_CHINUCH_9050_TKUFOT_RETSIF.MISPAR_TNUA IS 'קוד רשומה (קבוע: 9050)';
COMMENT ON COLUMN LD_CHINUCH_9050_TKUFOT_RETSIF.KOD_PEULA IS 'קוד פעולה - לא בשימוש בהשוואה';
COMMENT ON COLUMN LD_CHINUCH_9050_TKUFOT_RETSIF.SEMEL_MISRAD IS 'סמל משרד - לא בשימוש בהשוואה';
COMMENT ON COLUMN LD_CHINUCH_9050_TKUFOT_RETSIF.MISPAR_ZEHUT IS 'מספר זהות (כולל אפס מוביל)';
COMMENT ON COLUMN LD_CHINUCH_9050_TKUFOT_RETSIF.ZIHUY_NOSAF IS 'זיהוי נוסף - לא בשימוש בהשוואה';
COMMENT ON COLUMN LD_CHINUCH_9050_TKUFOT_RETSIF.SUG_TKUFA IS 'קוד סוג תקופה, לפי טבלת CODE_SUG_TKUFA_GOLMI';
COMMENT ON COLUMN LD_CHINUCH_9050_TKUFOT_RETSIF.TAARICH_ME IS 'תאריך התחלת התקופה, בפורמט DDMMYYYY';
COMMENT ON COLUMN LD_CHINUCH_9050_TKUFOT_RETSIF.TAARICH_AD IS 'תאריך סיום התקופה, בפורמט DDMMYYYY';
COMMENT ON COLUMN LD_CHINUCH_9050_TKUFOT_RETSIF.ORECH_SHERUT IS 'אורך שירות בחודשים, כפול 100 (למשל 01200 = 12 חודשים)';
COMMENT ON COLUMN LD_CHINUCH_9050_TKUFOT_RETSIF.SUG_ZECHUYOT_LEGIMLA IS 'קוד סוג זכויות לגמלה, לפי טבלת CODE_SUG_ZCHUYOT';
COMMENT ON COLUMN LD_CHINUCH_9050_TKUFOT_RETSIF.HEKEF_MISRA IS 'היקף משרה, כפול 1000 (למשל 0667 = 0.667)';
COMMENT ON COLUMN LD_CHINUCH_9050_TKUFOT_RETSIF.LOAD_DATE IS 'חותמת הזמן שבה נטענה השורה (SYSDATE בזמן הטעינה)';
COMMENT ON COLUMN LD_CHINUCH_9050_TKUFOT_RETSIF.SEQ IS 'מספר רץ לפי סדר השורות בקובץ ה-DAT המקורי';

-- שאילתת השליפה בפועל (src/tableSource.js, examples/apiFromTable.js,
-- examples/makeRequestBody.js) היא SELECT * ... WHERE MISPAR_ZEHUT = :id
-- ORDER BY SEQ - אינדקס מרוכב תומך גם בסינון וגם בסידור בלי מיון נוסף.
CREATE INDEX IX_LD_CHINUCH_9050_ZEHUT ON LD_CHINUCH_9050_TKUFOT_RETSIF (MISPAR_ZEHUT, SEQ);
