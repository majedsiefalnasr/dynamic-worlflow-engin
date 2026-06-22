# مخطط البيانات

هذا مخطط منطقي لفريق Laravel. أسماء المفاتيح والـindexes النهائية توثق في migrations وOpenAPI.

## العلاقات الأساسية

```text
organizations
  ├── teams
  ├── roles
  ├── banks (للجهة commercial_banks)
  └── users
       ├── team_id
       ├── role_id
       └── bank_id nullable by organization

banks
  ├── users
  ├── merchants
  └── requests

merchants
  ├── merchant_owners
  ├── merchant_companies
  └── requests

workflow_definitions
  └── workflow_versions
       ├── workflow_stages
       │    ├── stage_permissions
       │    └── stage_field_rules
       ├── workflow_transitions ── workflow_actions
       ├── field_groups
       └── field_definitions

requests
  ├── request_field_values/data
  ├── request_documents
  ├── workflow_history
  └── audit_logs
```

## الجداول

### Governance

- `organizations`
- `teams`
- `roles`
- `banks`
- `users`
- `screens`
- `screen_permissions`

### Merchants

- `merchants`
- `merchant_owners`
- `merchant_companies`

### Workflow design

- `workflow_definitions`
- `workflow_versions`
- `workflow_stages`
- `workflow_actions`
- `workflow_transitions`
- `stage_permissions`
- `field_groups`
- `field_definitions`
- `stage_field_rules`

### Runtime

- `requests`
- `request_documents`
- `workflow_history`

### Platform

- `reference_tables`
- `reference_values`
- `audit_logs`
- `notifications`
- `notification_recipients`
- `report_exports`
- JWT blacklist/cache tables حسب الحزمة والإعداد.
- Laravel queue failed jobs والجداول التشغيلية المطلوبة.

## قيود مهمة

- unique `organizations.code`.
- unique `teams(organization_id, code)`.
- unique `roles(organization_id, code)`.
- unique `banks.code`, ويفضل unique nullable `swift_code`.
- unique `users.email`.
- unique `merchants.tax_number`.
- unique `merchant_companies.commercial_registration_number`.
- unique `workflow_definitions.code`.
- unique `workflow_versions(workflow_definition_id, version_number)`.
- unique `workflow_stages(workflow_version_id, code)`.
- unique `field_definitions(workflow_version_id, key)`.
- unique `workflow_actions.code`.
- unique `workflow_transitions(from_stage_id, action_id)`.
- unique `screen_permissions(role_id, screen_id, capability)`.
- unique `notification_recipients(notification_id, user_id)`.

## الحذف والتعطيل

- الجهات والفرق والأدوار والبنوك والمستخدمون: تعطيل، مع منع التعطيل وقت الاستخدام حسب القواعد.
- التجار: soft delete وتعطيل.
- نسخ سير العمل المنشورة والطلبات والتاريخ والتدقيق: لا تحذف.
- القيم المرجعية المستخدمة: تعطيل فقط.
- المستندات: حذف منطقي وسجل تدقيق عندما تسمح مرحلة الطلب.

## بيانات الطلب الديناميكية

المرحلة الأولى يمكن أن تحفظ القيم غير الملفية في JSON column `requests.data` بشرط:

- validation من field definitions.
- تخزين reference IDs/keys بدل labels.
- إنشاء أعمدة صريحة للحقول المستخدمة في الفلترة والنطاق والتقارير: البنك، التاجر، الحالة، المرحلة، المرجع، المبلغ، العملة، رقم الفاتورة.

لا تعتمد التقارير الأساسية على scanning غير مفهرس لعمود JSON.

## الفهارس

على الأقل:

- `requests(status, current_stage_id, updated_at)`.
- `requests(bank_id, status)`.
- `requests(workflow_version_id, current_stage_id)`.
- `requests(invoice_number)`.
- `workflow_history(request_id, created_at)`.
- `audit_logs(entity_type, entity_id, created_at)`.
- `audit_logs(actor_user_id, created_at)`.
- `notification_recipients(user_id, read_at, archived_at)`.
