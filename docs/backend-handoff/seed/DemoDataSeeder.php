<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use App\Models\Organization;
use App\Models\Team;
use App\Models\Role;
use App\Models\Bank;
use App\Models\User;
use App\Models\ReferenceTable;
use App\Models\ReferenceValue;
use App\Models\Merchant;
use App\Models\Notification;
use App\Models\NotificationRecipient;
use App\Models\WorkflowDefinition;
use App\Models\WorkflowVersion;
use App\Models\WorkflowStage;
use App\Models\WorkflowAction;
use App\Models\WorkflowTransition;
use App\Models\StagePermission;
use App\Models\FieldGroup;
use App\Models\FieldDefinition;
use App\Models\StageFieldRule;
use App\Models\ImportRequest as WorkflowRequest;
use App\Models\WorkflowHistory;
use App\Models\AuditLog;
use App\Models\Screen;
use App\Models\ScreenPermission;

class DemoDataSeeder extends Seeder
{
    /** Shared password for every seeded account. */
    public const PASSWORD = 'Password@123';
    public const SWAGGER_LOGIN_EMAIL = 'admin@cby.gov.ye';
    public const SWAGGER_LOGIN_PASSWORD = self::PASSWORD;
    public const SWAGGER_BEARER_TOKEN = 'swagger-demo-token-9f1c6a2b4d0e7f3c8a';
    public const SWAGGER_REQUEST_REFERENCE = 'IMP-2026-2001';
    public const SWAGGER_REQUEST_INVOICE = 'INV-2026-10000';
    public const SWAGGER_REQUEST_CURRENCY = 'USD';
    public const SWAGGER_BANK_CODE = 'ybrd';
    public const SWAGGER_BANK_NAME = 'Yemen Bank for Reconstruction and Development';
    public const SWAGGER_BANK_LICENSE = 'BNK-001';
    public const SWAGGER_BANK_SWIFT = 'YBRDYESA';

    public function run(): void
    {
        $this->clearDemoTables();
        $orgs   = $this->seedOrganizations();
        $teams  = $this->seedTeams($orgs);
        $roles  = $this->seedRoles($orgs);
        $banks  = $this->seedBanks($orgs);
        $values = $this->seedReferenceData();
        $this->seedUsers($orgs, $teams, $roles, $banks);
        $this->seedMerchants($banks, $values);
        $this->seedNotifications();
        $this->seedScreenPermissions($roles);
        $version = $this->seedWorkflow($orgs, $teams, $roles, $values);
        $this->seedRequests($version);
        $this->seedAuditLogs();
        $this->seedSwaggerToken();
    }
    private function clearDemoTables(): void
    {
        DB::statement('SET FOREIGN_KEY_CHECKS=0');

        foreach ([
                     'screen_permissions',
                     'merchant_companies',
                     'merchant_owners',
                     'merchants',
                     'users',
                     'banks',
                     'roles',
                     'teams',
                     'organizations',
                     'reference_values',
                     'reference_tables',
                     'notifications',
                 ] as $table) {
            DB::table($table)->truncate();
        }

        DB::statement('SET FOREIGN_KEY_CHECKS=1');
    }

    // ========================================================================
    // 1. Governance
    // ========================================================================

    /** @return array<string,int> org code => id */
    private function seedOrganizations(): array
    {
        $rows = [
            ['code' => 'commercial_banks',      'name' => 'البنوك التجارية',                 'category' => 'banks'],
            ['code' => 'national_committee',    'name' => 'اللجنة الوطنية لتمويل الواردات',  'category' => 'national_committee'],
            ['code' => 'system_administration', 'name' => 'إدارة النظام',                    'category' => 'other'],
        ];
        $map = [];
        foreach ($rows as $row) {
            $org = Organization::firstOrCreate(
                ['code' => $row['code']],
                ['name' => $row['name'], 'category' => $row['category'], 'is_system' => true, 'is_active' => true],
            );
            $map[$row['code']] = $org->id;
        }
        return $map;
    }

    /** @return array<string,int> team code => id */
    private function seedTeams(array $orgs): array
    {
        $rows = [
            ['code' => 'team_entry',          'name' => 'فريق الإدخال',            'org' => 'commercial_banks'],
            ['code' => 'team_internal',       'name' => 'فريق المراجعة الداخلية',  'org' => 'commercial_banks'],
            ['code' => 'team_fx',             'name' => 'فريق العمليات الخارجية',  'org' => 'commercial_banks'],
            ['code' => 'team_admin_bank',     'name' => 'فريق الإدارة (البنك)',    'org' => 'commercial_banks'],
            ['code' => 'team_support',        'name' => 'فريق اللجنة المساندة',    'org' => 'national_committee'],
            ['code' => 'team_exec',           'name' => 'فريق اللجنة التنفيذية',   'org' => 'national_committee'],
            ['code' => 'team_fx_confirm',     'name' => 'فريق تأكيد العمليات',     'org' => 'national_committee'],
            ['code' => 'team_platform_admin', 'name' => 'إدارة النظام',            'org' => 'system_administration'],
        ];
        $map = [];
        foreach ($rows as $row) {
            $team = Team::firstOrCreate(
                ['organization_id' => $orgs[$row['org']], 'code' => $row['code']],
                ['name' => $row['name'], 'is_system' => true, 'is_active' => true],
            );
            $map[$row['code']] = $team->id;
        }
        return $map;
    }

    /** @return array<string,int> role code => id */
    private function seedRoles(array $orgs): array
    {
        $rows = [
            ['code' => 'rc_platform_admin',   'name' => 'مسؤول نظام اللجنة',                       'org' => 'system_administration'],
            ['code' => 'rc_bank_admin',       'name' => 'مسؤول البنك التجاري',                     'org' => 'commercial_banks'],
            ['code' => 'rc_bank_intake',      'name' => 'موظف إدخال البنك التجاري',                'org' => 'commercial_banks'],
            ['code' => 'rc_bank_reviewer',    'name' => 'مراجع داخلي بالبنك التجاري',              'org' => 'commercial_banks'],
            ['code' => 'rc_bank_swift',       'name' => 'موظف العمليات الخارجية بالبنك التجاري',   'org' => 'commercial_banks'],
            ['code' => 'rc_support_member',   'name' => 'عضو اللجنة المساندة',                     'org' => 'national_committee'],
            ['code' => 'rc_executive_member', 'name' => 'عضو اللجنة التنفيذية',                    'org' => 'national_committee'],
            ['code' => 'rc_committee_manager','name' => 'مدير اللجنة التنفيذية',                   'org' => 'national_committee'],
        ];
        $map = [];
        foreach ($rows as $row) {
            $role = Role::firstOrCreate(
                ['organization_id' => $orgs[$row['org']], 'code' => $row['code']],
                ['name' => $row['name'], 'is_system' => true, 'is_active' => true],
            );
            $map[$row['code']] = $role->id;
        }
        return $map;
    }

