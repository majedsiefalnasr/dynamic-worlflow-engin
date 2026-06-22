# منصة إدارة وتمويل الواردات

تطبيق TanStack Start عربي RTL يعمل حاليًا ببيانات تجريبية داخل المتصفح. الهدف التالي هو تحويله إلى منتج فعلي بواجهة حالية وLaravel REST API.

## نقطة البداية لفريق الـBackend

ابدأ من:

- [دليل التسليم](docs/backend-handoff/README.md)
- [العقود المشتركة والمصادقة](docs/backend-handoff/00-api-and-auth.md)
- [مخطط البيانات](docs/backend-handoff/07-data-model.md)
- [OpenAPI](docs/backend-handoff/openapi.yaml)

## التقنية المعتمدة

- Frontend: TanStack Start + React + TypeScript + React Query.
- Backend: Laravel Framework `^11.0`.
- PHP: `^8.2`.
- Database: MySQL 8+.
- Authentication: JWT عبر `php-open-source-saver/jwt-auth`.
- API documentation: `darkaonline/l5-swagger ^11.0`.
- Queue, cache, and rate limiting: Redis.
- Files: Laravel local private disk على الخادم نفسه، خارج `public`.
- Deployment: خادم واحد، Nginx، PHP-FPM، Supervisor، Cron.

## قاعدة التسليم

ترتيب التنفيذ إلزامي. لا تُعد المرحلة منتهية بمجرد اكتمال الـBackend؛ يجب أن تكون:

1. قاعدة البيانات والمigrations مكتملة.
2. REST APIs موثقة في OpenAPI ومختبرة.
3. الصلاحيات وقواعد الأعمال مطبقة في الـBackend.
4. الواجهة مربوطة بالـAPI بدل mock/localStorage.
5. حالات التحميل والخطأ والفراغ والتعارض مغطاة.
6. اختبارات القبول الخاصة بالمرحلة ناجحة.

## ترتيب التسليم

1. الجهات.
2. الفرق.
3. الأدوار.
4. البنوك.
5. المستخدمون.
6. إدارة التجار.
7. مصمم سير العمل:
   - المراحل.
   - الإجراءات.
   - الانتقالات.
   - صلاحيات المراحل.
   - الحقول.
   - إدارة الحقول.
   - مخطط سير العملية.
8. الطلبات.
9. طابور الطلبات «دوري».
10. التدقيق والامتثال.
11. التقارير والتحليلات.
12. البيانات الأساسية.
13. صلاحيات الشاشات.
14. الإشعارات.

راجع [خطة التسليم والقبول](docs/backend-handoff/08-delivery-plan.md) قبل بدء أي مرحلة.

## تشغيل الواجهة الحالية

```bash
npm install
npm run dev
```

الواجهة الحالية هي مرجع السلوك والشاشات، وليست مصدر الحقيقة النهائي للبيانات أو الصلاحيات.
