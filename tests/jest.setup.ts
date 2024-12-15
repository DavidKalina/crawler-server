// tests/setup.ts
import "@jest/globals";

// Set up environment variables for testing
process.env.NODE_ENV = "test";
process.env.REDIS_HOST = "localhost";
process.env.REDIS_PORT = "6379";
process.env.SUPABASE_URL = "your_test_supabase_url";
process.env.SUPABASE_KEY = "your_test_supabase_key";

// Reset mocks before each test
beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
});

// Global test timeout (optional - adjust as needed)
jest.setTimeout(30000); // 30 seconds

// Silence console logs during tests (optional)
global.console = {
  ...console,
  // Uncomment these to disable specific console methods during tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Handle unhandled promise rejections
process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection in tests:", error);
});

// Clean up any test data after all tests complete
afterAll(async () => {
  // Add any cleanup code here if needed
  // For example, clearing test database entries or redis queue
});
