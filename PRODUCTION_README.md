# منصة إدارة وتمويل الواردات — البنك المركزي اليمني

تطبيق إنتاجي كامل: **Laravel 11 API (MySQL) + Nuxt 3 (Vue 3 + Tailwind)**.

```
backend/         Laravel 11 REST API + Sanctum + RBAC + MySQL
frontend-nuxt/   Nuxt 3 SSR + Pinia + Tailwind (RTL)
src/             (الموجود) النموذج التفاعلي الأصلي على TanStack Start
```

## 1. متطلبات التشغيل

- PHP 8.2+ مع امتدادات: pdo_mysql, mbstring, openssl, intl, fileinfo
- Composer 2.x
- MySQL 8.0+ (أو MariaDB 10.6+)
- Node.js 20+ و npm/pnpm

## 2. تشغيل الباكند (Laravel)

```bash
cd backend
cp .env.example .env

# أنشئ مجلدات Laravel القياسية إن لم تكن موجودة
mkdir -p bootstrap/cache storage/{app,framework/{cache,sessions,views},logs}

composer install
php artisan key:generate

# عدّل بيانات MySQL في .env ثم:
php artisan migrate --seed

php artisan serve   # http://localhost:8000
```

> ملاحظة: هذا المستودع يحتوي على ملفات Laravel الأساسية (config, models, controllers, migrations, routes, seeders). لإكمال هيكل Laravel القياسي شغّل `composer create-project laravel/laravel temp` ثم انسخ المجلدات الناقصة (`artisan`, `public/index.php`, `bootstrap/`, `storage/`) أو أنشئ مشروع Laravel جديد وادمج محتوى `backend/` فوقه.

### المستخدمون التجريبيون (بعد seed)
كل المستخدمين بنفس كلمة المرور: `Password@123`

| البريد | الدور |
|--------|-------|
| ahmed@ybank.ye | بنك تجاري |
| sara@alkuraimi.ye | شركة صرافة |
| m.shami@cby.gov.ye | عضو لجنة مساندة |
| huda@cby.gov.ye | عضو لجنة تنفيذية |
| kh.ansi@cby.gov.ye | مدير اللجنة |
| admin@cby.gov.ye | مسؤول النظام |

## 3. تشغيل الفرونت إند (Nuxt)

```bash
cd frontend-nuxt
cp .env.example .env
npm install
npm run dev   # http://localhost:3000
```

## 4. توثيق الـ API

كل المسارات تحت `/api`. المصادقة عبر **Bearer Token** من Sanctum.

### Auth
| Method | Path | Body |
|---|---|---|
| POST | `/api/auth/login` | `email, password, device?` → `{ token, user }` |
| GET  | `/api/auth/me` | (auth) → `{ user }` |
| POST | `/api/auth/logout` | (auth) |

### Merchants (`auth`)
- `GET /api/merchants?search=&status=&per_page=`
- `POST /api/merchants` — `name, tax_number, commercial_register, address?, contact?, category?`
- `GET /api/merchants/{id}`
- `PUT /api/merchants/{id}`
- `DELETE /api/merchants/{id}`

### Import Requests (`auth`)
- `GET /api/requests?stage=&search=&per_page=` — البنوك/الصرافات ترى طلباتها فقط
- `POST /api/requests` — multipart: حقول الطلب + `documents[]`
- `GET /api/requests/{id}`
- `POST /api/requests/{id}/transition` — `to_stage, comment?` (محكوم بمصفوفة الأدوار)
- `POST /api/requests/{id}/vote` — `vote: approve|reject|abstain, justification?` (للأعضاء التنفيذيين فقط)
- `GET /api/requests/{id}/documents/{docId}` — تنزيل مرفق

### Audit (`role:admin,committee_manager,support_member`)
- `GET /api/audit/logs?action=&user_id=`
- `GET /api/audit/duplicates`

### Reports (`auth`)
- `GET /api/reports/summary` → `{ totals, byStage, monthly, byCategory }`

## 5. مصفوفة انتقال المراحل (RBAC)

```
submitted        → support_review     [support_member, committee_manager]
support_review   → support_approved   [support_member, committee_manager]
support_review   → returned           [support_member, committee_manager]
support_review   → rejected           [support_member, committee_manager]
returned         → submitted          [commercial_bank, exchange]
support_approved → executive_voting   [committee_manager]
executive_voting → approved | rejected[committee_manager]
approved         → awaiting_swift     [commercial_bank, committee_manager]
awaiting_swift   → customs_released   [admin, committee_manager]
customs_released → completed          [admin, committee_manager]
```

## 6. الأمان

- كلمات المرور مشفّرة عبر bcrypt (Hashed cast).
- Sanctum tokens مع انتهاء صلاحية 7 أيام + throttle على login (10/دقيقة).
- التحقق من المدخلات على مستويين: Zod (الفرونت) + FormRequest (الباكند).
- جميع الإجراءات الحساسة تسجَّل في `audit_logs` (IP, device, action, entity).
- صلاحيات على مستوى المسار (middleware `role`) + على مستوى الانتقال (matrix).
- CORS مقيّد عبر `CORS_ALLOWED_ORIGINS`.

## 7. النشر

**Backend:** Nginx + PHP-FPM 8.2 + MySQL. وفّر `.env` فيه:
- `APP_ENV=production`, `APP_DEBUG=false`, `APP_KEY=...`
- بيانات MySQL، و `SANCTUM_STATEFUL_DOMAINS`, `CORS_ALLOWED_ORIGINS=https://app.example.com`

```bash
composer install --no-dev --optimize-autoloader
php artisan migrate --force
php artisan config:cache route:cache view:cache
```

**Frontend:** أي مضيف يدعم Node 20 (Vercel/Netlify/Server). عيّن:
- `NUXT_PUBLIC_API_BASE=https://api.example.com/api`

```bash
npm ci && npm run build && node .output/server/index.mjs
```

## 8. سكيمة قاعدة البيانات

```
roles                (id, key, name_ar, name_en, permissions json)
users                (id, name, email, phone, organization, password, is_active, mfa_secret)
user_roles           (user_id, role_id) — many-to-many
merchants            (id, name, tax_number*, commercial_register*, address, contact, category, status, transactions_count)
import_requests      (id, reference*, merchant_id, submitted_by, bank, amount, currency, goods_type,
                      supplier, invoice_number, port, stage, risk, is_duplicate, progress, notes, metadata)
request_documents    (id, import_request_id, type, original_name, path, mime, size, uploaded_by)
request_stage_history(id, import_request_id, from_stage, to_stage, actor_id, comment)
request_votes        (id, import_request_id, voter_id, vote, justification) — unique(request, voter)
audit_logs           (id, user_id, action, entity_type, entity_id, reference, ip, device, metadata)
personal_access_tokens (Sanctum)
```

## 9. ملاحظة حول النموذج الأصلي (Lovable)

النموذج التفاعلي الموجود في `src/` ما زال يعمل داخل Lovable preview كبروتوتايب React. التطبيق الإنتاجي الحقيقي هو `backend/` + `frontend-nuxt/` ويُشغَّل خارج Lovable على بنية تحتية مستقلة.