    /** @return array<string,int> bank code => id */
    private function seedBanks(array $orgs): array
    {
        $rows = [
            ['code' => 'ybrd', 'name' => 'البنك اليمني للإنشاء والتعمير', 'license' => 'BNK-001', 'swift' => 'YBRDYESA'],
            ['code' => 'tsib', 'name' => 'بنك التضامن الإسلامي',          'license' => 'BNK-002', 'swift' => 'TSIBYESA'],
            ['code' => 'sbai', 'name' => 'بنك سبأ الإسلامي',              'license' => 'BNK-003', 'swift' => 'SBAIYESA'],
        ];
        $map = [];
        foreach ($rows as $row) {
            $bank = Bank::firstOrCreate(
                ['code' => $row['code']],
                [
                    'organization_id' => $orgs['commercial_banks'],
                    'name'            => $row['name'],
                    'license_number'  => $row['license'],   // see CR-10 (must be exposed by the API)
                    'swift_code'      => $row['swift'],
                    'status'          => 'ACTIVE',
                    'is_active'       => true,
                ],
            );
            $map[$row['code']] = $bank->id;
        }
        return $map;
    }

    // ========================================================================
    // 2. Reference data
    // ========================================================================

    /** @return array<string,int> reference value key => id */
    private function seedReferenceData(): array
    {
        $tables = [
            'sector_activity' => ['label' => 'القطاع/النشاط', 'values' => [
                'food' => 'مواد غذائية',
                'medical_supplies' => 'أدوية ومستلزمات طبية',
                'petroleum_derivatives' => 'مشتقات نفطية',
                'spare_parts' => 'قطع غيار',
                'construction_materials' => 'مواد بناء',
                'electronics' => 'إلكترونيات',
            ]],
            'arrival_port' => ['label' => 'ميناء الوصول', 'values' => [
                'aden_port' => 'ميناء عدن',
                'hodeidah_port' => 'ميناء الحديدة',
                'mukalla_port' => 'ميناء المكلا',
                'wadea_crossing' => 'منفذ الوديعة',
            ]],
            'origin_country' => ['label' => 'بلد المنشأ', 'values' => [
                'usa' => 'الولايات المتحدة',
                'germany' => 'ألمانيا',
                'china' => 'الصين',
                'saudi_arabia' => 'السعودية',
                'uae' => 'الإمارات',
                'india' => 'الهند',
                'egypt' => 'مصر',
            ]],
        ];

        $valueMap = [];
        foreach ($tables as $key => $table) {
            $refTable = ReferenceTable::firstOrCreate(
                ['key' => $key],
                ['label' => $table['label'], 'is_system' => true, 'is_active' => true],
            );
            $sort = 0;
            foreach ($table['values'] as $valueKey => $valueLabel) {
                $value = ReferenceValue::firstOrCreate(
                    ['reference_table_id' => $refTable->id, 'key' => $valueKey],
                    ['label' => $valueLabel, 'sort_order' => $sort++, 'is_system' => true, 'is_active' => true],
                );
                $valueMap[$valueKey] = $value->id;
            }
        }
        return $valueMap;
    }

    // ========================================================================
    // 3. Users
    // ========================================================================

    private function seedUsers(array $orgs, array $teams, array $roles, array $banks): void
    {
        // [email, name, org, team, role, bank|null]
        $rows = [
            ['admin@cby.gov.ye',    'ياسر الحضرمي',      'system_administration', 'team_platform_admin', 'rc_platform_admin',   null],
            ['admin@ybank.ye',      'أحمد المقطري',      'commercial_banks',      'team_admin_bank',     'rc_bank_admin',       'ybrd'],
            ['intake@ybank.ye',     'علي القاضي',        'commercial_banks',      'team_entry',          'rc_bank_intake',      'ybrd'],
            ['reviewer@ybank.ye',   'نوال الحاج',        'commercial_banks',      'team_internal',       'rc_bank_reviewer',    'ybrd'],
            ['m.shami@cby.gov.ye',  'محمد الشامي',       'national_committee',    'team_support',        'rc_support_member',   null],
            ['swift@ybank.ye',      'سامي العتمي',       'commercial_banks',      'team_fx',             'rc_bank_swift',       'ybrd'],
            ['huda@cby.gov.ye',     'د. هدى الإرياني',   'national_committee',    'team_fx_confirm',     'rc_committee_manager',null],
            ['sami@cby.gov.ye',     'م. سامي الذماري',   'national_committee',    'team_exec',           'rc_executive_member', null],
            ['nada@cby.gov.ye',     'د. ندى الكبسي',     'national_committee',    'team_exec',           'rc_executive_member', null],
            ['fahd@cby.gov.ye',     'أ. فهد الشرعبي',    'national_committee',    'team_exec',           'rc_executive_member', null],
            ['amina@cby.gov.ye',    'د. أمينة العزب',    'national_committee',    'team_exec',           'rc_executive_member', null],
            ['khaled@cby.gov.ye',   'م. خالد الأنسي',    'national_committee',    'team_exec',           'rc_executive_member', null],
        ];
        foreach ($rows as [$email, $name, $org, $team, $role, $bank]) {
            User::firstOrCreate(
                ['email' => $email],
                [
                    'name'            => $name,
                    'organization_id' => $orgs[$org],
                    'team_id'         => $teams[$team],
                    'role_id'         => $roles[$role],     // canonical role — see CR-06
                    'bank_id'         => $bank ? $banks[$bank] : null,
                    'password'        => Hash::make(self::PASSWORD),
                    'is_active'       => true,
                    'mfa_enabled'     => false,
                ],
            );
        }
    }

