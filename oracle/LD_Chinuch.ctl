LOAD DATA 
truncate
into table LD_Chinuch_9030_Avoda_Kodmim  when MISPAR_TNUA = '9030' 
fields terminated by '~' TRAILING NULLCOLS
(
MISPAR_TNUA  POSITION (1) "trim(:MISPAR_TNUA )",
KOD_PEULA "trim(:KOD_PEULA)",
MISPAR_ZEHUT "trim(:MISPAR_ZEHUT)",
ZIHUY_NOSAF "trim(:ZIHUY_NOSAF)",
TAARICH_ME "trim(:TAARICH_ME)",
TAARICH_AD "trim(:TAARICH_AD )",
SUG_MEKOM_AVODA  "trim(:SUG_MEKOM_AVODA )",
SHEM_MAAVID  "trim(:SHEM_MAAVID )",
ZCHUYOT_PENSIA  "trim(:ZCHUYOT_PENSIA )",
KEREN_PENSIA  "trim(:KEREN_PENSIA )",
TAARICH_HESKEM   "trim(:TAARICH_HESKEM )",
LOAD_DATE SYSDATE,
seq sequence(1,1)
)
into table   LD_Chinuch_9050_Tkufot_Retsif when MISPAR_TNUA = '9050' 
fields terminated by '~' TRAILING NULLCOLS
(
MISPAR_TNUA  POSITION (1) "trim(:MISPAR_TNUA )",
KOD_PEULA  "trim(:KOD_PEULA )",
Semel_misrad "trim(:KOD_PEULA )",
MISPAR_ZEHUT  "trim(:MISPAR_ZEHUT )",
ZIHUY_NOSAF  "trim(:ZIHUY_NOSAF )",
SUG_TKUFA  "trim(:SUG_TKUFA )",
TAARICH_ME   "trim(:TAARICH_ME )",
TAARICH_AD   "trim(:TAARICH_AD )",
ORECH_SHERUT  "trim(:ORECH_SHERUT )",
SUG_ZECHUYOT_LEGIMLA "trim(:SUG_ZECHUYOT_LEGIMLA)",
HEKEF_MISRA  "trim(:HEKEF_MISRA )",
LOAD_DATE SYSDATE,
seq sequence(1,1)
)
into table  LD_Chinuch_9022_Pratim_Ishiym when MISPAR_TNUA  = '9022'
fields terminated by '~' TRAILING NULLCOLS
(
MISPAR_TNUA  POSITION (1) ,
KOD_PEULA "trim(:KOD_PEULA)",
SUG_ZIHUY "trim(:SUG_ZIHUY)",
MISPAR_ZEHUT "trim(:MISPAR_ZEHUT)",
ZIHUY_NOSAF "trim(:ZIHUY_NOSAF)",
SHEM_MISHPACHA "trim(:SHEM_MISHPACHA)",
SHEM_PRATI "trim(:SHEM_PRATI)",
MISRAD_AGAF "trim(:MISRAD_AGAF)",
TAA_LEDA  "trim(:TAA_LEDA)",
MIN "trim(:MIN)",
MATSAV_MISHPACHTI "trim(:MATSAV_MISHPACHTI)",
TAA_ALIYA   "trim(:TAA_ALIYA  )",
HORE_SHAKUL   "trim(:HORE_SHAKUL  )",
DOAR_ELEKTRONY "trim(:DOAR_ELEKTRONY)",
LOAD_DATE SYSDATE,
seq sequence(1,1)
)

