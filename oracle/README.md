# סביבת אורקל מקומית — שחזור מדויק של המערכת הקיימת

הערכה הזו מריצה **אורקל אמיתי** (Oracle Database Free בקונטיינר Docker),
יוצרת בו את 10 טבלאות הקליטה, וטוענת קובץ DAT עם **sqlldr האמיתי וקובץ
ה-CTL המקורי** (`LD_Chinuch.ctl`) — בדיוק כמו בייצור, בלי סימולציות.

דרישה: Docker Desktop מותקן. ההורדה הראשונה של האימג' היא ~1.2GB.

**תאימות גרסה:** המערכת הקיימת רצה על Oracle Database 19c Enterprise
Edition. הקונטיינר כאן מריץ Oracle Database Free (23ai) - גרסה חדשה
יותר, אך עם אותה שפת SQL/PL/SQL ואותו sqlldr במהות. `create_tables.sql`
ו-`rows_json.sql` נכתבו במכוון בתחביר שתואם 19c ומעלה (לא משתמשים
בתחביר חדש שקיים רק ב-23c) - כך שהם ירוצו ללא שינוי גם מול 19c אמיתי,
לא רק מול הקונטיינר. הבדלי הגרסאות הנותרים (פיצ'רי Enterprise כמו
partitioning/RAC) אינם רלוונטיים למשימה הפשוטה של טעינה ושליפה.

## 1. הרמת האורקל (חד-פעמי)

```powershell
cd oracle
docker compose up -d
docker logs -f oracle-chinuch      # לחכות לשורה: DATABASE IS READY TO USE (ואז Ctrl+C)
```

## 2. יצירת הטבלאות (חד-פעמי; אפשר להריץ שוב - מוחק ויוצר מחדש)

```powershell
docker exec -i oracle-chinuch sqlplus -s chinuch/chinuch123@localhost/FREEPDB1 "@/opt/chinuch/create_tables.sql"
```

(המרכאות סביב `@/opt/...` נדרשות ב-PowerShell: בלעדיהן `@` בתחילת פרמטר
מתפרש כתחביר מיוחד של PowerShell עצמו - "Unrecognized token" - לפני
שהפקודה בכלל מגיעה לדוקר.)

## 3. טעינת קובץ DAT — ה-sqlldr האמיתי עם ה-CTL המקורי

שמים את קובץ ה-DAT בתיקיית `oracle/` (היא ממופה לקונטיינר), ואז:

```powershell
docker exec -e NLS_LANG=HEBREW_ISRAEL.IW8PC1507 oracle-chinuch `
  sqlldr chinuch/chinuch123@localhost/FREEPDB1 `
  control=/opt/chinuch/LD_Chinuch.ctl data=/opt/chinuch/sample.dat
```

(`NLS_LANG=...IW8PC1507` מפרש נכון את הקידוד העברי הישן של הקובץ, DOS-862.
שימו לב: ה-CTL האמיתי טוען את **כל** 10 סוגי הרשומות, לא רק 9050.)

sqlldr ידפיס כמה שורות נטענו לכל טבלה; קובצי log/bad נכתבים לתיקייה.

## 4. שליפת ה-rows של ת"ז כ-JSON (מה שהמערכת הקיימת שולחת)

```powershell
docker exec oracle-chinuch sqlplus -s chinuch/chinuch123@localhost/FREEPDB1 `
  "@/opt/chinuch/rows_json.sql" 012345678
```

את הפלט מדביקים בשדה `rows` בפוסטמן. זו בדיוק השאילתה שהצד השני יריץ:
`JSON_ARRAYAGG(JSON_OBJECT(*))`.

## 5. או: הזרימה האוטומטית המלאה מול ה-API

```powershell
npm install oracledb              # חד-פעמי
npm start                         # טרמינל אחד
node examples/apiFromOracle.js    # טרמינל שני: אורקל -> API, קריאה לכל ת"ז
```

פרטי החיבור ניתנים לדריסה במשתני סביבה (`ORACLE_USER`, `ORACLE_PASSWORD`,
`ORACLE_CONNECT`) — כך שאותו סקריפט בדיוק יעבוד גם מול אורקל אחר.

## ניהול הסביבה

```powershell
docker compose stop      # עצירה (הנתונים נשמרים)
docker compose start     # הפעלה מחדש
docker compose down -v   # מחיקה מלאה כולל הנתונים
```

**נתוני אמת:** קובצי DAT אמיתיים שהונחו כאן לטעינה — למחוק כשמסיימים,
והם לא ייכנסו לגיט (מוחרגים ב-.gitignore).
