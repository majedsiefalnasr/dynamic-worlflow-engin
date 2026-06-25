# Request Runtime (Live API) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire request creation, detail view, draft saving, action execution, and history to the live backend API, replacing the `wfStore`-based mock runtime — the final PM priority (#5: "إنشاء الطلب.. والسير بمراحله").

**Architecture:** Same controller-hook pattern as every other migrated screen: `isApiEnabled("requests")` gates a live React Query path vs the existing `wfStore` mock path. The `src/lib/api/requests.ts` client gets extended with mutations (create, draft, action) and detail/history queries. The `workflows.instances.$id.tsx` detail page gets a `useRequestDetailController()` that branches between live API calls and the current `wfStore` functions. A create-request dialog/flow is added to the list page. E2e tests verify the full flow via playwright-cli.

**Tech Stack:** React 19, TanStack Router/Query, Vite, TypeScript, playwright-cli for e2e.

## Global Constraints

- Never edit `backend/` — read-only clone for inspection.
- `isApiEnabled("requests")` gate on every live path; mock path stays byte-for-byte identical.
- Token in `sessionStorage` (`client.ts`), restored via `GET /auth/me` on reload.
- `tsc --noEmit` must pass after every task.
- E2e tests required before marking the plan done — use `playwright-cli` (not Playwright MCP).
- CR-06 still open: list resource missing `current_stage`/`merchant`/`workflow_version_id` + `reference_number` column name bug. The plan handles this gracefully (empty columns, no crash). When CR-06 ships, the list auto-populates without frontend changes.

## Backend endpoint contracts (confirmed from code)

| Endpoint | Method | Required fields | Returns |
|---|---|---|---|
| `/requests` | POST | `workflow_version_id`, `bank_id`, `merchant_id`, `amount?`, `currency?`, `invoice_number?`, `data?` | `ImportRequestResource` (detail) |
| `/requests/{id}` | GET | — | `ImportRequestResource` with `bank`, `merchant`, `currentStage.permissions`, `creator`, `documents.uploader`, `history` |
| `/requests/{id}/draft` | PATCH | `version`, `data?`, `amount?`, `currency?`, `invoice_number?` | `ImportRequestResource` |
| `/requests/{id}/actions` | POST | `transition_id`, `version`, `comment?`, `data?` | `ImportRequestResource` |
| `/requests/{id}/history` | GET | — | `WorkflowHistory[]` (raw model: `request_id`, `from_stage_id`, `to_stage_id`, `action_id`, `transition_id`, `performed_by`, `comment`, `data_snapshot`, `audit_log_id`, `created_at`) |
| `/requests/{id}/documents` | POST | `file` (multipart), `field_id?` | `DocumentResource` |

---

### Task 1: Extend `requests.ts` with mutations and detail queries

**Files:**
- Modify: `src/lib/api/requests.ts`

**Interfaces:**
- Consumes: `api` from `./client` (get, post, patch), `WorkflowInstance`/`WorkflowHistory` types from `@/lib/workflow-engine`
- Produces: `useRequestDetailQuery(id, enabled)`, `useRequestHistoryQuery(id, enabled)`, `useRequestMutations()` returning `{ create, saveDraft, executeAction }`

- [ ] **Step 1: Add detail DTO and query**

Add to `src/lib/api/requests.ts` after the existing `useWorkflowStagesQuery`:

```typescript
interface RequestDetailDto extends RequestDto {
  merchant?: { id: number; name: string; commercial_register?: string } | null;
  goods_description?: string | null;
  port_of_entry?: string | null;
  notes?: string | null;
  payment_terms?: string | null;
  expected_arrival_date?: string | null;
  country_of_origin?: string | null;
  invoice_date?: string | null;
  shipping_port?: string | null;
  bill_of_lading_number?: string | null;
  version?: number;
  documents?: {
    id: number;
    type?: string;
    original_filename?: string;
    mime_type?: string;
    size_bytes?: number;
    uploaded_by?: number;
    uploaded_by_name?: string | null;
    uploaded_at?: string;
    download_url?: string;
  }[];
}

function toDetailInstance(d: RequestDetailDto): WorkflowInstance & { _version: number; _merchantName: string } {
  const base = toInstance(d);
  if (d.merchant?.name && !base.data.importerName) base.data.importerName = d.merchant.name;
  return {
    ...base,
    _version: d.version ?? 0,
    _merchantName: d.merchant?.name ?? "",
  };
}

export function useRequestDetailQuery(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["requests", "detail", id],
    enabled: enabled && !!id,
    queryFn: ({ signal }) =>
      api.get<RequestDetailDto>(`/requests/${id}`, undefined, signal).then(toDetailInstance),
  });
}
```

