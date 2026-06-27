# Required UI / UX / Functionality Changes — Review Before Implementation

Each entry is a UI/UX/functionality change that turns out to be **required** to
support the live backend. **Nothing here is implemented until explicitly approved.**
Implementation of anything needing no UI change proceeds immediately (spec §8).

| # | Screen | Change | Why | Approval |
|---|--------|--------|-----|----------|
| UC-01 | login | Live mode: real email/password form replaces demo-user picker; OTP step stays as decorative placeholder | Demo picker cannot work against real backend; real credentials required | Approved (brainstorming) |
| UC-02 | AppShell | RoleSwitcher hidden when live API base URL is set | Demo-only feature; switching users against live backend not meaningful | Approved (brainstorming) |

## reference-data (template resource)
No UI change required. Reads + create + deactivate map cleanly to the existing
screen. Loading state reuses the existing layout; errors reuse the existing toast.
