/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend API base URL, e.g. /api/v1 (via dev proxy) or full origin. Empty = use local mock data. */
  readonly VITE_API_BASE_URL?: string;
  /** Comma list of resource keys to route to the live backend, or `*` for all. Empty = all screens stay on mock. */
  readonly VITE_API_RESOURCES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
