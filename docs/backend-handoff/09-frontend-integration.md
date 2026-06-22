# خطة ربط الواجهة

لا تتضمن هذه الخطة إعادة تصميم UI.

## طبقة API

- إنشاء client مولد من OpenAPI.
- Query keys موحدة لكل resource.
- React Query للقوائم والتفاصيل والmutations.
- interceptor أو wrapper يضيف access token ويتعامل مع refresh مرة واحدة.
- منع retry التلقائي على `401`, `403`, `409`, `422`.

## استبدال المصادر الحالية

تزال تدريجيًا:

- `src/lib/mock.ts` كمصدر business data.
- `src/lib/governance.ts` كمخزن persistent.
- `src/lib/workflow-engine/storage.ts` كمخزن localStorage.
- aliases والـbridge المؤقتة بعد اكتمال migration.

لا تحذف هذه الملفات دفعة واحدة؛ كل مرحلة تستبدل الجزء الخاص بها فقط.

## حالات الواجهة المطلوبة

لكل قائمة:

- loading skeleton.
- empty state.
- filtered empty state.
- API error مع retry.
- pagination.
- disabled mutation أثناء الإرسال.

لكل form:

- mapping لأخطاء `422` إلى الحقول.
- عرض أخطاء الأعمال `409`.
- منع فقد draft عند فشل الشبكة.

## JWT

- access token في الذاكرة.
- refresh cookie لا يقرأه JavaScript.
- عند فشل refresh ينتقل المستخدم إلى login.
- `/auth/me` يهيئ المستخدم والصلاحيات عند تشغيل التطبيق.

## التزامن

- إرسال `version` في update/action requests.
- عند `STALE_RESOURCE` تعرض الواجهة رسالة وتعيد تحميل المورد.
- بعد الانتقال: invalidate details, requests list, my queue, notifications, dashboard.

## الملفات

- الرفع multipart مع progress عند الحاجة.
- لا تحفظ أسماء الملفات داخل request data كبديل للوثيقة.
- التنزيل يمر من endpoint المحمي.

## ما لا يتغير

- بنية الشاشات الحالية.
- اللغة العربية وRTL.
- المكونات البصرية الحالية إلا عند الحاجة لحالة وظيفية ناقصة.
