// ============================================================
// Shared query layer (spec §3.1, §3.2, §9). Defines the stable
// read/mutation contract types the UI sees, plus the QueryClient
// retry policy keyed on DomainError.kind.
// ============================================================

import { QueryClient } from "@tanstack/react-query";
import { isDomainError, type DomainError } from "./errors";

/** Async-shaped read result — identical for mock and live (spec §3.1). */
export interface ReadResult<T> {
  data: T | undefined;
  isLoading: boolean;
  error: DomainError | null;
  refetch: () => void;
}

/** Promise-based mutation handle; the Promise is the source of truth (spec §3.2). */
export interface MutationHandle<TInput, TResult = void> {
  mutate: (input: TInput) => Promise<TResult>;
  isPending: boolean;
  error: DomainError | null;
  reset: () => void;
}

/** Constant mock read: data is synchronous, never loading, never errors. */
export function mockRead<T>(data: T): ReadResult<T> {
  return { data, isLoading: false, error: null, refetch: () => {} };
}

/** Retry only transient network failures, once. Everything else is terminal. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (!isDomainError(error)) return false;
  if (error.kind !== "network") return false;
  return failureCount < 1;
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, staleTime: 30_000, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}
