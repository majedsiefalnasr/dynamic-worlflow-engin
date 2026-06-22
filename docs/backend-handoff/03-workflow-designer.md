# مصمم سير العمل

## تعريف سير العمل ونسخه

`workflow_definitions` يمثل نوع العملية. `workflow_versions` يمثل تكوينًا ثابتًا قابلًا للتشغيل.

حالات النسخة:

- `DRAFT`
- `PUBLISHED`
- `ARCHIVED`

القواعد:

- التعديل على `DRAFT` فقط.
- النشر نهائي؛ التعديل اللاحق يبدأ باستنساخ نسخة جديدة.
- الطلب يحتفظ بنسخته الأصلية حتى النهاية.
- الطلبات الجديدة تستخدم النسخة المنشورة النشطة.
- لا يوجد ترحيل طلبات بين النسخ في المرحلة الأولى.

## المراحل

الحقول:

- `workflow_version_id`
- `code`
- `name`
- `description`
- `sort_order`
- `is_initial`
- `is_final`
- `sla_duration_minutes`
- `status`

القواعد:

- مرحلة ابتدائية واحدة.
- مرحلة نهائية واحدة على الأقل.
- الكود فريد داخل النسخة.
- لا تحذف مرحلة مرتبطة بانتقال أو طلب.
- كل مرحلة غير نهائية تحتاج انتقالًا صادرًا ومنفذًا واحدًا على الأقل قبل النشر.

## الإجراءات

كتالوج مركزي قابل لإعادة الاستخدام:

- `code`
- `name`
- `kind`: `DRAFT|APPROVE|REJECT|RETURN|CLOSE|INFO|CUSTOM`
- `is_active`
- `is_system`

القواعد:

- `code` فريد وثابت.
- الاسم قابل للتعديل.
- يمنع حذف أو تعطيل إجراء مستخدم داخل انتقال.
- حفظ المسودة عملية مستقلة ولا يلزم أن تغير المرحلة.

## الانتقالات

الحقول:

- `workflow_version_id`
- `from_stage_id`
- `action_id`
- `to_stage_id`
- `requires_comment`
- `confirmation_message`

القواعد:

- يمنع تكرار نفس الإجراء من نفس المرحلة.
- الانتقال إلى نفس المرحلة مسموح.
- التنفيذ يتحقق من المرحلة الحالية والصلاحية وحقول المرحلة.
- التنفيذ transaction واحدة: تحديث الطلب، التاريخ، التدقيق، والإشعارات.

## صلاحيات المراحل

جدول موحد `stage_permissions`:

- `stage_id`
- `organization_id`
- `team_id`
- `role_id`
- `user_id`
- `access_level`: `VIEW|EXECUTE`
- `display_label`

قواعد المطابقة:

- الحقول المحددة داخل الصف تعمل بمنطق `AND`.
- الصفوف المختلفة تعمل بمنطق `OR`.
- `EXECUTE` تتضمن `VIEW`.
- `user_id` اختياري للاستثناءات.
- طابور «دوري» وصلاحيات الطلبات مشتقة من هذا الجدول.
- لا يوجد `StageRoutingRule` أو مصدر صلاحيات موازٍ.

## الحقول والمجموعات

أنواع الحقول:

- `TEXT`
- `NUMBER`
- `DATE`
- `SELECT`
- `DYNAMIC_SELECT`
- `TEXTAREA`
- `FILE`
- `CURRENCY`
- `CHECKBOX`

`field_groups` تنظم الحقول كتبويبات مرتبة.

إعدادات الحقل:

- `key`, `label`, `type`
- `placeholder`, `help_text`, `default_value`
- `min_value`, `max_value`
- `min_length`, `max_length`
- `regex_pattern`
- `options`
- `reference_table_id`
- `dynamic_source`
- `allowed_file_types`, `max_file_size`, `multiple`
- `is_system`

القواعد:

- المفتاح فريد داخل النسخة.
- لا يتغير المفتاح بعد استخدام النسخة.
- الحقول الافتراضية محمية من الحذف.
- الحقل المستخدم في طلب لا يحذف؛ يختفي أو يتغير عبر نسخة جديدة.
- الملفات تحفظ كسجلات مستقلة.

## قواعد الحقول لكل مرحلة

`stage_field_rules`:

- `stage_id`
- `field_id`
- `is_visible`
- `is_editable`
- `is_required`

الـBackend يتحقق من القواعد عند حفظ المسودة وعند تنفيذ الانتقال.

## مخطط سير العملية

- يولد من المراحل والانتقالات الفعلية.
- API يعيد `nodes` و`edges`.
- يعرض التفرعات والعودة والحالات النهائية.
- الرؤية مشتقة من `stage_permissions`.
- `display_label` يسمح باسم سياقي دون مصدر routing مستقل.

## التحقق قبل النشر

`POST /workflow-versions/{id}/validate` يعيد أخطاء قابلة للعرض:

- initial stage غير صحيحة.
- لا توجد final stage.
- مرحلة غير نهائية بلا انتقال.
- مرحلة غير نهائية بلا منفذ.
- transition تشير لمورد غير صالح.
- أكواد أو مفاتيح مكررة.
- field source غير صالح.

`POST /workflow-versions/{id}/publish` يرفض النشر عند وجود أي خطأ.

## APIs

- `/workflows`
- `/workflows/{id}`
- `/workflows/{id}/versions`
- `/workflow-versions/{id}`
- `/workflow-versions/{id}/clone`
- `/workflow-versions/{id}/validate`
- `/workflow-versions/{id}/publish`
- `/workflow-versions/{id}/archive`
- `/workflow-versions/{id}/stages`
- `/workflow-versions/{id}/transitions`
- `/workflow-versions/{id}/fields`
- `/workflow-versions/{id}/field-groups`
- `/workflow-versions/{id}/graph`
- `/stages/{id}/permissions`
- `/stages/{id}/field-rules`
- `/workflow-actions`
