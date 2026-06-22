# البيانات الأساسية وصلاحيات الشاشات والإشعارات

## البيانات الأساسية

الجداول الافتراضية:

- `sector_activity`
- `arrival_port`
- `origin_country`

`reference_tables`:

- `key`
- `label`
- `sort_order`
- `is_active`
- `is_system`

`reference_values`:

- `reference_table_id`
- `key`
- `label`
- `sort_order`
- `is_active`
- `is_system`

القواعد:

- المفاتيح ثابتة وفريدة.
- الطلب يحفظ value ID أو key، وليس label.
- لا يحذف جدول مستخدم في نسخة منشورة.
- لا تحذف قيمة مستخدمة في طلب.
- التعطيل يمنع الاختيار الجديد ويحافظ على التاريخ.
- الافتراضي محمي من الحذف.

APIs:

- `GET /reference-tables`
- `POST /reference-tables`
- `PATCH /reference-tables/{id}`
- `POST /reference-tables/{id}/activate`
- `POST /reference-tables/{id}/deactivate`
- `POST /reference-tables/{id}/values`
- `PATCH /reference-values/{id}`
- `POST /reference-values/{id}/activate`
- `POST /reference-values/{id}/deactivate`

## صلاحيات الشاشات

كتالوج مركزي لكل شاشة وقدراتها.

القدرات:

- `VIEW`
- `CREATE`
- `UPDATE`
- `DELETE`
- `EXPORT`
- `MANAGE`

`screen_permissions` يربط الدور بالشاشة والقدرة.

كل الشاشات تسجل، ومنها:

- organizations
- teams
- roles
- banks
- users
- merchants
- workflow_designer
- requests
- reports
- audit
- reference_data
- screen_permissions
- notifications
- settings

قواعد:

- لا يعتمد الـFrontend أو Backend على role codes ثابتة للسماح بالشاشات.
- صلاحية عرض وتنفيذ الطلبات مشتقة من `stage_permissions`.
- تصدير الطلبات والإدارة العامة يمكن أن يأتي من صلاحيات الشاشة.
- مسؤول النظام الافتراضي يملك كل الصلاحيات.
- يمنع إزالة إدارة الصلاحيات من آخر مسؤول نظام نشط.

APIs:

- `GET /screens`
- `GET /roles/{id}/screen-permissions`
- `PUT /roles/{id}/screen-permissions`
- `GET /auth/me/permissions`

## الإشعارات

`notifications` يمثل الحدث والمحتوى:

- `type`
- `severity`
- `title`
- `body`
- `entity_type`
- `entity_id`
- `action_url`
- `created_at`

`notification_recipients`:

- `notification_id`
- `user_id`
- `read_at`
- `archived_at`

الأحداث:

- وصول طلب لمرحلة قابلة للتنفيذ.
- اعتماد، رفض، أو إرجاع.
- قرب أو تجاوز SLA.
- تكرار فاتورة أو مشكلة امتثال.
- نشر نسخة سير عمل.
- تغيير صلاحيات حساس.

القنوات في المرحلة الأولى:

- داخل المنصة فقط.

القواعد:

- الجمهور يحل إلى مستخدمين فعليين وقت الإرسال.
- المستخدم يقرأ أو يؤرشف نسخته فقط.
- لا يحذف notification المشترك.
- الإنشاء يتم queued job بعد نجاح transaction.

APIs:

- `GET /notifications`
- `GET /notifications/unread-count`
- `POST /notifications/{id}/read`
- `POST /notifications/{id}/unread`
- `POST /notifications/{id}/archive`
- `POST /notifications/read-all`