    private function seedSwaggerToken(): void
    {
        $admin = User::where('email', self::SWAGGER_LOGIN_EMAIL)->first();
        if (!$admin) {
            return;
        }

        DB::table('personal_access_tokens')->updateOrInsert(
            ['token' => hash('sha256', self::SWAGGER_BEARER_TOKEN)],
            [
                'tokenable_type' => User::class,
                'tokenable_id' => $admin->id,
                'name' => 'swagger-ui',
                'abilities' => json_encode(['*']),
                'last_used_at' => null,
                'expires_at' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );
    }

    // ========================================================================
    // 4. Merchants
    // ========================================================================

    private function seedMerchants(array $banks, array $values): void
    {
        $bankByIndex = ['ybrd', 'tsib', 'sbai']; // merchant i -> bank i % 3
        $addresses = ['صنعاء – شارع الزبيري', 'عدن – كريتر', 'الحديدة – شارع صنعاء', 'المكلا', 'تعز'];
        // [name, sector value key]
        $rows = [
            ['شركة هائل سعيد أنعم',  'food'],
            ['مجموعة الشيباني',      'medical_supplies'],
            ['شركة ثابت إخوان',      'petroleum_derivatives'],
            ['شركة الكميم للأدوية',  'spare_parts'],
            ['مجموعة الأهدل',        'construction_materials'],
        ];
        foreach ($rows as $i => [$name, $sectorKey]) {
            $merchant = Merchant::firstOrCreate(
                ['tax_number' => '4' . (100000 + $i * 7777)],
                [
                    'bank_id'         => $banks[$bankByIndex[$i % 3]],
                    'name'            => $name,
                    'commercial_register' => 'CR-' . (50000 + $i * 13),
                    'tax_card_expiry' => '2026-06-16',
                    'address'         => $addresses[$i % 5],
                    'phone'           => '+9677' . (11000000 + $i * 9999),
                    'status'          => $i === 4 ? 'SUSPENDED' : 'ACTIVE',
                ],
            );

            $merchant->owners()->firstOrCreate(
                ['name' => $name . ' - المالك الرئيسي'],
                ['ownership_percentage' => 25],
            );

            $merchant->companies()->firstOrCreate(
                ['commercial_registration_number' => 'CR-' . (50000 + $i * 13)],
                [
                    'name'                            => $name,
                    'commercial_registration_expiry'  => '2026-06-16',
                    'sector_reference_value_id'       => $values[$sectorKey] ?? null,
                    'is_active'                        => true,
                ],
            );
        }
    }

    // ========================================================================
    // 5. Notifications  (table/column names per 07-data-model.md — verify)
    // ========================================================================

    private function seedNotifications(): void
    {
        $admin = User::where('email', 'admin@cby.gov.ye')->first();
        if (! $admin) {
            return;
        }
        $rows = [
            ['type' => 'request_assigned',  'severity' => 'info',    'title' => 'طلب جديد بحاجة لمراجعتك', 'body' => 'طلب من محرّك سير العمل في مرحلتك الحالية', 'unread' => true],
            ['type' => 'request_action',    'severity' => 'info',    'title' => 'تم تنفيذ إجراء سير عمل',  'body' => 'انتقل الطلب إلى المرحلة التالية',          'unread' => true],
            ['type' => 'compliance',        'severity' => 'warning', 'title' => 'تنبيه: فاتورة مكررة',     'body' => 'رقم فاتورة مستخدم في أكثر من طلب',          'unread' => true],
            ['type' => 'request_closed',    'severity' => 'info',    'title' => 'تم إغلاق طلب',            'body' => 'اكتمل مسار سير العمل',                     'unread' => false],
            ['type' => 'workflow_published','severity' => 'info',    'title' => 'تحديث في مصمم سير العمل', 'body' => 'تم نشر نسخة جديدة من سير العمل',           'unread' => false],
        ];
        foreach ($rows as $row) {
            $notification = Notification::firstOrCreate(
                ['type' => $row['type'], 'title' => $row['title']],
                ['severity' => $row['severity'], 'body' => $row['body'], 'action_url' => null],
            );
            NotificationRecipient::firstOrCreate(
                ['notification_id' => $notification->id, 'user_id' => $admin->id],
                ['read_at' => $row['unread'] ? null : now(), 'archived_at' => null],
            );
        }
    }

    // ========================================================================
    // 5b. Screen permissions (CR-11 + CR-12)
    // ========================================================================

    private function seedScreenPermissions(array $roles): void
    {
        $screenIds = Screen::pluck('id', 'code');
        $allCapabilities = ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'MANAGE'];

        // Permission matrix: role_code => [screen_code => [capabilities]]
        // MANAGE implies all capabilities (VIEW/CREATE/UPDATE/DELETE/EXPORT).
        // Lookup-only entries use VIEW to satisfy CR-12 (multi-resource screen lookups).
        $matrix = [
            'rc_platform_admin' => [
                'organizations' => $allCapabilities,
                'teams' => $allCapabilities,
                'roles' => $allCapabilities,
                'banks' => $allCapabilities,
                'users' => $allCapabilities,
                'merchants' => $allCapabilities,
                'workflow_designer' => $allCapabilities,
                'requests' => $allCapabilities,
                'reports' => $allCapabilities,
                'audit' => $allCapabilities,
                'reference_data' => $allCapabilities,
                'screen_permissions' => $allCapabilities,
                'notifications' => $allCapabilities,
                'settings' => $allCapabilities,
            ],
            'rc_bank_admin' => [
                'merchants' => ['MANAGE'],
                'requests' => ['MANAGE'],
                'users' => ['VIEW', 'CREATE', 'UPDATE'],
                'banks' => ['VIEW'],
                'reports' => ['VIEW', 'EXPORT'],
                'reference_data' => ['VIEW'],           // lookup for merchants
                'organizations' => ['VIEW'],            // lookup for banks
                'notifications' => ['VIEW'],
            ],
            'rc_bank_intake' => [
                'merchants' => ['MANAGE'],
                'requests' => ['VIEW', 'CREATE', 'UPDATE'],
                'banks' => ['VIEW'],                    // lookup for merchants
                'reference_data' => ['VIEW'],           // lookup for merchants
                'notifications' => ['VIEW'],
            ],
            'rc_bank_reviewer' => [
                'requests' => ['VIEW', 'UPDATE'],
                'merchants' => ['VIEW'],
                'banks' => ['VIEW'],                    // lookup
                'reference_data' => ['VIEW'],           // lookup
                'notifications' => ['VIEW'],
            ],
            'rc_bank_swift' => [
                'requests' => ['VIEW', 'UPDATE'],
                'merchants' => ['VIEW'],
                'banks' => ['VIEW'],                    // lookup
                'notifications' => ['VIEW'],
            ],
            'rc_support_member' => [
                'requests' => ['VIEW', 'UPDATE'],
                'merchants' => ['VIEW'],
                'banks' => ['VIEW'],                    // lookup
                'reference_data' => ['VIEW'],           // lookup
                'reports' => ['VIEW', 'EXPORT'],
                'notifications' => ['VIEW'],
            ],
            'rc_executive_member' => [
                'requests' => ['VIEW', 'UPDATE'],
                'merchants' => ['VIEW'],
                'banks' => ['VIEW'],                    // lookup
                'reports' => ['VIEW', 'EXPORT'],
                'notifications' => ['VIEW'],
            ],
            'rc_committee_manager' => [
                'requests' => ['MANAGE'],
                'merchants' => ['VIEW'],
                'banks' => ['VIEW'],                    // lookup
                'users' => ['VIEW'],
                'roles' => ['VIEW'],
                'teams' => ['VIEW'],
                'organizations' => ['VIEW'],            // lookup for roles/teams
                'reports' => ['MANAGE'],
                'audit' => ['VIEW'],
                'reference_data' => ['VIEW'],           // lookup
                'notifications' => ['VIEW'],
            ],
        ];

        foreach ($matrix as $roleCode => $screens) {
            $roleId = $roles[$roleCode] ?? null;
            if (!$roleId) {
                continue;
            }

            foreach ($screens as $screenCode => $capabilities) {
                $screenId = $screenIds[$screenCode] ?? null;
                if (!$screenId) {
                    continue;
                }

                foreach ($capabilities as $capability) {
                    ScreenPermission::firstOrCreate([
                        'role_id' => $roleId,
                        'screen_id' => $screenId,
                        'capability' => $capability,
                    ]);
                }
            }
        }
    }

