# التدقيق والامتثال والتقارير

## سجل التدقيق

`audit_logs` append-only وغير قابل للتعديل أو الحذف من التطبيق.

الحقول:

- `actor_user_id`
- `actor_role_id`
- `event_code`
- `entity_type`
- `entity_id`
- `request_id`
- `workflow_instance_id`
- `old_values`
- `new_values`
- `metadata`
- `ip_address`
- `user_agent`
- `correlation_id`
- `created_at`

يسجل:

- الدخول والخروج والمحاولات الفاشلة.
- إنشاء وتعديل وتعطيل موارد الإدارة.
- تغيير الصلاحيات.
- استنساخ، تحقق، ونشر سير العمل.
- إنشاء الطلب وحفظ المسودة وتنفيذ الإجراءات.
- رفع وتنزيل وحذف المستندات.
- التصدير.

`workflow_history` يبقى سجلًا متخصصًا لمسار الطلب ويرتبط بسجل التدقيق عند الإمكان.

APIs:

- `GET /audit-logs`
- `GET /audit-logs/{id}`
- `GET /audit-logs/export`
- `GET /compliance/duplicate-invoices`

الفلاتر:

- المستخدم، الدور، الحدث، المورد، الطلب، التاريخ، IP، correlation ID.

## الامتثال

المرحلة الأولى:

- كشف تكرار رقم الفاتورة.
- كشف المستندات منتهية الصلاحية من البيانات المسجلة.
- عرض تجاوز SLA.

مؤشرات الاحتيال المتقدمة ليست بيانات ثابتة ولا تنفذ بلا قواعد معتمدة لاحقًا.

## التقارير

كل تقرير يطبق نطاق المستخدم وصلاحياته.

APIs المجمعة:

- `GET /reports/summary`
- `GET /reports/requests-over-time`
- `GET /reports/by-workflow-stage`
- `GET /reports/by-bank`
- `GET /reports/by-merchant`
- `GET /reports/by-sector`
- `GET /reports/by-currency`
- `GET /reports/stage-duration`
- `GET /reports/sla`
- `GET /reports/team-performance`

الفلاتر المشتركة:

- التاريخ.
- سير العمل.
- النسخة.
- البنك.
- الجهة.
- المرحلة.
- الحالة.
- العملة.

التصدير:

- `POST /reports/exports`
- `GET /reports/exports/{id}`
- `GET /reports/exports/{id}/download`

التصدير الكبير queued job. نفس الفلاتر المستخدمة في الشاشة تستخدم في الملف.

## الخصوصية

- تقارير أداء الأفراد تحتاج صلاحية منفصلة.
- التقارير الافتراضية تعرض أداء الفرق والأدوار.
- لا تعاد بيانات خارج نطاق البنك أو الجهة.
