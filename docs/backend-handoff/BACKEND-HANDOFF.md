# Backend Handoff — Gaps, Mismatches & Requests

Backend dependencies discovered while wiring the live API. Tracked independently;
does not block unrelated front-end work (spec §8). Snippets reference the read-only
`backend/` clone where useful.

## Open items

| # | Resource | Type | Detail | Evidence |
|---|----------|------|--------|----------|
| BH-01 | status-toggle | infra | `POST /{resource}/{id}/activate\|deactivate\|suspend` return 406 from ModSecurity on real records. Front-end uses `PATCH {is_active}` where it works; merchants has no workaround → toggle rejects with `DomainError{kind:"blocked"}`. | See project memory `waf-blocks-status-toggle`. |
| BH-02 | workflows | missing endpoints | No workflow authoring write endpoints. Authoring mutations reject with `kind:"blocked"`; read path wires to the published workflow. | Audit on `live` branch. |

## reference-data
No backend gap. `GET /reference-tables` nests `values`; create + `PATCH is_active`
deactivate confirmed against the live host.