    // ========================================================================
    // 6. Workflow  (table/column names per 07-data-model.md — verify)
    //    Definition "تمويل الواردات" + one PUBLISHED version (CR-15).
    // ========================================================================

    private function seedWorkflow(array $orgs, array $teams, array $roles, array $values): WorkflowVersion
    {
        $definition = WorkflowDefinition::firstOrCreate(
            ['code' => 'IMPORT_FINANCING'],
            [
                'name'        => 'تمويل الواردات',
                'description' => 'سير العمل الكامل لطلبات تمويل الواردات من إدخال البنك حتى الاعتماد النهائي.',
            ],
        );
        $version = WorkflowVersion::firstOrCreate(
            ['workflow_definition_id' => $definition->id, 'version_number' => 1],
            ['status' => 'PUBLISHED', 'published_at' => now()],
        );

        // ---- Stages: [code, name, order, is_initial, is_final] ----
        $stageRows = [
            ['CREATE',     'إنشاء الطلب',        1,  true,  false],
            ['INTERNAL',   'المراجعة الداخلية',  2,  false, false],
            ['SUPPORT',    'المراجعة المساندة',  3,  false, false],
            ['EXEC',       'القرار التنفيذي',    4,  false, false],
            ['FX',         'عمليات الصرف',       5,  false, false],
            ['FX_CONFIRM', 'تأكيد الصرف',        6,  false, false],
            ['FINAL',      'الاعتماد النهائي',   7,  false, false],
            ['CLOSED',     'مغلق',               99, false, true],
        ];
        $stages = []; // code => id
        foreach ($stageRows as [$code, $name, $order, $isInitial, $isFinal]) {
            $stages[$code] = WorkflowStage::firstOrCreate(
                ['workflow_version_id' => $version->id, 'code' => $code],
                ['name' => $name, 'sort_order' => $order, 'is_initial' => $isInitial, 'is_final' => $isFinal, 'status' => 'ACTIVE'],
            )->id;
        }

        // ---- Actions: [code, name, kind] ----
        $actionRows = [
            ['SAVE_DRAFT',    'حفظ مسودة',              'DRAFT'],
            ['APPROVE',       'اعتماد',                 'APPROVE'],
            ['REJECT',        'رفض',                    'REJECT'],
            ['RETURN',        'إرجاع',                  'RETURN'],
            ['CLOSE',         'إغلاق',                  'CLOSE'],
            ['REJECT_FINAL',  'رفض نهائي',              'REJECT'],
            ['MORE_INFO',     'طلب معلومات إضافية',     'INFO'],
            ['ADD_NOTES',     'إضافة ملاحظات',          'CUSTOM'],
            ['UPLOAD_DOCS',   'رفع مستندات',            'CUSTOM'],
            ['FINAL_APPROVE', 'اعتماد نهائي',           'APPROVE'],
        ];
        $actions = []; // code => id
        foreach ($actionRows as [$code, $name, $kind]) {
            $actions[$code] = WorkflowAction::firstOrCreate(
                ['code' => $code],
                ['name' => $name, 'kind' => $kind, 'is_active' => true, 'is_system' => true],
            )->id;
        }

        // ---- Transitions: [from, action, to] ----
        $transitionRows = [
            ['CREATE',     'APPROVE',       'INTERNAL'],
            ['INTERNAL',   'APPROVE',       'SUPPORT'],
            ['INTERNAL',   'REJECT',        'CREATE'],
            ['SUPPORT',    'APPROVE',       'EXEC'],
            ['SUPPORT',    'ADD_NOTES',     'SUPPORT'],
            ['EXEC',       'APPROVE',       'FX'],
            ['EXEC',       'REJECT_FINAL',  'CLOSED'],
            ['FX',         'APPROVE',       'FX_CONFIRM'],
            ['FX_CONFIRM', 'APPROVE',       'FINAL'],
            ['FX_CONFIRM', 'REJECT',        'FX'],
            ['FINAL',      'FINAL_APPROVE', 'CLOSED'],
            ['FINAL',      'REJECT',        'FX_CONFIRM'],
        ];
        $transitions = []; // from|action|to => id
        foreach ($transitionRows as [$from, $action, $to]) {
            $transition = WorkflowTransition::updateOrCreate(
                ['from_stage_id' => $stages[$from], 'action_id' => $actions[$action]],
                [
                    'workflow_version_id' => $version->id,
                    'to_stage_id' => $stages[$to],
                    'requires_comment' => in_array($action, ['REJECT', 'REJECT_FINAL'], true),
                    'confirmation_message' => null,
                ],
            );
            $transitions[$from . '|' . $action . '|' . $to] = $transition->id;
        }

        // ---- Stage permissions: [stage, org, team|null, role|null, level, label] ----
        $permRows = [
            ['CREATE',     'commercial_banks',   'team_entry',      null,                  'EXECUTE', 'تقديم الطلب'],
            ['INTERNAL',   'commercial_banks',   'team_internal',   null,                  'EXECUTE', 'المراجعة الداخلية بالبنك'],
            ['SUPPORT',    'national_committee',  'team_support',    null,                  'EXECUTE', 'مراجعة اللجنة المساندة'],
            ['EXEC',       'national_committee',  null,              'rc_committee_manager','EXECUTE', 'قرار اللجنة التنفيذية'],
            ['EXEC',       'national_committee',  null,              'rc_executive_member', 'VIEW',    'اطلاع أعضاء اللجنة التنفيذية'],
            ['FX',         'commercial_banks',   'team_fx',         null,                  'EXECUTE', 'تنفيذ عملية الصرف'],
            ['FX_CONFIRM', 'national_committee',  'team_fx_confirm', null,                  'EXECUTE', 'تأكيد عملية الصرف'],
            ['FINAL',      'national_committee',  null,              'rc_committee_manager','EXECUTE', 'الاعتماد النهائي'],
            ['CLOSED',     'national_committee',  null,              'rc_committee_manager','VIEW',    'إغلاق الطلب'],
        ];
        foreach ($permRows as [$stage, $org, $team, $role, $level, $label]) {
            StagePermission::firstOrCreate(
                [
                    'stage_id'        => $stages[$stage],
                    'organization_id' => $orgs[$org],
                    'team_id'         => $team ? $teams[$team] : null,
                    'role_id'         => $role ? $roles[$role] : null,
                ],
                ['access_level' => $level, 'display_label' => $label],
            );
        }

        // ---- Field groups + field definitions + stage field rules ----
        $this->seedFields($version, $stages, $values);

        return $version;
    }

