# الجهات والفرق والأدوار والبنوك والمستخدمون

يُنفذ هذا الملف بالترتيب نفسه؛ كل مورد يعتمد على المورد السابق.

## 1. الجهات

الجهات مستوى تنظيمي مستقل. البيانات الافتراضية المحمية:

- `commercial_banks`: البنوك التجارية.
- `national_committee`: اللجنة الوطنية لتمويل الواردات.
- `system_administration`: إدارة النظام.

يمكن إضافة جهات أخرى. الجهة الافتراضية:

- لا تُحذف.
- لا تُعطل إذا كانت مستخدمة.
- يمكن تعديل اسم العرض فقط إذا سمحت السياسة بذلك، مع بقاء `code` ثابتًا.

الحقول الأساسية:

- `code`
- `name`
- `is_system`
- `is_active`

APIs:

- `GET /organizations`
- `POST /organizations`
- `GET /organizations/{id}`
- `PATCH /organizations/{id}`
- `POST /organizations/{id}/activate`
- `POST /organizations/{id}/deactivate`

## 2. الفرق

- الفريق يتبع جهة واحدة فقط.
- لا يتبع بنكًا مباشرة.
- المستخدم يتبع فريقًا واحدًا.
- لا يوجد `role_code` داخل الفريق.
- يمنع حذف أو تعطيل فريق مرتبط بمستخدمين.

الحقول:

- `organization_id`
- `code`
- `name`
- `is_system`
- `is_active`

APIs:

- `GET /teams?organization_id=`
- `POST /teams`
- `GET /teams/{id}`
- `PATCH /teams/{id}`
- `POST /teams/{id}/activate`
- `POST /teams/{id}/deactivate`

## 3. الأدوار

- الدور يتبع جهة واحدة.
- المستخدم يملك دورًا واحدًا.
- دور المستخدم يجب أن يتبع جهة المستخدم.
- الدور الافتراضي محمي من الحذف.
- أي دور مرتبط بمستخدم لا يمكن حذفه أو تعطيله.
- صلاحيات الشاشات ترتبط بالدور.

الحقول:

- `organization_id`
- `code`
- `name`
- `is_system`
- `is_active`

APIs:

- `GET /roles?organization_id=`
- `POST /roles`
- `GET /roles/{id}`
- `PATCH /roles/{id}`
- `POST /roles/{id}/activate`
- `POST /roles/{id}/deactivate`

## 4. البنوك

- البنك مورد مستقل لكنه يتبع جهة البنوك التجارية عبر `organization_id`.
- المستخدم البنكي يرتبط ببنك واحد.
- التاجر يتبع بنكًا واحدًا.
- يمنع حذف أو تعطيل بنك مرتبط بمستخدمين أو تجار أو طلبات.
- يمنع تغيير جهة البنك بعد الاستخدام.

الحقول:

- `organization_id`
- `code`
- `name`
- `license_number`
- `swift_code`
- `status`

APIs:

- `GET /banks`
- `POST /banks`
- `GET /banks/{id}`
- `PATCH /banks/{id}`
- `POST /banks/{id}/activate`
- `POST /banks/{id}/deactivate`

## 5. المستخدمون

المستخدم دائمًا:

- يتبع جهة واحدة.
- يتبع فريقًا واحدًا.
- يملك دورًا واحدًا.
- يملك بنكًا واحدًا فقط عندما تكون جهته `commercial_banks`.
- لا يملك بنكًا لأي جهة أخرى.

التحقق:

- الفريق والدور يتبعان جهة المستخدم.
- البنك يتبع جهة البنوك التجارية.
- `bank_id` إلزامي للجهة البنكية و`null` لغيرها.
- المستخدم لا يُحذف نهائيًا.
- تعطيل مستخدم لديه عمل نشط يتطلب إعادة الإسناد أو إغلاق العمل حسب الوحدة.
- التعطيل يبطل JWT sessions.

الحقول:

- `organization_id`
- `team_id`
- `role_id`
- `bank_id`
- `name`
- `email`
- `phone`
- `password`
- `is_active`
- `mfa_enabled`

APIs:

- `GET /users`
- `POST /users`
- `GET /users/{id}`
- `PATCH /users/{id}`
- `POST /users/{id}/activate`
- `POST /users/{id}/deactivate`
- `POST /users/{id}/reset-password`
- `POST /users/{id}/reset-mfa`

## الاستجابات المرجعية

نماذج الإنشاء والتعديل يجب أن تعيد العلاقات اللازمة للواجهة دون مطالبتها بإعادة بناء الأسماء من IDs:

```json
{
  "id": 10,
  "name": "اسم المستخدم",
  "organization": { "id": 1, "code": "commercial_banks", "name": "البنوك التجارية" },
  "team": { "id": 4, "code": "entry", "name": "فريق الإدخال" },
  "role": { "id": 7, "code": "bank_intake", "name": "موظف إدخال" },
  "bank": { "id": 3, "name": "البنك" },
  "is_active": true,
  "version": 1
}
```
