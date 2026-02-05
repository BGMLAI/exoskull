import "@testing-library/jest-dom";

// Suppress console.log in tests, keep errors
const originalConsole = { ...console };
beforeAll(() => {
  console.log = vi.fn();
  console.debug = vi.fn();
});
afterAll(() => {
  console.log = originalConsole.log;
  console.debug = originalConsole.debug;
});

// Mock environment variables
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
process.env.CRON_SECRET = "test-cron-secret";