    private function seedFields(WorkflowVersion $version, array $stages, array $values): void
    {
        // sector_activity table id (for the dynamic select referencing reference data)
        $sectorTableId = ReferenceTable::where('key', 'sector_activity')->value('id');
        $portTableId   = ReferenceTable::where('key', 'arrival_port')->value('id');
        $originTableId = ReferenceTable::where('key', 'origin_country')->value('id');

        $groupRows = [
            ['basic',    'المعلومات الأساسية', 1],
            ['invoice',  'بيانات الفاتورة',    2],
            ['shipping', 'بيانات الشحن',       3],
            ['docs',     'الوثائق المطلوبة',   4],
        ];
        $groups = []; // key => id
        foreach ($groupRows as [$key, $name, $order]) {
            $groups[$key] = FieldGroup::firstOrCreate(
                ['workflow_version_id' => $version->id, 'code' => $key],
                ['label' => $name, 'sort_order' => $order],
            )->id;
        }

        // [key, label, type, group, options[], reference_table_id, dynamic_source]
        $S = ['دولار أمريكي', 'يورو', 'ريال سعودي'];
        $fieldRows = [
            ['taxNumber', 'الرقم الضريبي', 'TEXT', 'basic', null, null, null],
            ['importerName', 'اسم التاجر', 'DYNAMIC_SELECT', 'basic', null, null, 'merchants'],
            ['linkedCompany', 'الشركة المرتبطة', 'DYNAMIC_SELECT', 'basic', null, null, 'merchant_companies'],
            ['taxCardExpiry', 'تاريخ انتهاء البطاقة الضريبية', 'DATE', 'basic', null, null, null],
            ['commercialRegistration', 'رقم السجل التجاري', 'TEXT', 'basic', null, null, null],
            ['commercialRegistrationExpiry', 'تاريخ انتهاء السجل التجاري', 'DATE', 'basic', null, null, null],
            ['owners', 'الملاك والمساهمون (25% فأكثر)', 'TEXTAREA', 'basic', null, null, null],

            ['requestType', 'نوع الطلب', 'SELECT', 'invoice', ['طلب مصارفة وتحويل خارجي', 'طلب تمويل واردات', 'طلب اعتماد مستندي'], null, null],
            ['coverageType', 'نوع التغطية', 'SELECT', 'invoice', ['اعتماد مستندي', 'تحويل مباشر', 'دفعة مقدمة'], null, null],
            ['foreignCurrencySource', 'مصادر العملة الأجنبية', 'SELECT', 'invoice', ['حساب العميل', 'موارد البنك', 'مصدر خارجي'], null, null],
            ['paymentTerms', 'شروط الدفع', 'SELECT', 'invoice', ['كلي', 'جزئي'], null, null],
            ['requestCurrency', 'عملة الطلب', 'SELECT', 'invoice', $S, null, null],
            ['requestPercentage', 'نسبة الطلب %', 'NUMBER', 'invoice', null, null, null],
            ['invoiceType', 'نوع الفاتورة', 'SELECT', 'invoice', ['فاتورة تجارية', 'فاتورة أولية'], null, null],
            ['financeAmount', 'إجمالي الطلب', 'CURRENCY', 'invoice', null, null, null],
            ['currency', 'عملة الفاتورة', 'SELECT', 'invoice', $S, null, null],
            ['invoiceNumber', 'رقم الفاتورة', 'TEXT', 'invoice', null, null, null],
            ['invoiceDate', 'تاريخ الفاتورة', 'DATE', 'invoice', null, null, null],
            ['quantity', 'الكمية', 'NUMBER', 'invoice', null, null, null],
            ['unit', 'وحدة القياس', 'TEXT', 'invoice', null, null, null],
            ['invoiceTotal', 'إجمالي الفاتورة', 'CURRENCY', 'invoice', null, null, null],
            ['importType', 'السلعة', 'DYNAMIC_SELECT', 'invoice', null, $sectorTableId, 'reference_data'],
            ['supplierName', 'اسم الشركة المصدرة', 'TEXT', 'invoice', null, null, null],
            ['supplierLocation', 'موقع الشركة المصدرة', 'TEXT', 'invoice', null, null, null],
            ['originCountry', 'بلد المنشأ', 'DYNAMIC_SELECT', 'invoice', null, $originTableId, 'reference_data'],

            ['shippingDate', 'تاريخ الشحن', 'DATE', 'shipping', null, null, null],
            ['arrivalDate', 'تاريخ الوصول', 'DATE', 'shipping', null, null, null],
            ['shippingPort', 'ميناء الشحن', 'TEXT', 'shipping', null, null, null],
            ['arrivalPort', 'ميناء الوصول', 'DYNAMIC_SELECT', 'shipping', null, $portTableId, 'reference_data'],
            ['deliveryTerms', 'شروط التسليم', 'SELECT', 'shipping', ['FOB', 'CIF', 'CFR'], null, null],
            ['finalDestination', 'الوجهة النهائية', 'TEXT', 'shipping', null, null, null],

            ['docYemeniRialSharia', 'كشف حساب بالريال اليمني (مناطق الشرعية)', 'FILE', 'docs', null, null, null],
            ['docSaudiRialSharia', 'كشف حساب بالريال السعودي (مناطق الشرعية)', 'FILE', 'docs', null, null, null],
            ['docUsdSharia', 'كشف حساب بالدولار الأمريكي (مناطق الشرعية)', 'FILE', 'docs', null, null, null],
            ['docTaxAndCr', 'البطاقة الضريبية والسجل التجاري', 'FILE', 'docs', null, null, null],
            ['docCommercialInvoice', 'الفاتورة', 'FILE', 'docs', null, null, null],
            ['docLicenses', 'التراخيص المطلوبة لبعض السلع', 'FILE', 'docs', null, null, null],
            ['docExtra', 'مستندات إضافية', 'FILE', 'docs', null, null, null],
        ];

        $requiredOnCreate = [
            'taxNumber', 'importerName', 'linkedCompany', 'taxCardExpiry', 'commercialRegistration', 'commercialRegistrationExpiry',
            'requestType', 'coverageType', 'foreignCurrencySource', 'paymentTerms', 'requestCurrency', 'requestPercentage',
            'invoiceType', 'financeAmount', 'currency', 'invoiceNumber', 'invoiceDate', 'quantity', 'unit', 'invoiceTotal',
            'importType', 'supplierName', 'supplierLocation', 'originCountry',
            'shippingDate', 'arrivalDate', 'shippingPort', 'arrivalPort', 'deliveryTerms', 'finalDestination',
            'docYemeniRialSharia', 'docSaudiRialSharia', 'docUsdSharia', 'docTaxAndCr', 'docCommercialInvoice',
        ];

        $fields = []; // key => id
        foreach ($fieldRows as [$key, $label, $type, $group, $options, $refTableId, $dynamicSource]) {
            $fields[$key] = FieldDefinition::firstOrCreate(
                ['workflow_version_id' => $version->id, 'key' => $key],
                [
                    'label'              => $label,
                    'type'               => $type,
                    'options'            => $options,        // cast to array/json on the model
                    'reference_table_id' => $refTableId,
                    'dynamic_source'     => $dynamicSource,
                    'field_group_id'     => $groups[$group],
                    'is_system'          => true,
                ],
            )->id;
        }

        // Stage field rules: CREATE stage is editable (required per the list above);
        // every later stage shows all fields read-only.
        foreach ($fields as $key => $fieldId) {
            StageFieldRule::firstOrCreate(
                ['stage_id' => $stages['CREATE'], 'field_id' => $fieldId],
                ['is_visible' => true, 'is_editable' => true, 'is_required' => in_array($key, $requiredOnCreate, true)],
            );
            foreach (['INTERNAL', 'SUPPORT', 'EXEC', 'FX', 'FX_CONFIRM', 'FINAL', 'CLOSED'] as $stageCode) {
                StageFieldRule::firstOrCreate(
                    ['stage_id' => $stages[$stageCode], 'field_id' => $fieldId],
                    ['is_visible' => true, 'is_editable' => false, 'is_required' => false],
                );
            }
        }
    }

