-- שליפת שורות ה-9050 של תעודת זהות אחת כ-JSON - בדיוק מה שהמערכת
-- הקיימת תשלח בשדה rows של הקריאה ל-API.
--
-- כתוב בתחביר תואם Oracle 12c ומעלה (כולל 19c Enterprise Edition - הגרסה
-- של המערכת הקיימת): JSON_OBJECT עם מניית עמודות מפורשת, במקום הקיצור
-- JSON_OBJECT(*) שקיים רק בגרסאות חדשות יותר. הפלט זהה לחלוטין.
--
-- הרצה (הת"ז כפרמטר, כולל אפס מוביל כפי שנטען מהקובץ):
--   docker exec oracle-chinuch sqlplus -s chinuch/chinuch123@localhost/FREEPDB1 @/opt/chinuch/rows_json.sql 012345678
SET PAGESIZE 0 LONG 2000000 LONGCHUNKSIZE 2000000 LINESIZE 32767 FEEDBACK OFF VERIFY OFF TRIMSPOOL ON
SELECT JSON_ARRAYAGG(
         JSON_OBJECT(
           'MISPAR_TNUA'          VALUE MISPAR_TNUA,
           'KOD_PEULA'            VALUE KOD_PEULA,
           'SEMEL_MISRAD'         VALUE SEMEL_MISRAD,
           'MISPAR_ZEHUT'         VALUE MISPAR_ZEHUT,
           'ZIHUY_NOSAF'          VALUE ZIHUY_NOSAF,
           'SUG_TKUFA'            VALUE SUG_TKUFA,
           'TAARICH_ME'           VALUE TAARICH_ME,
           'TAARICH_AD'           VALUE TAARICH_AD,
           'ORECH_SHERUT'         VALUE ORECH_SHERUT,
           'SUG_ZECHUYOT_LEGIMLA' VALUE SUG_ZECHUYOT_LEGIMLA,
           'HEKEF_MISRA'          VALUE HEKEF_MISRA,
           'SEQ'                  VALUE SEQ
         )
         ORDER BY SEQ
         RETURNING CLOB)
FROM   LD_CHINUCH_9050_TKUFOT_RETSIF
WHERE  MISPAR_ZEHUT = '&1';
EXIT
