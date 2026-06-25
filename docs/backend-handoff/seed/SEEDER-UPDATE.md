# Seeder Update — Align Backend with Frontend Mock Data

**Date:** 2026-06-25
**Purpose:** The current `DemoDataSeeder::seedRequests()` only populates 8 fields in the `data` JSON and leaves dedicated columns (`supplier_name`, `import_type`, etc.) null. The frontend's dynamic form and detail view need all fields populated. This update aligns the seeder with the frontend mock data so testing shows identical results.

## Changes Required

### 1. Add columns to `ImportRequest` model `$fillable`

```php
// app/Models/ImportRequest.php
protected $fillable = [
    'workflow_version_id',
    'current_stage_id',
    'reference',
    'status',
    'created_by',
    'bank_id',
    'merchant_id',
    'data',
    'amount',
    'currency',
    'invoice_number',
    'version',
    // Add these (must exist as DB columns):
    'supplier_name',
    'import_type',
    'country_of_origin',
    'goods_description',
    'port_of_entry',
    'payment_terms',
    'invoice_date',
    'shipping_port',
];
```

If these columns don't exist in the `requests` table yet, add a migration:

```php
Schema::table('requests', function (Blueprint $table) {
    $table->string('supplier_name')->nullable()->after('invoice_number');
    $table->string('import_type')->nullable()->after('supplier_name');
    $table->string('country_of_origin')->nullable()->after('import_type');
    $table->text('goods_description')->nullable()->after('country_of_origin');
    $table->string('port_of_entry')->nullable()->after('goods_description');
    $table->string('payment_terms')->nullable()->after('port_of_entry');
    $table->date('invoice_date')->nullable()->after('payment_terms');
    $table->string('shipping_port')->nullable()->after('invoice_date');
});
```

### 2. Replace `seedRequests()` method

Replace the entire `seedRequests()` method in `DemoDataSeeder.php` with the version below. The key changes:

