-- שליפת שורות ה-9050 של תעודת זהות אחת כ-JSON - בדיוק מה שהמערכת
-- הקיימת תשלח בשדה rows של הקריאה ל-API.
--
-- הרצה (הת"ז כפרמטר, כולל אפס מוביל כפי שנטען מהקובץ):
--   docker exec oracle-chinuch sqlplus -s chinuch/chinuch123@localhost/FREEPDB1 @/opt/chinuch/rows_json.sql 012345678
SET PAGESIZE 0 LONG 2000000 LONGCHUNKSIZE 2000000 LINESIZE 32767 FEEDBACK OFF VERIFY OFF TRIMSPOOL ON
SELECT JSON_ARRAYAGG(JSON_OBJECT(*) ORDER BY SEQ RETURNING CLOB)
FROM   LD_CHINUCH_9050_TKUFOT_RETSIF
WHERE  MISPAR_ZEHUT = '&1';
EXIT