into table  LD_Chinuch_9023_Oved_Poresh when MISPAR_TNUA  = '9023' 
fields terminated by '~' TRAILING NULLCOLS
(
MISPAR_TNUA  POSITION (1) ,
KOD_PEULA  "trim(:KOD_PEULA )",
MISPAR_ZEHUT  "trim(:MISPAR_ZEHUT )",
ZIHUY_NOSAF "trim(:ZIHUY_NOSAF)",
MACHOZ  "trim(:MACHOZ )",
GANENET "trim(:GANENET)",
MEGAMA "trim(:MEGAMA)",
darga "trim(:darga)",
TAARICH_DARGA "trim(:TAARICH_DARGA)",
KIDUM_DARGA "trim(:KIDUM_DARGA)",
derug_ofek "trim(:derug_ofek)",
dargat_ofek "trim(:dargat_ofek)",
OFEK_CHADASH "trim(:OFEK_CHADASH)",
taarich_hiztarfut_leofek "trim(:taarich_hiztarfut_leofek)",
HEKEF_MISRA_BOFEK "trim(:HEKEF_MISRA_BOFEK)",
taarich_knisa "trim(:taarich_knisa)",
OZ_LETMURA "trim(:OZ_LETMURA)",
taarich_hiztarfut_leoz "trim(:taarich_hiztarfut_leoz)",
GMULEY_HISHTALMUT_OZ "trim(:GMULEY_HISHTALMUT_OZ)",
HEKEF_MISRA_OZ "trim(:HEKEF_MISRA_OZ)",
vetek_horaha "trim(:vetek_horaha)",
vetek_misrad "trim(:vetek_misrad)",
vetek_tzahal "trim(:vetek_tzahal)",
gmuley_hishtalmut "trim(:gmuley_hishtalmut)",
kefel_toar "trim(:kefel_toar)",
gmul_banaim "trim(:gmul_banaim)",
LOAD_DATE SYSDATE,
seq sequence(1,1)
)

into table  LD_Chinuch_9024_Ktovet_Oved when MISPAR_TNUA  = '9024'
fields terminated by '~' TRAILING NULLCOLS
(
MISPAR_TNUA  POSITION (1) ,
KOD_PEULA "trim(:KOD_PEULA)",
MISPAR_ZEHUT "trim(:MISPAR_ZEHUT)",
ZIHUY_NOSAF "trim(:ZIHUY_NOSAF)",
SEMEL_YISHUV "trim(:SEMEL_YISHUV)",
SHEM_RECHOV  "trim(:SHEM_RECHOV )",
MIKUD  "trim(:MIKUD )",
KIDOMET  "trim(:KIDOMET )",
TELEPHONE "trim(:TELEPHONE)",
KIDOMET_NOSEFET  "trim(:KIDOMET_NOSEFET )",
TELEPHONE_NOSAF  "trim(:TELEPHONE_NOSAF )",
TAARICH_KTOVET   "trim(:TAARICH_KTOVET )",
LOAD_DATE SYSDATE,
seq sequence(1,1)
)

into table  LD_Chinuch_9025_bney_Mishpacha when MISPAR_TNUA  = '9025' 
fields terminated by '~' TRAILING NULLCOLS
(
MISPAR_TNUA  POSITION (1) ,
KOD_PEULA "trim(:KOD_PEULA)",
MISPAR_ZEHUT "trim(:MISPAR_ZEHUT)",
ZIHUY_NOSAF "trim(:ZIHUY_NOSAF)",
KIRVA "trim(:KIRVA)",
SHEM_PRATI "trim(:SHEM_PRATI)",
TAARICH_LEDA  "trim(:TAARICH_LEDA)",
ZEHUT  "trim(:ZEHUT )",
METZAYEN "trim(:METZAYEN)",
MEKOM_AVODA "trim(:MEKOM_AVODA)",
LOAD_DATE SYSDATE,
seq sequence(1,1)
)