- Populates dedicated DB columns (`supplier_name`, `import_type`, etc.) so the `ImportRequestResource` serves them
- Enriches the `data` JSON with ALL form fields (30+ fields matching the frontend's dynamic form)
- Derives merchant details (tax number, CR, linked company, owners) per merchant — matching mock data
- Request #13 (FINAL stage) uses duplicate invoice number `INV-2026-10022` (same as request #3) to test the duplicate invoice warning feature

```php
    private function seedRequests(WorkflowVersion $version): void
    {
        $creator = User::where('email', 'intake@ybank.ye')->first();
        $stages = WorkflowStage::where('workflow_version_id', $version->id)->pluck('id', 'code');
        $actions = WorkflowAction::all()->mapWithKeys(fn ($action) => [strtoupper($action->code) => $action->id]);
        $merchantsByName = Merchant::pluck('id', 'name');
        $merchantBank = Merchant::pluck('bank_id', 'name');

        $path = ['CREATE', 'INTERNAL', 'SUPPORT', 'EXEC', 'FX', 'FX_CONFIRM', 'FINAL', 'CLOSED'];
        $actorEmail = [
            'CREATE' => 'intake@ybank.ye', 'INTERNAL' => 'reviewer@ybank.ye', 'SUPPORT' => 'm.shami@cby.gov.ye',
            'EXEC' => 'huda@cby.gov.ye', 'FX' => 'swift@ybank.ye', 'FX_CONFIRM' => 'huda@cby.gov.ye', 'FINAL' => 'huda@cby.gov.ye',
        ];
        $actorId = [];
        foreach ($actorEmail as $stage => $email) {
            $actorId[$stage] = User::where('email', $email)->value('id');
        }

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

        // [stage, status, importer, amount, currencyLabel, invoiceNumber, importType, supplier, origin, arrivalPort]
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

        foreach ($rows as $idx => $row) {
            [$stageCode, $status, $importer, $amount, $currencyLabel, $invoiceNumber, $importType, $supplier, $origin, $arrivalPort] = $row;
            $currencyCode = $currencyCodes[$currencyLabel] ?? $currencyLabel;
            $reference = 'IMP-2026-' . str_pad((string) (2001 + $idx), 4, '0', STR_PAD_LEFT);
            $createdAt = now()->copy()->subDays(30 - ($idx % 27));

            $merchant = $merchantDetails[$importer] ?? [];

            // Full data JSON — all form fields the frontend dynamic form expects
            $fullData = [
                // Basic info (fg_basic)
                'taxNumber'                      => $merchant['taxNumber'] ?? null,
                'importerName'                   => $importer,
                'linkedCompany'                  => $merchant['linkedCompany'] ?? null,
                'taxCardExpiry'                  => '2026-06-16',
                'commercialRegistration'         => $merchant['commercialRegistration'] ?? null,
                'commercialRegistrationExpiry'   => '2026-06-16',
                'owners'                         => $merchant['owners'] ?? null,
                // Invoice info (fg_invoice)
                'requestType'                    => 'طلب مصارفة وتحويل خارجي',
                'coverageType'                   => 'اعتماد مستندي',
                'foreignCurrencySource'          => 'حساب العميل',
                'paymentTerms'                   => 'كلي',
                'requestCurrency'                => $currencyLabel,
                'requestPercentage'              => 100,
                'invoiceType'                    => 'فاتورة تجارية',
                'financeAmount'                  => $amount,
                'currency'                       => $currencyCode,
                'invoiceNumber'                  => $invoiceNumber,
                'invoiceDate'                    => '2026-06-16',
                'quantity'                       => 1,
                'unit'                           => 'كرتون',
                'invoiceTotal'                   => $amount,
                'importType'                     => $importType,
                'supplierName'                   => $supplier,
                'supplierLocation'               => 'المدينة / الدولة',
                'originCountry'                  => $origin,
                // Shipping info (fg_shipping)
                'shippingDate'                   => '2026-06-16',
                'arrivalDate'                    => '2026-06-16',
                'shippingPort'                   => 'ميناء الشحن',
                'arrivalPort'                    => $arrivalPort,
                'deliveryTerms'                  => 'CIF',
                'finalDestination'               => 'المدينة / المخزن الوجهة',
                // Request identifier (added by engine on creation)
                'requestIdentifier'              => $reference,
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
                    // Dedicated columns (for ImportRequestResource)
                    'supplier_name'       => $supplier,
                    'import_type'         => $importType,
                    'country_of_origin'   => $origin,
                    'goods_description'   => $importType,
                    'port_of_entry'       => $arrivalPort,
                    'payment_terms'       => 'كلي',
                    'invoice_date'        => '2026-06-16',
                    'shipping_port'       => 'ميناء الشحن',
                    // Full form data JSON
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
```

### 3. Changes Summary

| What | Before | After |
|---|---|---|
| Request `data` JSON | 8 fields | 30+ fields (all form fields) |
| Dedicated columns | Only `amount`, `currency`, `invoice_number` | + `supplier_name`, `import_type`, `country_of_origin`, `goods_description`, `port_of_entry`, `payment_terms`, `invoice_date`, `shipping_port` |
| Merchant details in data | Not included | `taxNumber`, `linkedCompany`, `commercialRegistration`, `owners` per merchant |
| Request #13 invoice | `INV-2026-10132` (unique) | `INV-2026-10022` (duplicate of #3, for duplicate warning testing) |
| `requestIdentifier` in data | Not included | `IMP-2026-XXXX` (so detail page title works) |
| Transition IDs in history | `$transitions` was undefined | Now properly looked up |

### 4. Also Fix: CR-14 (Route Model Binding)

The `seedRequests` changes won't help until CR-14 is fixed. `GET /requests/{request}` returns all nulls because the route param `{request}` doesn't match the controller parameter name `$requestModel`. See BACKEND-CHANGE-REQUESTS.md for the fix.

### 5. After Applying

```bash
php artisan migrate
php artisan db:seed --class=DemoDataSeeder
```

Then verify:
- `GET /requests` — all 16 requests with `supplier_name`, `import_type` populated
- `GET /requests/1` — (after CR-14 fix) full detail with all fields
- Request #13 and #3 share invoice `INV-2026-10022` — duplicate warning should trigger
