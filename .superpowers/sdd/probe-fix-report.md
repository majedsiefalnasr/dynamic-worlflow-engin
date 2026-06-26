# Probe Fix Report — `scripts/ui-comparison/matrix.mjs`

## Method

Read every route source file referenced by the 15 failing probes and traced
the exact rendered button/trigger/label text against what the probes
actually fed into `page.getByRole("button", { name })` and
`page.getByLabel()` (see `scripts/ui-comparison/capture.mjs`'s
`runSetupAction`). Cross-checked the two working probes
(`wf-stages-add-empty`, `refdata-add-table-empty`) as the reference pattern:
both are **click-only** — no `fill`/`select` steps.

## Root cause found (systemic, not just typos)

Across nearly every admin/merchants dialog form, the `<Label>` element is a
plain sibling of the `<Input>`/`<Select>` it describes, with **no
`htmlFor`/`id` association** (verified in `src/components/ui/label.tsx`,
which wraps Radix's `LabelPrimitive.Root` — itself just `<label>` with no
auto-association logic, in
`node_modules/@radix-ui/react-label/dist/index.mjs`). Per WAI-ARIA / the
browser accessibility tree, an unassociated `<label>` does not name its
sibling control, so Playwright's `page.getByLabel(text)` **cannot find these
inputs no matter how exactly the label string matches the rendered text**.
This explains why the two working probes use only `click` steps — any probe
using `fill`/`select` against one of these unassociated labels is
structurally broken at the source level, not a wrong-string problem. I
flagged every such case below as "unverified" since no string change in
`matrix.mjs` can fix it; a real fix requires adding `htmlFor`/`id` in the
component source (out of scope — only `matrix.mjs` may be modified) or
changing `capture.mjs`'s `fill` handler to use a different locator strategy
(also out of scope).

A second systemic issue: `capture.mjs`'s `click` step does
`await btn.click()` with no actionability override, so clicking a
`disabled` submit button (the entire point of the `"submit-disabled"`
probes) will time out rather than resolve to "disabled". This is also a
`capture.mjs` limitation outside this file's scope, noted inline where
relevant.

## Per-probe fixes

### 1. `requests-new` (`src/routes/workflows.index.tsx`)
- Trigger `"طلب جديد"` was already correct (line 144/149).
- Root cause of failure: this button has **two different click handlers**
  depending on mode. In mock mode (`!requestsApi`, line 142-146) it calls
  `onCreate()` which does `toast.success("تم إنشاء طلب جديد")` (line 123) and
  navigates — matrix's expected text was already correct for this path.
  In API mode (`requestsApi`, line 147-150) the same-text button instead
  navigates to `/workflows/instances/new`, where submitting a new request
  requires selecting a real merchant name match
  (`workflows.instances.$id.tsx:371-372`) and clicking `"تقديم الطلب"`
  (line 392), which toasts `"تم إنشاء الطلب"` (line 383) — a different
  message via a different multi-step flow that depends on runtime merchant
  data.
- **Fix**: left the probe matching mock-mode semantics (text unchanged,
  already correct). **Unverified for API/live mode** — cannot be probed
  with a single click + static expected text from source alone; documented
  inline in the file.

### 2. `merchants-add-empty`, `merchants-add-valid` (`src/routes/merchants.tsx`)
- **Fixed**: submit button text was `"تسجيل"`, which does not exist anywhere
  as a button. The actual submit button is `"حفظ التاجر"` (line 892;
  `"تسجيل"` only appears in the dialog title `"تسجيل تاجر جديد"`, line 243,
  and in unrelated page copy/toasts).
- **Fixed**: labels `"اسم التاجر"` → `"اسم التاجر *"`, `"الرقم الضريبي"` →
  `"الرقم الضريبي *"`, `"تاريخ انتهاء البطاقة الضريبية"` →
  `"تاريخ انتهاء البطاقة الضريبية *"` to match the exact `*`-suffixed
  `Field()` labels at lines 683, 690, 693.
- **Unverified**: all `Field()`-wrapped labels (lines 899-906) have no
  `htmlFor`, so `getByLabel` cannot reach any of these inputs regardless of
  text. Additionally `"اسم الشركة"`/`"رقم السجل التجاري"` are placeholder
  text (lines 834, 862) on raw, unlabeled inputs inside the dynamic
  "الشركات المرتبطة" repeater, plus an unlabeled date input (line 866) —
  none of these are reachable via `getByLabel` at all. They are required
  for `valid` (lines 643-648 require at least one company row with
  name+cr+crExpiry) so could not be dropped from setup; left in place as the
  closest-correct selector, documented as unverified.

### 3. `wf-stages-add-valid`, `wf-actions-add-empty`, `wf-actions-add-valid` (`src/routes/admin.workflows.tsx`)
- **Fixed**: `wf-actions-add-empty`/`wf-actions-add-valid` used trigger
  `"إضافة إجراء"`, but the actual button text is `"إضافة"` (no suffix;
  lines 2062-2064).
- **Fixed**: `wf-stages-add-valid` expected toast `"تمت إضافة المرحلة"`,
  actual is `"تم إضافة المرحلة"` (line 434).
- **Fixed**: `wf-actions-add-valid` expected toast `"تمت إضافة الإجراء"`,
  actual is `"تم إضافة الإجراء"` (line 2027).
