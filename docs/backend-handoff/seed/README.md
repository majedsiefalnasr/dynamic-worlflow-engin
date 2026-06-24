# بيانات التهيئة (Seed) — مطابقة لبيانات الواجهة المحلية

هذه الحزمة تعطي فريق الـBackend **نفس البيانات الافتراضية والحسابات** الموجودة في الواجهة المحلية، حتى يختبر الطرفان بنفس القاعدة وبنفس بيانات الدخول.

## الملف

[DemoDataSeeder.php](DemoDataSeeder.php) — Laravel Seeder، idempotent (آمن لإعادة التشغيل، يستخدم `firstOrCreate`).

## التشغيل

```bash
# ضع الملف في database/seeders/ ثم:
php artisan db:seed --class=Database\\Seeders\\DemoDataSeeder
```

عدّل namespaces الموديلات (`App\Models\*`) وأسماء الأعمدة إن اختلفت عن مخططك. الحقول مأخوذة من [07-data-model.md](../07-data-model.md) وأجسام الكتابة في Swagger.

## بيانات الدخول

كل الحسابات بكلمة مرور واحدة، و`mfa_enabled = false` (دخول مباشر بلا MFA):

```
كلمة المرور لكل الحسابات: Password@123
```

| الإيميل | الاسم | الجهة | الفريق | الدور | البنك |
|---|---|---|---|---|---|
| admin@cby.gov.ye | ياسر الحضرمي | system_administration | team_platform_admin | rc_platform_admin | — |
| admin@ybank.ye | أحمد المقطري | commercial_banks | team_admin_bank | rc_bank_admin | ybrd |
| intake@ybank.ye | علي القاضي | commercial_banks | team_entry | rc_bank_intake | ybrd |
| reviewer@ybank.ye | نوال الحاج | commercial_banks | team_internal | rc_bank_reviewer | ybrd |
| swift@ybank.ye | سامي العتمي | commercial_banks | team_fx | rc_bank_swift | ybrd |
| m.shami@cby.gov.ye | محمد الشامي | national_committee | team_support | rc_support_member | — |
| huda@cby.gov.ye | د. هدى الإرياني | national_committee | team_fx_confirm | rc_committee_manager | — |
| sami@cby.gov.ye | م. سامي الذماري | national_committee | team_exec | rc_executive_member | — |
| nada@cby.gov.ye | د. ندى الكبسي | national_committee | team_exec | rc_executive_member | — |
| fahd@cby.gov.ye | أ. فهد الشرعبي | national_committee | team_exec | rc_executive_member | — |
| amina@cby.gov.ye | د. أمينة العزب | national_committee | team_exec | rc_executive_member | — |
| khaled@cby.gov.ye | م. خالد الأنسي | national_committee | team_exec | rc_executive_member | — |

> الحساب الرئيسي للتجربة: **admin@cby.gov.ye / Password@123** (مسؤول النظام).

## ما يحتويه الـseeder

- **الجهات** (٣): commercial_banks، national_committee، system_administration.
- **الفرق** (٨): بلا `role_code` (الفريق لا يحمل دورًا — الدور على المستخدم).
- **الأدوار** (٨): `rc_*` لكل جهة.
- **البنوك** (٣): ybrd، tsib، sbai (تتبع commercial_banks).
- **البيانات الأساسية**: sector_activity، arrival_port، origin_country بقيمها (مفاتيح ثابتة).
- **المستخدمون** (١٢): الجدول أعلاه.
- **التجار** (٥): مع مالك وشركة مرتبطة لكل تاجر، وربط القطاع بقيمة مرجعية.
- **الإشعارات** (٥): إشعارات تجريبية لحساب المسؤول (مقروء/غير مقروء).
- **سير العمل**: تعريف «تمويل الواردات» + **نسخة منشورة واحدة** (CR-15) — ٨ مراحل، ١٠ إجراءات، ١٢ انتقالًا، صلاحيات المراحل (display_label)، ٤ مجموعات حقول، ٣٨ حقلًا، وقواعد الحقول لكل مرحلة.
- **الطلبات** (١٦): موزّعة على كل المراحل (نشط/مغلق/مرفوض) مع سلسلة `workflow_history` كاملة لكل طلب.
- **سجلّات التدقيق** (٢٥): `audit_logs` تجريبية (دخول/إنشاء/تنفيذ/تحديث/تصدير)، idempotent عبر `correlation_id = demo_audit_{i}`.

> **غير مضمّن عمدًا:** (١) مصفوفة الصلاحيات (دور×شاشة/قدرة) — متروكة لكم (CR-09/CR-16). (٢) بيانات رسوم التقارير (MONTHLY/CATEGORY_DIST) — تُحسب من الطلبات في الخادم، ليست بيانات تُزرع.

## ملاحظات لازمة على فريق الـBackend

1. **الصلاحيات غير مُهيّأة هنا** — شكل صلاحيات المستخدم لسه مفتوح ([BACKEND-CHANGE-REQUESTS.md](../BACKEND-CHANGE-REQUESTS.md) CR-09/CR-16). امنح دور `rc_platform_admin` كل الصلاحيات في نظامكم، وإلا حتى المسؤول يأخذ `403`.
2. **🔴 أقسام سير العمل / الطلبات / الإشعارات (5–7) لم تُتحقّق حيًّا** — مفيش API بيرجّع schema كامل ولا endpoints كتابة (CR-14). أسماء **الجداول والموديلات والأعمدة** فيها مأخوذة من [07-data-model.md](../07-data-model.md) — **راجعوها مقابل migrations عندكم وعدّلوا الأسماء عند الحاجة** (الموديلات المعنية معلّمة بـ`// adjust` أعلى الملف). هذه الأقسام تزرع على مستوى قاعدة البيانات مباشرة (تتجاوز endpoints الكتابة الناقصة) وتُحقّق CR-15.
3. **مفاتيح الأعمدة** (`organization_id`, `team_id`, `role_id`, `bank_id`, `is_system`, `is_active`, `tax_number`, `swift_code`, `category` …) من العقد؛ لو مخططكم مختلف عدّلوها.
4. **owners / companies / options**: `field_definitions.options` يُحفظ JSON (اضبط الـcast)؛ شكل الحقول المتداخلة من [07-data-model.md](../07-data-model.md) (CR-13).
5. الـseeder كله **idempotent** — `firstOrCreate` بمفاتيح فريدة (code/email/tax_number/reference …)، آمن لإعادة التشغيل ولا يكرّر.
