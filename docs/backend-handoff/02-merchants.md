# إدارة التجار

## النموذج

التاجر يتبع بنكًا واحدًا، وله:

- بيانات أساسية.
- ملاك أو مساهمون متعددون.
- شركات مرتبطة متعددة.
- طلبات متعددة.

## القواعد

- `bank_id` إلزامي.
- الرقم الضريبي فريد على مستوى النظام.
- رقم السجل التجاري فريد لكل شركة مرتبطة على مستوى النظام.
- المستخدم البنكي يرى ويدير تجار بنكه فقط.
- المستخدم ذو صلاحية شاملة يرى جميع التجار مع فلتر البنك.
- لا يوجد حذف نهائي؛ يستخدم soft delete.
- يمنع تعطيل تاجر لديه طلبات نشطة.
- يمنع تغيير البنك بعد إنشاء أول طلب.
- كل تعديل يسجل في التدقيق.

## بيانات التاجر

- `bank_id`
- `name`
- `tax_number`
- `tax_card_expiry`
- `address`
- `phone`
- `status`: `ACTIVE|SUSPENDED`

## الملاك

- `merchant_id`
- `name`
- `ownership_percentage`

النسبة تقبل القيم من 0 إلى 100. الواجهة الحالية تعرض الملاك ذوي 25% فأكثر، لكن قاعدة البيانات لا تعتمد هذا الحد لمنع فقد البيانات.

## الشركات المرتبطة

- `merchant_id`
- `name`
- `commercial_registration_number`
- `commercial_registration_expiry`
- `sector_reference_value_id`
- `is_active`

## APIs

- `GET /merchants`
- `POST /merchants`
- `GET /merchants/{id}`
- `PATCH /merchants/{id}`
- `POST /merchants/{id}/activate`
- `POST /merchants/{id}/suspend`
- `GET /merchants/{id}/companies`

إنشاء وتعديل التاجر يقبل `owners` و`companies` كعلاقات متداخلة داخل transaction واحدة.

## فلاتر القائمة

- `search`
- `bank_id`
- `status`
- `sector_id`
- `tax_number`

## أخطاء الأعمال

- `MERCHANT_TAX_NUMBER_EXISTS`
- `COMMERCIAL_REGISTRATION_EXISTS`
- `MERCHANT_HAS_ACTIVE_REQUESTS`
- `MERCHANT_BANK_IMMUTABLE`
- `MERCHANT_OUT_OF_SCOPE`