    // ========================================================================
    // 7. Requests  (15 samples + workflow history; per 07-data-model.md — verify)
    // ========================================================================

        private function seedRequests(WorkflowVersion $version): void
    {
        $creator = User::where('email', 'intake@ybank.ye')->first();
        $stages = WorkflowStage::where('workflow_version_id', $version->id)->pluck('id', 'code');
        $actions = WorkflowAction::all()->mapWithKeys(fn ($action) => [strtoupper($action->code) => $action->id]);
        $merchantsByName = Merchant::pluck('id', 'name');
        $merchantBank = Merchant::pluck('bank_id', 'name');

        // Linear forward path: stage code => the user email who acts while in it.
        $path = ['CREATE', 'INTERNAL', 'SUPPORT', 'EXEC', 'FX', 'FX_CONFIRM', 'FINAL', 'CLOSED'];
        $actorEmail = [
            'CREATE' => 'intake@ybank.ye', 'INTERNAL' => 'reviewer@ybank.ye', 'SUPPORT' => 'm.shami@cby.gov.ye',
            'EXEC' => 'huda@cby.gov.ye', 'FX' => 'swift@ybank.ye', 'FX_CONFIRM' => 'huda@cby.gov.ye', 'FINAL' => 'huda@cby.gov.ye',
        ];
        $actorId = [];
        foreach ($actorEmail as $stage => $email) {
            $actorId[$stage] = User::where('email', $email)->value('id');
        }

        // [stage, status, importer, amount, currencyLabel, invoiceNumber, importType, supplier, origin, arrivalPort]
        // NOTE: Request #13 (FINAL) intentionally uses the same invoice INV-2026-10022 as #3 (INTERNAL)
        //       to test the duplicate invoice warning feature in the frontend.
        $rows = [
            ['CREATE',     'ACTIVE',   'شركة هائل سعيد أنعم',  120000,  'دولار أمريكي', 'INV-2026-10000', 'مواد غذائية',           'Cargill Inc.',          'الولايات المتحدة', 'ميناء عدن'],
            ['CREATE',     'ACTIVE',   'مجموعة الشيباني',      340000,  'دولار أمريكي', 'INV-2026-10011', 'قطع غيار',             'Siemens AG',            'ألمانيا',          'ميناء الحديدة'],
            ['INTERNAL',   'ACTIVE',   'شركة ثابت إخوان',      510000,  'دولار أمريكي', 'INV-2026-10022', 'أدوية ومستلزمات طبية', 'Pfizer Ltd.',           'الولايات المتحدة', 'ميناء عدن'],
            ['INTERNAL',   'ACTIVE',   'شركة الكميم للأدوية',  89000,   'يورو',         'INV-2026-10033', 'أدوية ومستلزمات طبية', 'Bayer AG',              'ألمانيا',          'ميناء المكلا'],
            ['SUPPORT',    'ACTIVE',   'مجموعة الأهدل',        720000,  'دولار أمريكي', 'INV-2026-10044', 'مشتقات نفطية',         'Saudi Aramco Trading',  'السعودية',         'ميناء الحديدة'],
            ['SUPPORT',    'ACTIVE',   'شركة هائل سعيد أنعم',  145000,  'ريال سعودي',   'INV-2026-10055', 'إلكترونيات',           'Siemens AG',            'ألمانيا',          'منفذ الوديعة'],
            ['EXEC',       'ACTIVE',   'مجموعة الشيباني',      980000,  'دولار أمريكي', 'INV-2026-10066', 'مواد غذائية',           'Cargill Inc.',          'الولايات المتحدة', 'ميناء عدن'],
            ['EXEC',       'ACTIVE',   'شركة ثابت إخوان',      230000,  'يورو',         'INV-2026-10077', 'مواد بناء',             'Siemens AG',            'ألمانيا',          'ميناء الحديدة'],
            ['FX',         'ACTIVE',   'شركة الكميم للأدوية',  415000,  'دولار أمريكي', 'INV-2026-10088', 'أدوية ومستلزمات طبية', 'Pfizer Ltd.',           'الولايات المتحدة', 'ميناء المكلا'],
            ['FX',         'ACTIVE',   'مجموعة الأهدل',        1250000, 'دولار أمريكي', 'INV-2026-10099', 'مشتقات نفطية',         'Saudi Aramco Trading',  'السعودية',         'ميناء عدن'],
            ['FX_CONFIRM', 'ACTIVE',   'شركة هائل سعيد أنعم',  640000,  'دولار أمريكي', 'INV-2026-10110', 'مواد غذائية',           'Cargill Inc.',          'الولايات المتحدة', 'ميناء الحديدة'],
            ['FX_CONFIRM', 'ACTIVE',   'مجموعة الشيباني',      1100000, 'دولار أمريكي', 'INV-2026-10121', 'مشتقات نفطية',         'Saudi Aramco Trading',  'السعودية',         'ميناء عدن'],
            ['FINAL',      'ACTIVE',   'شركة ثابت إخوان',      420000,  'يورو',         'INV-2026-10022', 'إلكترونيات',           'Bayer AG',              'ألمانيا',          'منفذ الوديعة'],
            ['CLOSED',     'CLOSED',   'مجموعة الأهدل',        540000,  'دولار أمريكي', 'INV-2026-10143', 'مواد غذائية',           'Cargill Inc.',          'الولايات المتحدة', 'ميناء عدن'],
            ['CLOSED',     'CLOSED',   'شركة الكميم للأدوية',  1280000, 'دولار أمريكي', 'INV-2026-10154', 'قطع غيار',             'Siemens AG',            'ألمانيا',          'ميناء الحديدة'],
            ['CLOSED',     'REJECTED', 'شركة هائل سعيد أنعم',  980000,  'دولار أمريكي', 'INV-2026-10165', 'مشتقات نفطية',         'Saudi Aramco Trading',  'السعودية',         'ميناء المكلا'],
        ];
        $currencyCodes = [
            'دولار أمريكي' => 'USD',
            'يورو' => 'EUR',
            'ريال سعودي' => 'SAR',
        ];

        // Merchant details for the data JSON — matches frontend mock merchantFixture()
        $merchantDetails = [
            'شركة هائل سعيد أنعم' => ['taxNumber' => '4100000', 'linkedCompany' => 'شركة هائل سعيد أنعم للتجارة', 'commercialRegistration' => 'CR-50000', 'owners' => 'عبد الجليل هائل سعيد - 25%'],
            'مجموعة الشيباني'     => ['taxNumber' => '4107777', 'linkedCompany' => 'الشيباني للاستيراد',           'commercialRegistration' => 'CR-50013', 'owners' => 'أحمد الشيباني - 25%'],
            'شركة ثابت إخوان'     => ['taxNumber' => '4115554', 'linkedCompany' => 'ثابت إخوان للتجارة',          'commercialRegistration' => 'CR-50026', 'owners' => 'محمد ثابت - 25%'],
            'شركة الكميم للأدوية' => ['taxNumber' => '4123331', 'linkedCompany' => 'الكميم للأدوية',              'commercialRegistration' => 'CR-50039', 'owners' => 'علي الكميم - 25%'],
            'مجموعة الأهدل'       => ['taxNumber' => '4131108', 'linkedCompany' => 'الأهدل للتجارة',              'commercialRegistration' => 'CR-50052', 'owners' => 'سالم الأهدل - 25%'],
        ];

        // Lookup transition IDs for history entries
        $transitions = [];
        $allTransitions = WorkflowTransition::where('workflow_version_id', $version->id)->get();
        foreach ($allTransitions as $t) {
            $fromCode = WorkflowStage::find($t->from_stage_id)?->code;
            $toCode = WorkflowStage::find($t->to_stage_id)?->code;
            $actionCode = WorkflowAction::find($t->action_id)?->code;
            if ($fromCode && $toCode && $actionCode) {
                $transitions["{$fromCode}|{$actionCode}|{$toCode}"] = $t->id;
            }
        }

        foreach ($rows as $idx => $row) {
            [$stageCode, $status, $importer, $amount, $currencyLabel, $invoiceNumber, $importType, $supplier, $origin, $arrivalPort] = $row;
            $currencyCode = $currencyCodes[$currencyLabel] ?? $currencyLabel;
            $reference = 'IMP-2026-' . str_pad((string) (2001 + $idx), 4, '0', STR_PAD_LEFT);
            $createdAt = now()->copy()->subDays(30 - ($idx % 27));
            $merchant = $merchantDetails[$importer] ?? [];

            // Full data JSON — all form fields the frontend dynamic form expects
            $fullData = [
                'taxNumber'                    => $merchant['taxNumber'] ?? null,
                'importerName'                 => $importer,
                'linkedCompany'                => $merchant['linkedCompany'] ?? null,
                'taxCardExpiry'                => '2026-06-16',
                'commercialRegistration'       => $merchant['commercialRegistration'] ?? null,
                'commercialRegistrationExpiry' => '2026-06-16',
                'owners'                       => $merchant['owners'] ?? null,
                'requestType'                  => 'طلب مصارفة وتحويل خارجي',
                'coverageType'                 => 'اعتماد مستندي',
                'foreignCurrencySource'        => 'حساب العميل',
                'paymentTerms'                 => 'كلي',
                'requestCurrency'              => $currencyLabel,
                'requestPercentage'            => 100,
                'invoiceType'                  => 'فاتورة تجارية',
                'financeAmount'                => $amount,
                'currency'                     => $currencyCode,
                'invoiceNumber'                => $invoiceNumber,
                'invoiceDate'                  => '2026-06-16',
                'quantity'                     => 1,
                'unit'                         => 'كرتون',
                'invoiceTotal'                 => $amount,
                'importType'                   => $importType,
                'supplierName'                 => $supplier,
                'supplierLocation'             => 'المدينة / الدولة',
                'originCountry'                => $origin,
                'shippingDate'                 => '2026-06-16',
                'arrivalDate'                  => '2026-06-16',
                'shippingPort'                 => 'ميناء الشحن',
                'arrivalPort'                  => $arrivalPort,
                'deliveryTerms'                => 'CIF',
                'finalDestination'             => 'المدينة / المخزن الوجهة',
                'requestIdentifier'            => $reference,
            ];

            $request = WorkflowRequest::firstOrCreate(
                ['reference' => $reference],
                [
                    'workflow_version_id' => $version->id,
                    'current_stage_id'    => $stages[$stageCode],
                    'status'              => $status,
                    'created_by'          => $creator?->id,
                    'bank_id'             => $merchantBank[$importer] ?? null,
                    'merchant_id'         => $merchantsByName[$importer] ?? null,
                    'amount'              => $amount,
                    'currency'            => $currencyCode,
                    'invoice_number'      => $invoiceNumber,
                    'supplier_name'       => $supplier,
                    'import_type'         => $importType,
                    'country_of_origin'   => $origin,
                    'goods_description'   => $importType,
                    'port_of_entry'       => $arrivalPort,
                    'payment_terms'       => 'كلي',
                    'invoice_date'        => '2026-06-16',
                    'shipping_port'       => 'ميناء الشحن',
                    'data'                => $fullData,
                    'created_at'          => $createdAt,
                ],
            );

            // Build the history chain (create -> ... -> current stage).
            $ts = $createdAt->copy();
            WorkflowHistory::firstOrCreate(
                ['request_id' => $request->id, 'to_stage_id' => $stages['CREATE'], 'from_stage_id' => null],
                [
                    'action_id'     => null,
                    'transition_id' => null,
                    'performed_by'  => $actorId['CREATE'],
                    'comment'       => 'إنشاء الطلب',
                    'data_snapshot' => ['event' => 'create', 'stage' => 'CREATE'],
                    'created_at'    => $ts->copy(),
                ],
            );

            if ($status === 'REJECTED') {
                $hops = [['CREATE', 'INTERNAL', 'APPROVE'], ['INTERNAL', 'SUPPORT', 'APPROVE'], ['SUPPORT', 'EXEC', 'APPROVE'], ['EXEC', 'CLOSED', 'REJECT_FINAL']];
            } else {
                $targetIdx = array_search($stageCode, $path, true);
                $hops = [];
                for ($i = 1; $i <= $targetIdx; $i++) {
                    $action = $path[$i] === 'CLOSED' ? 'FINAL_APPROVE' : 'APPROVE';
                    $hops[] = [$path[$i - 1], $path[$i], $action];
                }
            }
            foreach ($hops as [$from, $to, $action]) {
                $ts = $ts->copy()->addDay();
                WorkflowHistory::firstOrCreate(
                    ['request_id' => $request->id, 'from_stage_id' => $stages[$from], 'to_stage_id' => $stages[$to], 'action_id' => $actions[$action]],
                    [
                        'transition_id' => $transitions["{$from}|{$action}|{$to}"] ?? null,
                        'performed_by'  => $actorId[$from] ?? $creator?->id,
                        'comment'       => $action,
                        'data_snapshot' => ['from' => $from, 'to' => $to, 'action' => $action],
                        'created_at'    => $ts->copy(),
                    ],
                );
            }
        }
    }