- [ ] **Step 2: Add history DTO and query**

```typescript
interface HistoryDto {
  id?: number;
  request_id: number;
  from_stage_id: number | null;
  to_stage_id: number | null;
  action_id?: number | null;
  transition_id?: number | null;
  performed_by: number;
  comment?: string | null;
  data_snapshot?: Record<string, unknown> | null;
  created_at?: string;
}

function toHistory(d: HistoryDto): WorkflowHistory {
  return {
    id: String(d.id ?? d.request_id),
    workflowInstanceId: String(d.request_id),
    fromStageId: d.from_stage_id != null ? String(d.from_stage_id) : null,
    toStageId: String(d.to_stage_id ?? ""),
    actionCode: String(d.action_id ?? ""),
    actionName: "",
    performedBy: String(d.performed_by),
    comments: d.comment ?? undefined,
    timestamp: d.created_at ?? "",
  };
}

export function useRequestHistoryQuery(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["requests", "history", id],
    enabled: enabled && !!id,
    queryFn: ({ signal }) =>
      api.get<HistoryDto[]>(`/requests/${id}/history`, undefined, signal)
        .then((arr) => (Array.isArray(arr) ? arr : []).map(toHistory)),
  });
}
```

- [ ] **Step 3: Add mutations (create, draft, action)**

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Add useQueryClient import at top, add useMutation to existing import

export function useRequestMutations() {
  const qc = useQueryClient();
  const invalidateList = () => qc.invalidateQueries({ queryKey: ["requests"] });
  return {
    create: useMutation({
      mutationFn: (input: {
        workflowVersionId: number;
        bankId: number;
        merchantId: number;
        amount?: number;
        currency?: string;
        invoiceNumber?: string;
        data?: Record<string, unknown>;
      }) =>
        api.post<RequestDetailDto>("/requests", {
          workflow_version_id: input.workflowVersionId,
          bank_id: input.bankId,
          merchant_id: input.merchantId,
          amount: input.amount,
          currency: input.currency,
          invoice_number: input.invoiceNumber,
          data: input.data,
        }),
      onSuccess: invalidateList,
    }),
    saveDraft: useMutation({
      mutationFn: (input: {
        id: string;
        version: number;
        data?: Record<string, unknown>;
        amount?: number;
        currency?: string;
        invoiceNumber?: string;
      }) =>
        api.patch(`/requests/${input.id}/draft`, {
          version: input.version,
          data: input.data,
          amount: input.amount,
          currency: input.currency,
          invoice_number: input.invoiceNumber,
        }),
      onSuccess: invalidateList,
    }),
    executeAction: useMutation({
      mutationFn: (input: {
        id: string;
        transitionId: number;
        version: number;
        comment?: string;
        data?: Record<string, unknown>;
      }) =>
        api.post(`/requests/${input.id}/actions`, {
          transition_id: input.transitionId,
          version: input.version,
          comment: input.comment,
          data: input.data,
        }),
      onSuccess: invalidateList,
    }),
  };
}
```

- [ ] **Step 4: Update the import at the top**

Change:
```typescript
import { useQuery } from "@tanstack/react-query";
```
to:
```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/api/requests.ts
git commit -m "feat(api): add request detail/history queries and create/draft/action mutations"
```

---

### Task 2: Wire `workflows.instances.$id.tsx` with live API controller

**Files:**
- Modify: `src/routes/workflows.instances.$id.tsx`

**Interfaces:**
- Consumes: `useRequestDetailQuery`, `useRequestHistoryQuery`, `useRequestMutations` from `src/lib/api/requests.ts` (Task 1); `isApiEnabled` from `@/lib/api/client`; all existing `wfStore` imports stay for mock path.
- Produces: nothing new consumed elsewhere — this is a leaf screen.

- [ ] **Step 1: Add live-path imports**

Add alongside existing imports at the top:

```typescript
import { isApiEnabled, ApiError } from "@/lib/api/client";
import { useRequestDetailQuery, useRequestHistoryQuery, useRequestMutations } from "@/lib/api/requests";
```

- [ ] **Step 2: Branch the data source in `InstancePage()`**

The current component reads everything from `wfStore`. For the live path, we read the request from `useRequestDetailQuery` and history from `useRequestHistoryQuery`. The workflow config (stages, transitions, field definitions, etc.) stays from `wfStore` since the workflow designer already syncs it there from the API.

After `const { id } = Route.useParams();` add:

```typescript
const requestsApi = isApiEnabled("requests");
const detailQuery = useRequestDetailQuery(id, requestsApi);
const historyQuery = useRequestHistoryQuery(id, requestsApi);
const mutations = useRequestMutations();
```

Then branch the instance source:

```typescript
// Live path: instance from API detail query
// Mock path: instance from wfStore (existing behavior)
const instance = requestsApi
  ? (detailQuery.data ? { ...detailQuery.data } : undefined)
  : instances.find((i) => i.id === id);