- **Unverified**: stage fields (`"رمز المرحلة"`/`"اسم المرحلة"`, lines
  489, 494) and action fields (`"رمز الإجراء"`/`"اسم الإجراء"`, lines
  2055, 2057) are `<Input placeholder>` text with **no `<Label>` at all**
  on either form — `getByLabel` cannot find them under any string.

### 4. `refdata-add-table-bad-key`, `refdata-add-table-valid` (`src/routes/admin.reference-data.tsx`)
- Strings `"المفتاح"`, `"اسم العرض"`, `"إضافة جدول"` already matched source
  exactly (lines 170, 179, 188) — no string change needed.
- **Unverified**: `"المفتاح"`/`"اسم العرض"` are unassociated `<Label>`
  siblings (lines 170, 179) — same systemic issue, `getByLabel` cannot find
  them regardless of correct text. Left as-is; this is as close to correct
  as source alone permits.

### 5. `entities-add-empty`, `entities-add-valid` (`src/routes/admin.entities.tsx`)
- Trigger `"بنك جديد"` (line 187) and submit `"إضافة"` (line 475) already
  matched source exactly.
- `entities-add-empty` is click-only (matches the working-probe pattern) —
  should function correctly, except `capture.mjs`'s `.click()` on a
  disabled button will time out (capture.mjs limitation, noted inline).
- **Fixed**: `"اسم البنك"` → `"اسم البنك *"` to match line 394 exactly.
- **Unverified**: both `"اسم البنك *"`/`"رقم الترخيص"` are unassociated
  `<Label>` siblings (lines 394, 398).

### 6. `orgs-add-empty`, `orgs-add-valid` (`src/routes/admin.orgs.tsx`)
- Trigger `"جهة جديدة"` (line 247) and submit `"إضافة الجهة"` (line 496)
  already matched source exactly.
- **Fixed**: `"اسم الجهة"` → `"اسم الجهة *"` to match line 457 exactly.
- **Unverified**: unassociated `<Label>` sibling (line 457), same issue.

### 7. `staff-add-bad-email` (`src/routes/admin.staff.tsx`)
- Trigger `"مستخدم جديد"` and labels `"الاسم *"`/`"البريد الإلكتروني *"`
  already matched source exactly (lines 764, 768) — no string change
  needed.
- **Unverified**: unassociated `<Label>` siblings, same systemic issue.
  Left as-is.

### 8. `teams-add-empty`, `teams-add-valid` (`src/routes/admin.teams.tsx`)
- Trigger `"فريق جديد"` (line 252) and submit `"إضافة الفريق"` (line 544)
  already matched source exactly.
- **Fixed**: `"اسم الفريق"` → `"اسم الفريق *"` and `"الجهة"` → `"الجهة *"`
  to match lines 519, 527 exactly.
- **Unverified**: both are unassociated `<Label>` siblings, same issue for
  both the text `fill` and the `select` (Select trigger has no `aria-label`
  set anywhere — verified in `src/components/ui/select.tsx`).

### 9. `roles-add-empty`, `roles-add-valid` (`src/routes/admin.roles.tsx`)
- Trigger `"دور جديد"` (line 204) and submit `"إضافة الدور"` (line 440)
  already matched source exactly.
- **Fixed**: `"اسم الدور"` → `"اسم الدور *"` and `"الجهة"` → `"الجهة *"`
  to match lines 415, 423 exactly.
- **Unverified**: same unassociated-`<Label>` issue as teams above.

## Summary

| Probe | Fixed string(s) | Status |
|---|---|---|
| requests-new | none (already correct for mock mode) | unverified for API mode |
| merchants-add-empty | submit button "تسجيل" → "حفظ التاجر" | should pass (click-only), modulo capture.mjs disabled-click limitation |
| merchants-add-valid | submit button + 3 labels `*` suffix | unverified (unlabeled inputs) |
| wf-stages-add-valid | toast text | unverified (no `<Label>` on form) |
| wf-actions-add-empty | submit button "إضافة إجراء" → "إضافة" | should pass (click-only) |
| wf-actions-add-valid | submit button + toast text | unverified (no `<Label>` on form) |
| refdata-add-table-bad-key | none (already correct) | unverified (unlabeled inputs) |
| refdata-add-table-valid | none (already correct) | unverified (unlabeled inputs) |
| entities-add-empty | none (already correct) | should pass (click-only), modulo capture.mjs disabled-click limitation |
| entities-add-valid | label `*` suffix | unverified (unlabeled inputs) |
| orgs-add-empty | none (already correct) | should pass (click-only), modulo capture.mjs disabled-click limitation |
| orgs-add-valid | label `*` suffix | unverified (unlabeled inputs) |
| staff-add-bad-email | none (already correct) | unverified (unlabeled inputs) |
| teams-add-empty | none (already correct) | should pass (click-only), modulo capture.mjs disabled-click limitation |
| teams-add-valid | 2 labels `*` suffix | unverified (unlabeled inputs/select) |
| roles-add-empty | none (already correct) | should pass (click-only), modulo capture.mjs disabled-click limitation |
| roles-add-valid | 2 labels `*` suffix | unverified (unlabeled inputs/select) |
