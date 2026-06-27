# Required UI / UX / Functionality Changes — Review Before Implementation

Each entry is a UI/UX/functionality change that turns out to be **required** to
support the live backend. **Nothing here is implemented until explicitly approved.**
Implementation of anything needing no UI change proceeds immediately (spec §8).

| # | Screen | Change | Why it's unavoidable | Smallest change | Status |
|---|--------|--------|----------------------|-----------------|--------|
| — | — | (none yet) | — | — | — |

## reference-data (template resource)
No UI change required. Reads + create + deactivate map cleanly to the existing
screen. Loading state reuses the existing layout; errors reuse the existing toast.
