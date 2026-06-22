# الطلبات وطابور «دوري»

## الطلب

الطلب هو instance من نسخة منشورة:

- `workflow_version_id`
- `current_stage_id`
- `reference`
- `status`: `ACTIVE|CLOSED|REJECTED`
- `created_by`
- `bank_id`
- `merchant_id`
- `data` للحقول الديناميكية غير الملفية
- `version` للتزامن

`reference` ينشأ في الـBackend ويكون فريدًا.

## الإنشاء

- المستخدم يستطيع الإنشاء إذا كان يملك `EXECUTE` على المرحلة الابتدائية.
- البنك والتاجر يحددان من نطاق المستخدم والاختيار المصرح.
- البيانات تتحقق وفق قواعد حقول المرحلة الابتدائية.
- الإنشاء يضيف أول سجل في `workflow_history` و`audit_logs`.

## العرض

شاشة الطلبات تعرض الطلبات التي يملك المستخدم `VIEW` أو `EXECUTE` على مرحلتها الحالية، مع تطبيق نطاق الجهة والبنك.

الفلاتر:

- `workflow_id`
- `workflow_version_id`
- `stage_id`
- `bank_id`
- `merchant_id`
- `status`
- `created_from`, `created_to`
- `sla_status`
- `search`

## طابور «دوري»

`GET /requests/my-queue`

يعيد فقط الطلبات:

- حالتها `ACTIVE`.
- المرحلة الحالية تمنح المستخدم `EXECUTE`.
- تطابق الجهة والفريق والدور والمستخدم والبنك.

لا يوجد جدول tasks مستقل في المرحلة الأولى. الطابور مشتق من `current_stage_id` و`stage_permissions`.

الترتيب الافتراضي:

1. المتجاوزة لـSLA.
2. الأقرب لتجاوز SLA.
3. الأقدم في المرحلة.

## تنفيذ إجراء

`POST /requests/{id}/actions`

المدخلات:

- `transition_id`
- `comment`
- `data`
- `version`

داخل transaction:

1. lock للطلب.
2. التحقق من `version`.
3. التحقق من المرحلة الحالية.
4. التحقق من `EXECUTE`.
5. التحقق من الحقول والتعليق.
6. تحديث البيانات والمرحلة والحالة.
7. إضافة `workflow_history`.
8. إضافة `audit_logs`.
9. إرسال jobs للإشعارات بعد نجاح transaction.

بعد الانتقال يخرج الطلب من طابور المنفذ السابق ويظهر للمخولين في المرحلة الجديدة.

## المسودة

`PATCH /requests/{id}/draft`

- متاحة فقط لمن يملك `EXECUTE` على المرحلة الحالية.
- تتحقق من editable fields.
- لا تشترط required fields إلا عند الإجراء الذي يغادر المرحلة، ما لم تحدد قاعدة أخرى.

## الملفات

- `POST /requests/{id}/documents`
- `GET /requests/{id}/documents/{document_id}`
- `DELETE /requests/{id}/documents/{document_id}` قبل قفل الحقل أو مغادرة المرحلة.

كل وثيقة ترتبط بالطلب والحقل والمستخدم والمرحلة.

## التاريخ والمخطط

- `GET /requests/{id}/history`
- `GET /requests/{id}/graph`

التاريخ متخصص في حركة الطلب. المخطط يعيد العقد والحواف مع المسار المنفذ والحالي والممكن.

## منع التكرار

فحص رقم الفاتورة يتم في الـBackend. النتيجة تحذير امتثال وليست منعًا تلقائيًا ما لم تضف قاعدة أعمال لاحقًا.

## أخطاء الأعمال

- `REQUEST_STALE`
- `TRANSITION_NOT_AVAILABLE`
- `STAGE_EXECUTION_FORBIDDEN`
- `STAGE_FIELDS_INVALID`
- `COMMENT_REQUIRED`
- `REQUEST_CLOSED`
- `MERCHANT_OUT_OF_SCOPE`
