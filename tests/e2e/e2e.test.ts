import { Server } from "http";
import request from "supertest";
import { app } from "../../src";
import { createClient } from "@supabase/supabase-js";
import nock from "nock";

// Mock Supabase client
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      insert: jest.fn().mockResolvedValue({ data: null, error: null }),
      update: jest.fn().mockResolvedValue({ data: null, error: null }),
      select: jest.fn().mockResolvedValue({ data: [], error: null }),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  })),
}));

// Mock BullMQ
jest.mock("bullmq", () => {
  const mockQueue = {
    add: jest.fn().mockResolvedValue({ id: "mock-job-id" }),
    getJob: jest.fn(),
    getJobs: jest.fn().mockResolvedValue([]),
    getWaitingCount: jest.fn().mockResolvedValue(0),
    getActiveCount: jest.fn().mockResolvedValue(0),
    getCompletedCount: jest.fn().mockResolvedValue(0),
    getFailedCount: jest.fn().mockResolvedValue(0),
    on: jest.fn(),
    off: jest.fn(),
    close: jest.fn(),
  };

  const mockWorker = {
    on: jest.fn(),
    off: jest.fn(),
    close: jest.fn(),
  };

  return {
    Queue: jest.fn(() => mockQueue),
    Worker: jest.fn(function () {
      return mockWorker;
    }),
  };
});

// Mock the worker initialization
jest.mock("../../src/workers/bullWorkers", () => ({
  default: jest.fn(),
}));

describe("Crawler E2E Tests", () => {
  let server: Server;

  beforeAll(() => {
    server = app.listen(0);
    nock.disableNetConnect();
    nock.enableNetConnect("127.0.0.1");
  });

  afterAll((done) => {
    server.close(done);
    nock.enableNetConnect();
  });

  beforeEach(() => {
    nock.cleanAll();
    jest.clearAllMocks();
  });

  describe("POST /api/crawl", () => {
    it("should start a new crawl job", async () => {
      const response = await request(app).post("/api/crawl").send({
        startUrl: "https://example.com",
        maxDepth: 2,
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("jobId");
      expect(response.body).toHaveProperty("message", "Crawl job started");
    });

    it("should reject invalid URLs", async () => {
      const response = await request(app).post("/api/crawl").send({
        startUrl: "not-a-url",
        maxDepth: 2,
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error", "Invalid start URL");
    });
  });

  describe("GET /api/crawl/:jobId", () => {
    it("should return job status", async () => {
      const mockJob = {
        id: "test-job-id",
        status: "active",
        start_url: "https://example.com",
        created_at: new Date().toISOString(),
      };

      const mockSupabase = createClient as jest.MockedFunction<typeof createClient>;
      mockSupabase.mockImplementation(
        () =>
          ({
            from: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({ data: mockJob, error: null }),
              }),
            }),
            rpc: jest.fn(),
          } as any)
      );

      const response = await request(app).get(`/api/crawl/${mockJob.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("databaseJob");
      expect(response.body).toHaveProperty("queueInfo");
      expect(response.body.databaseJob).toEqual(mockJob);
    });
  });
});
