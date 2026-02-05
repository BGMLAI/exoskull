/**
 * Supabase Client Mock
 *
 * Provides a chainable mock that mimics Supabase query builder pattern.
 */

import { vi } from "vitest";

export function createMockSupabaseClient(overrides?: Record<string, unknown>) {
  const mockData: Record<string, unknown[]> = {};

  const chainable = () => {
    const chain: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    // Make the chain itself resolve as a promise
    Object.defineProperty(chain, "then", {
      value: (resolve: (v: unknown) => void) =>
        resolve({ data: [], error: null }),
    });
    return chain;
  };

  const client = {
    from: vi.fn().mockImplementation((table: string) => {
      const chain = chainable();
      // If mock data was set for this table, return it
      if (mockData[table]) {
        (chain.select as ReturnType<typeof vi.fn>).mockReturnValue({
          ...chain,
          then: (resolve: (v: unknown) => void) =>
            resolve({ data: mockData[table], error: null }),
        });
      }
      return chain;
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "test-user-id", email: "test@example.com" } },
        error: null,
      }),
      signInWithPassword: vi.fn().mockResolvedValue({
        data: { user: { id: "test-user-id" }, session: {} },
        error: null,
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi
          .fn()
          .mockResolvedValue({ data: { path: "test" }, error: null }),
        download: vi.fn().mockResolvedValue({ data: new Blob(), error: null }),
        getPublicUrl: vi
          .fn()
          .mockReturnValue({ data: { publicUrl: "https://test.com/file" } }),
      }),
    },
    // Helper to set mock data for tests
    __setMockData: (table: string, data: unknown[]) => {
      mockData[table] = data;
    },
    ...overrides,
  };

  return client;
}

// Mock the createClient import
export const mockCreateClient = vi
  .fn()
  .mockImplementation(() => createMockSupabaseClient());
