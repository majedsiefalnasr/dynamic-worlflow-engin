# Backend Handoff — Gaps, Mismatches & Requests

Backend dependencies discovered while wiring the live API. Tracked independently;
does not block unrelated front-end work (spec §8). Snippets reference the read-only
`backend/` clone where useful.

## Open items

| # | Resource | Type | Detail | Evidence |
|---|----------|------|--------|----------|
| BH-01 | status-toggle | infra | `POST /{resource}/{id}/activate\|deactivate\|suspend` return 406 from ModSecurity on real records. Front-end uses `PATCH {is_active}` where it works; merchants has no workaround → toggle rejects with `DomainError{kind:"blocked"}`. | See project memory `waf-blocks-status-toggle`. |
| BH-02 | workflows | missing endpoints | No workflow authoring write endpoints. Authoring mutations reject with `kind:"blocked"`; read path wires to the published workflow. | Audit on `live` branch. |
| BH-03 | teams | missing field | `TeamResource` has no `role_code` field. Frontend mock data assumes a 1:1 team→role mapping (`roleCode` on `TeamRecord`). In live mode this field is `undefined`. If team→role mapping is needed for user assignment forms, backend should add `role_code` to `TeamResource` or expose a team-role mapping endpoint. | `backend/app/Http/Resources/TeamResource.php` — no role field in toArray(). |
| BH-04 | users | missing field | `UserResource` has no `phone` field. Profile screen shows phone number from mock data. If phone display is needed, backend should add `phone` to the `UserResource` toArray. | `backend/app/Http/Resources/UserResource.php` — phone not included. |

## reference-data
No backend gap. `GET /reference-tables` nests `values`; create + `PATCH is_active`
deactivate confirmed against the live host.