```

- [ ] **Step 3: Branch the history source**

Replace `const history = getInstanceHistory(instance.id);` with:

```typescript
const history = requestsApi
  ? (historyQuery.data ?? [])
  : getInstanceHistory(instance?.id ?? "");
```

- [ ] **Step 4: Branch the action handler**

Replace `onAction` to call the live API when enabled:

```typescript
const onAction = async (transitionId: string, actionName: string) => {
  if (!user) return toast.error("اختر مستخدمًا");
  if (requestsApi && instance) {
    try {
      await mutations.executeAction.mutateAsync({
        id: instance.id,
        transitionId: Number(transitionId),
        version: (instance as { _version?: number })._version ?? 0,
        comment: comments || undefined,
        data: draftData,
      });
      toast.success(`تم تنفيذ: ${actionName}`);
      setComments("");
      detailQuery.refetch();
      historyQuery.refetch();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "تعذّر تنفيذ الإجراء");
    }
    return;
  }
  // Mock path (existing)
  const res = applyAction({ instanceId: instance!.id, transitionId, user, comments, data: draftData });
  if (!res.ok) return toast.error(res.error);
  toast.success(`تم تنفيذ: ${actionName}`);
  setComments("");
};
```

- [ ] **Step 5: Branch the draft save handler**

Replace `onSaveDraft` similarly:

```typescript
const onSaveDraft = async () => {
  if (!user || !instance) return;
  if (requestsApi) {
    try {
      await mutations.saveDraft.mutateAsync({
        id: instance.id,
        version: (instance as { _version?: number })._version ?? 0,
        data: draftData,
      });
      toast.success("تم حفظ المسودة");
      detailQuery.refetch();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "تعذّر حفظ المسودة");
    }
    return;
  }
  // Mock path (existing)
  saveDraftData(instance.id, draftData, user);
  toast.success("تم حفظ المسودة");
};
```

- [ ] **Step 6: Add loading/error states for live path**

Before the `if (!instance)` check, add loading and error handling for the live path:

```typescript
if (requestsApi && detailQuery.isLoading) {
  return (
    <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
      جارٍ تحميل الطلب…
    </div>
  );
}

if (requestsApi && detailQuery.error) {
  return (
    <div>
      <PageHeader title="خطأ" actions={<Link to="/workflows"><Button variant="outline">رجوع</Button></Link>} />
      <Card className="p-6 text-center">
        <p className="text-sm text-muted-foreground">
          {detailQuery.error instanceof ApiError ? detailQuery.error.message : "تعذّر تحميل الطلب"}
        </p>
        <Button variant="outline" size="sm" onClick={() => detailQuery.refetch()} className="mt-4">
          إعادة المحاولة
        </Button>
      </Card>
    </div>
  );
}
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors

- [ ] **Step 8: Commit**

```bash
git add src/routes/workflows.instances.$id.tsx
git commit -m "feat(requests): wire detail/actions/draft to live API via controller branch"
```

---

### Task 3: Add request creation flow to the list page

**Files:**
- Modify: `src/routes/workflows.index.tsx` (add a "create request" dialog with merchant/bank/workflow-version pickers)

