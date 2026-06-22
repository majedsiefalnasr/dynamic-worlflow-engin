# العقود المشتركة والمصادقة

## المنصة

- Laravel `^11.0`.
- PHP `^8.2`.
- MySQL 8+.
- Redis للـqueue والـcache والـrate limiting.
- Swagger عبر `darkaonline/l5-swagger ^11.0`.
- JWT عبر `php-open-source-saver/jwt-auth`.

## REST API

- Base path: `/api/v1`.
- Content type: `application/json`.
- JSON naming: `snake_case`.
- IDs لا تعتمد عليها الواجهة كأرقام متسلسلة ذات معنى.
- كل resource يعيد `id`, `created_at`, `updated_at`, `version`.

### القوائم

Query parameters القياسية:

- `page`
- `per_page`، الافتراضي 25، والحد الأقصى 100.
- `search`
- `sort`
- `direction=asc|desc`
- فلاتر الوحدة المحددة.

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "per_page": 25,
    "total": 0,
    "last_page": 1
  }
}
```

### الأخطاء

```json
{
  "error": {
    "code": "ROLE_IN_USE",
    "message": "لا يمكن تعطيل الدور لأنه مستخدم",
    "fields": {
      "name": ["الاسم مطلوب"]
    },
    "request_id": "01J..."
  }
}
```

الاستخدام:

- `401`: غير مصادق.
- `403`: لا يملك الصلاحية أو خارج نطاق البيانات.
- `404`: المورد غير موجود داخل نطاق المستخدم.
- `409`: تعارض حالة أو version أو مورد مستخدم.
- `422`: validation.
- `429`: rate limit.

## JWT

### Endpoints

- `POST /auth/login`
- `POST /auth/mfa/verify`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `POST /auth/change-password`

### السياسة

- Access token قصير العمر ويرسل في `Authorization: Bearer`.
- Refresh token أطول عمرًا ويوضع في `HttpOnly Secure SameSite` cookie.
- blacklist مفعلة.
- logout يبطل الجلسة الحالية.
- تعطيل المستخدم أو تغيير صلاحيات حساسة يبطل كل جلساته.
- rate limit على login وMFA وpassword reset.
- MFA باستخدام TOTP في المرحلة الأولى.
- لا يوضع access أو refresh token في `localStorage`.

### استجابة `/auth/me`

تتضمن:

- بيانات المستخدم.
- `organization`.
- `team`.
- `role`.
- `bank` أو `null`.
- صلاحيات الشاشات المحسوبة.
- القدرات العامة ذات الصلة.

## التزامن

- كل سجل قابل للتعديل يحمل `version`.
- طلبات التعديل الحساسة ترسل `version` الحالية.
- عند اختلافها يعاد `409 STALE_RESOURCE`.
- تنفيذ انتقال الطلب يتم داخل database transaction مع row lock.
- نفس الطلب لا يقبل انتقالين لنفس version.

## الملفات

- التخزين على Laravel local private disk خارج `public`.
- قاعدة البيانات تحفظ metadata والمسار فقط.
- الرفع عبر `multipart/form-data`.
- التنزيل عبر endpoint مصرح به، وليس رابط ملف عام.
- التحقق من النوع، الحجم، وامتداد الملف في الـBackend.
- النسخ الاحتياطي يشمل MySQL ومجلد الملفات.

## البنية التشغيلية

- Nginx + PHP-FPM.
- Supervisor للـqueue workers.
- Cron يشغل Laravel Scheduler كل دقيقة.
- Redis للـqueue والـcache والـrate limiting.
- خادم إنتاج واحد بمساحة دائمة.
