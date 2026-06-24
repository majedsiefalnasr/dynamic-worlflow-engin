# Backend Handoff

هذه الحزمة هي العقد الوظيفي والتقني بين فريق الواجهة وفريق Laravel. ترتيب الملفات يطابق ترتيب التسليم المعتمد.

## قواعد العمل

- OpenAPI هو العقد الرسمي للـAPI بعد اكتمال تعريفات المرحلة المعنية. الملف الحالي baseline يحدد القواعد والمسارات الرئيسية، ولا يبدأ تنفيذ مرحلة قبل استكمال schemas وexamples الخاصة بها.
- الـBackend هو صاحب القرار النهائي في المصادقة والصلاحيات والتحقق.
- `snake_case` مستخدم في JSON.
- التواريخ ترسل بصيغة ISO 8601 UTC.
- كل قائمة تستخدم pagination من الخادم.
- كل عملية كتابة حساسة تسجل في `audit_logs`.
- السجلات المستخدمة لا تُحذف نهائيًا؛ تُعطل أو تستخدم soft delete حسب الوحدة.
- النسخ المنشورة من سير العمل غير قابلة للتعديل.
- لا تُستبدل mock data في الواجهة إلا بعد استقرار API المرحلة واختبارات قبولها.

## الملفات

| الملف | النطاق |
|---|---|
| [00-api-and-auth.md](00-api-and-auth.md) | REST conventions, JWT, errors, files, concurrency |
| [01-governance.md](01-governance.md) | الجهات، الفرق، الأدوار، البنوك، المستخدمون |
| [02-merchants.md](02-merchants.md) | التجار، الملاك، الشركات المرتبطة |
| [03-workflow-designer.md](03-workflow-designer.md) | المصمم وكل مكوناته |
| [04-requests-and-queue.md](04-requests-and-queue.md) | الطلبات وطابور دوري |
| [05-audit-and-reports.md](05-audit-and-reports.md) | التدقيق والتقارير |
| [06-reference-permissions-notifications.md](06-reference-permissions-notifications.md) | البيانات الأساسية، الشاشات، الإشعارات |
| [07-data-model.md](07-data-model.md) | الجداول والعلاقات والقيود |
| [08-delivery-plan.md](08-delivery-plan.md) | مراحل التسليم ومعايير القبول |
| [09-frontend-integration.md](09-frontend-integration.md) | استبدال mock وربط React Query |
| [DELIVERY_STATUS.md](DELIVERY_STATUS.md) | حالة كل أولوية في Backend وUI والاختبارات |
| [openapi.yaml](openapi.yaml) | baseline لعقد OpenAPI يتم استكماله مرحلة بمرحلة |
| [AUDIT.md](AUDIT.md) | مراجعة الـBackend الحي مقابل العقد: مطابق/مختلف/ناقص وجاهزية الربط |
| [BACKEND-CHANGE-REQUESTS.md](BACKEND-CHANGE-REQUESTS.md) | طلبات التعديل للـBackend مرتبة بالأولوية (P0/P1/P2) |
| [seed/](seed/) | Laravel Seeder ببيانات الواجهة الافتراضية + الحسابات وكلمة المرور للتجربة |

## تعريف الاكتمال

أي بند في الخطة لا يعتبر `Done` إلا بعد:

- migration وseed للبيانات الافتراضية المحمية.
- Form Requests وPolicies أو Gates.
- API Resources موحدة.
- Feature tests للحالات الناجحة والفاشلة والصلاحيات.
- تحديث Swagger.
- ربط شاشة الواجهة المقابلة.
- إثبات عدم اعتماد الشاشة على `localStorage` أو mock لنطاق المرحلة.

## خارج المرحلة الأولى

- تعدد الفرق أو الأدوار للمستخدم.
- ترحيل الطلبات بين نسخ سير العمل.
- إنشاء تقارير مخصصة محفوظة.
- SMS والبريد كقنوات إشعار فعلية.
- التخزين الموزع للملفات؛ المرحلة الأولى تستخدم قرص الخادم الخاص فقط.
- توزيع التطبيق على عدة خوادم.