**Interfaces:**
- Consumes: `useRequestMutations` from `src/lib/api/requests.ts` (Task 1); `useMerchantsQuery` from `src/lib/api/merchants.ts`; `useBanksQuery` from `src/lib/api/banks.ts`; `isApiEnabled` from `@/lib/api/client`
- Produces: nothing new — the dialog creates a request and navigates to its detail page.

- [ ] **Step 1: Read the current `workflows.index.tsx`**

Read the full file first to understand the existing structure before modifying it. The list page already branches live vs mock for the request list. The mock path has a "create" flow via `createInstance()` from `wfStore`. The live path needs a dialog that collects `bank_id`, `merchant_id`, `workflow_version_id`, then calls `mutations.create.mutateAsync()`.

- [ ] **Step 2: Add the create dialog for the live path**

Add a `CreateRequestDialog` component below the main component. It needs:
- Workflow version selector (from the synced `wfStore` — the published version is already there)
- Bank selector (from `useBanksQuery`)
- Merchant selector (from `useMerchantsQuery`, filtered by selected bank)
- Basic financial fields: amount, currency, invoice number
- On submit: call `mutations.create.mutateAsync()`, then navigate to the new request's detail page

The existing mock path's create button already works via `createInstance()` — keep that. Add the live create dialog gated on `requestsApi`.

- [ ] **Step 3: Wire the create button**

In the live path, the "إنشاء طلب جديد" button opens the dialog instead of calling `createInstance()`.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors

- [ ] **Step 5: Commit**

```bash
git add src/routes/workflows.index.tsx
git commit -m "feat(requests): add live request creation dialog with bank/merchant/version pickers"
```

---

### Task 4: E2e tests with playwright-cli

**Files:**
- No new files — tests run interactively via `playwright-cli` commands, verified inline.

**Interfaces:**
- Consumes: the running dev server at `http://localhost:8081` (or whichever port Vite uses)

**Test plan:**

- [ ] **Step 1: Login and navigate to requests list**

```bash
playwright-cli open http://localhost:8081
# Login as admin
playwright-cli fill "getByRole('textbox', { name: 'كلمة المرور' })" "Password@123" --submit
# Navigate to requests
playwright-cli click "getByRole('link', { name: 'الطلبات' })"
playwright-cli screenshot --filename=e2e-requests-list.png
```

Verify: requests list shows rows from API, stage column shows "—" (CR-06 still open), no console errors.

- [ ] **Step 2: Open a request detail**

```bash
# Click on the first request row
playwright-cli click "getByRole('row').first()"
playwright-cli screenshot --filename=e2e-request-detail.png
```

Verify: detail page shows request data, stage banner, action buttons (if executor), history section.

- [ ] **Step 3: Test draft save**

```bash
# If the form is editable, modify a field and save draft
playwright-cli click "getByRole('button', { name: 'حفظ المسودة' })"
```

Verify: toast "تم حفظ المسودة" appears, no error.

- [ ] **Step 4: Test action execution**

```bash
# Execute an available action
playwright-cli click "getByRole('button', { name: /.*/ })"  # first action button
```

Verify: toast "تم تنفيذ" appears, page refreshes with new stage.

- [ ] **Step 5: Test request creation (if create dialog wired)**

```bash
playwright-cli click "getByRole('link', { name: 'الطلبات' })"
playwright-cli click "getByRole('button', { name: 'إنشاء طلب جديد' })"
# Fill the create form
# Select bank, merchant, etc.
playwright-cli click "getByRole('button', { name: 'إنشاء' })"
```

Verify: new request created, navigated to detail page, toast success.

- [ ] **Step 6: Verify session persistence**

```bash
playwright-cli reload
playwright-cli screenshot --filename=e2e-after-reload.png
```

Verify: still on the same page, not redirected to login.

---

## Out of scope

- **CR-06 fix** (backend) — list enrichment with `current_stage`/`merchant`/`workflow_version_id`. The frontend handles its absence gracefully (shows "—"). When CR-06 ships, the list auto-populates.
- **Document upload UI** — the backend supports `POST /requests/{id}/documents` but the current frontend has no file-upload component in the request detail. This is a follow-up.
- **Workflow designer authoring** (CR-01) — stays read-only.
- **Non-admin role testing** — blocked on CR-11/CR-12 (permission seeding).