    // ========================================================================
    // 8. Audit logs  (append-only; table/column names per 07-data-model.md — verify)
    //    25 sample entries. Idempotent via correlation_id = demo_audit_{i}.
    // ========================================================================

    private function seedAuditLogs(): void
    {
        $users = User::pluck('id', 'name'); // name => id
        $names = $users->keys()->values();
        if ($names->isEmpty()) {
            return;
        }
        // Frontend audit action labels -> machine-readable event codes.
        $events = ['AUTH_LOGIN', 'REQUEST_CREATED', 'REQUEST_ACTION_EXECUTED', 'RESOURCE_UPDATED', 'REPORT_EXPORTED'];
        $devices = ['Chrome / Win', 'Edge / Win', 'Safari / macOS', 'Firefox / Linux'];

        for ($i = 0; $i < 25; $i++) {
            $actorName = $names[$i % $names->count()];
            AuditLog::firstOrCreate(
                ['correlation_id' => 'demo_audit_' . $i],
                [
                    'action'        => $events[$i % 5],
                    'actor_user_id' => $users[$actorName] ?? null,
                    'event_code'    => $events[$i % 5],
                    'ip_address'    => '196.' . (10 + ($i % 200)) . '.' . ($i % 255) . '.' . (($i * 13) % 255),
                    'user_agent'    => $devices[$i % 4],
                    'metadata'      => ['reference' => 'INV-2026-' . (10000 + ($i % 16))],
                    'created_at'    => now()->copy()->subHours($i),
                ],
            );
        }
    }
}