into table  LD_Chinuch_9031_Porshim when MISPAR_TNUA  = '9031' 
fields terminated by '~' TRAILING NULLCOLS
(
MISPAR_TNUA  POSITION (1) ,
KOD_PEULA  "trim(:KOD_PEULA )",
MISPAR_ZEHUT  "trim(:MISPAR_ZEHUT )",
ZIHUY_NOSAF  "trim(:ZIHUY_NOSAF )",
TAARICH_PRISHA   "trim(:TAARICH_PRISHA )",
SACH_CHODASHIM  "trim(:SACH_CHODASHIM )",
ACHUZ_KITZBA  "trim(:ACHUZ_KITZBA )",
TAT_SEIF_PRISHA  "trim(:TAT_SEIF_PRISHA )",
SEIF_PRISHA  "trim(:SEIF_PRISHA )",
ACHUZ_NECHUT  "trim(:ACHUZ_NECHUT )",
MUGBAL_LETKUFA  "trim(:MUGBAL_LETKUFA )",
ORECH_SHERUT  "trim(:ORECH_SHERUT )",
LEFI_NECHUT  "trim(:LEFI_NECHUT )",
MISRAD  "trim(:MISRAD )",
TIKUN_27  "trim(:TIKUN_27 )",
TIKUN_31  "trim(:TIKUN_31 )",
HAARACHA  "trim(:HAARACHA )",
CHELKIUT  "trim(:CHELKIUT )",
IND_PRISHA_LO_BESOF_CHODESH  "trim(:IND_PRISHA_LO_BESOF_CHODESH )",
ME_TAARICH_MEVUKASH "trim(:ME_TAARICH_MEVUKASH)",
AD_TAARICH_MEVUKASH "trim(:AD_TAARICH_MEVUKASH)",
TAARICH_CHATIMAT_TOFES "trim(:TAARICH_CHATIMAT_TOFES)",
LOAD_DATE SYSDATE,
seq sequence(1,1)
)


into table  ld_chinuch_9034_sherut_tsvaii when MISPAR_TNUA  = '9034' 
fields terminated by '~' TRAILING NULLCOLS
(
MISPAR_TNUA  POSITION (1),
KOD_PEULA "trim(:KOD_PEULA)",
MISPAR_ZEHUT "trim(:MISPAR_ZEHUT)",
ZIHUY_NOSAF  "trim(:ZIHUY_NOSAF )",
MISPAR_ISHI "trim(:MISPAR_ISHI)",
TAARICH_ME  "trim(:TAARICH_ME)",
KOD_SHERUT "trim(:KOD_SHERUT)",
TAARICH_AD  "trim(:TAARICH_AD)",
TAARICH_ZCHUYOT  "trim(:TAARICH_ZCHUYOT)",
LOAD_DATE SYSDATE,
seq sequence(1,1)
)



into table  ld_chinuch_9032_hagdalot when MISPAR_TNUA  = '9032' 
fields terminated by '~' TRAILING NULLCOLS
(
MISPAR_TNUA  POSITION (1),
KOD_PEULA "trim(:KOD_PEULA)",
MISPAR_ZEHUT "trim(:MISPAR_ZEHUT)",
ZIHUY_NOSAF  "trim(:ZIHUY_NOSAF)",
taarich_hagdala "trim(:taarich_hagdala)",
sherut_mugdal "trim(:sherut_mugdal)",
code_hachlata "trim(:code_hachlata)",
be_kfifut_le_seif "trim(:be_kfifut_le_seif)",
lefy_seif_1 "trim(:lefy_seif_1)",
shiur_hagdala_1 "trim(:shiur_hagdala_1)",
lefy_seif_2 "trim(:lefy_seif_2)",
shiur_hagdala_2 "trim(:shiur_hagdala_2)",
lefy_seif_3 "trim(:lefy_seif_3)",
shiur_hagdala_3 "trim(:shiur_hagdala_3)",
lefy_seif_4 "trim(:lefy_seif_4)",
shiur_hagdala_4 "trim(:shiur_hagdala_4)",
lefy_seif_5 "trim(:lefy_seif_5)",
shiur_hagdala_5 "trim(:shiur_hagdala_5)",
lefy_seif_6 "trim(:lefy_seif_6)",
shiur_hagdala_6 "trim(:shiur_hagdala_6)",
taarich_tchula "trim(:taarich_tchula)",
taarich_ishur "trim(:taarich_ishur)",
LOAD_DATE SYSDATE,
seq sequence(1,1)
)

into table LD_CHINUCH_9015_TITLE when MISPAR_TNUA  = '9015' 
fields terminated by '~' TRAILING NULLCOLS
(
MISPAR_TNUA  POSITION (1),
MISPAR_ZEHUT "trim(:MISPAR_ZEHUT)",
ZIHUY_NOSAF  "trim(:ZIHUY_NOSAF)",
CODE_SUG_MIMSHAK "trim(:CODE_SUG_MIMSHAK)",
LOAD_DATE SYSDATE,
seq sequence(1,1)
)
