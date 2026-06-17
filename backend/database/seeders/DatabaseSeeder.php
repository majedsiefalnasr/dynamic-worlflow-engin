<?php

namespace Database\Seeders;

use App\Models\ImportRequest;
use App\Models\Merchant;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\DB;
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
          DB::statement('SET FOREIGN_KEY_CHECKS=0;');
        $rolesData = [
            ['key' => 'commercial_bank', 'name_ar' => 'بنك تجاري'],
            ['key' => 'exchange', 'name_ar' => 'شركة صرافة'],
            ['key' => 'support_member', 'name_ar' => 'عضو اللجنة المساندة'],
            ['key' => 'executive_member', 'name_ar' => 'عضو اللجنة التنفيذية'],
            ['key' => 'committee_manager', 'name_ar' => 'مدير اللجنة'],
            ['key' => 'admin', 'name_ar' => 'مسؤول النظام'],
        ];
        foreach ($rolesData as $r) Role::firstOrCreate(['key' => $r['key']], $r);

        $users = [
            ['أحمد المقطري', 'ahmed@ybank.ye', 'البنك اليمني للإنشاء والتعمير', 'commercial_bank'],
            ['سارة العمري', 'sara@alkuraimi.ye', 'صرافة الكريمي', 'exchange'],
            ['محمد الشامي', 'm.shami@cby.gov.ye', 'البنك المركزي – لجنة مساندة', 'support_member'],
            ['د. هدى الإرياني', 'huda@cby.gov.ye', 'البنك المركزي – لجنة تنفيذية', 'executive_member'],
            ['أ. خالد العنسي', 'kh.ansi@cby.gov.ye', 'مدير لجنة تنظيم وتمويل الواردات', 'committee_manager'],
            ['ياسر الحضرمي', 'admin@cby.gov.ye', 'إدارة الأنظمة', 'admin'],
        ];
        foreach ($users as [$name, $email, $org, $role]) {
            $u = User::firstOrCreate(['email' => $email], [
                'name' => $name, 'organization' => $org,
                'password' => Hash::make('Password@123'),
            ]);
            $u->roles()->syncWithoutDetaching([Role::where('key', $role)->value('id')]);
        }

        $merchantNames = [
            'شركة هائل سعيد أنعم', 'مجموعة الشيباني', 'شركة ثابت إخوان',
            'شركة الكميم للأدوية', 'مجموعة الأهدل',
        ];
        foreach ($merchantNames as $i => $name) {
            Merchant::firstOrCreate(['tax_number' => '4'.(100000 + $i * 7777)], [
                'name' => $name,
                'commercial_register' => 'CR-'.(50000 + $i * 13),
                'address' => ['صنعاء', 'عدن', 'الحديدة', 'المكلا', 'تعز'][$i],
                'contact' => '+9677'.(11000000 + $i * 9999),
                'category' => ['غذائية', 'أدوية', 'مشتقات نفطية', 'قطع غيار', 'بناء'][$i],
                'status' => $i === 4 ? 'suspended' : 'active',
            ]);
        }

        // Sample requests
        $bank = User::where('email', 'ahmed@ybank.ye')->first();
        $merchants = Merchant::all();
        $stages = ImportRequest::STAGES;
        $types = ['مواد غذائية', 'أدوية', 'مشتقات نفطية', 'قطع غيار'];

        for ($i = 0; $i < 25; $i++) {
            ImportRequest::firstOrCreate(
                ['reference' => 'IMP-2025-'.(2000 + $i)],
                [
                    'merchant_id' => $merchants->random()->id,
                    'submitted_by' => $bank->id,
                    'bank' => 'البنك اليمني للإنشاء',
                    'amount' => random_int(50_000, 4_500_000),
                    'currency' => ['USD', 'EUR', 'SAR'][$i % 3],
                    'goods_type' => $types[$i % count($types)],
                    'supplier' => ['Cargill Inc.', 'Pfizer Ltd.', 'Saudi Aramco', 'Siemens'][$i % 4],
                    'invoice_number' => 'INV-'.(2024000 + $i * 7),
                    'port' => ['ميناء عدن', 'ميناء الحديدة', 'ميناء المكلا'][$i % 3],
                    'stage' => $stages[$i % count($stages)],
                    'risk' => ['low', 'medium', 'high'][$i % 3],
                    'progress' => (int) round(($i % count($stages)) / (count($stages) - 1) * 100),
                ]
            );
        }

          DB::statement('SET FOREIGN_KEY_CHECKS=1;');
    }
}
