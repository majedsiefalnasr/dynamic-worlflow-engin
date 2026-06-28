# Deferred: Remove rc_platform_admin ScreenGuard bypass

**Status:** Waiting on backend
**Added:** 2026-06-28
**File:** `src/components/workflow/ScreenGuard.tsx`

## Problem

The `/auth/login` and `/auth/me` endpoints return an empty `screen_permissions` array for the platform admin user:

```json
{
  "screen_permissions": []
}
```

This causes `ScreenGuard` to block all guarded screens (workflows, merchants, reports, audit) for the admin role in live mode.

## Temporary workaround

A client-side bypass was added: if `user.roleId === "rc_platform_admin"`, skip the `screenPermissions` check entirely. This mirrors the mock-mode behavior in `manualScreenCan()` (`governance.ts:641`).

## What backend needs to do

Populate `screen_permissions` in the login/me response for all roles, including platform admin. Expected shape per screen:

```json
{
  "screen_permissions": [
    { "screen": "requests", "capabilities": ["view", "add"] },
    { "screen": "merchants", "capabilities": ["view"] },
    { "screen": "reports", "capabilities": ["view"] },
    { "screen": "audit", "capabilities": ["view"] }
  ]
}
```

For platform admin, all screens with all capabilities should be included.

## Frontend cleanup once backend is fixed

1. Remove the `user.roleId === "rc_platform_admin"` bypass in `ScreenGuard.tsx`.
2. Remove the TODO comment above it.
3. Verify all 4 guarded screens render correctly for admin without the bypass.
