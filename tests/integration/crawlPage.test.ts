// tests/integration/crawlJob.test.ts

import nock from "nock";
import { crawlPage } from "../../src/utils/crawlPage";

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      insert: jest.fn().mockResolvedValue({ data: null, error: null }),
      update: jest.fn().mockResolvedValue({ data: null, error: null }),
      select: jest.fn().mockResolvedValue({ data: [], error: null }),
    })),
  })),
}));
describe("Crawl Job Integration", () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  it("should crawl a page and extract content", async () => {
    const testUrl = "https://test.example.com";
    const testHtml = `
      <html>
        <head><title>Test Page</title></head>
        <body>
          <h1>Test Content</h1>
          <p>Test paragraph</p>
          <a href="https://test.example.com/page2">Link</a>
        </body>
      </html>
    `;

    // Mock the HTTP request
    nock("https://test.example.com")
      .get("/")
      .reply(200, testHtml)
      .get("/robots.txt")
      .reply(200, "User-agent: *\nAllow: /");

    const result = await crawlPage({
      id: "test-job",
      url: testUrl,
      maxDepth: 2,
      currentDepth: 0,
    });

    expect(result).toHaveProperty("url", testUrl);
    expect(result).toHaveProperty("title", "Test Page");
    expect(result.links).toHaveLength(1);
    expect(result.extractedContent.structuredContent.headings).toHaveLength(1);
  });

  it("should handle robots.txt restrictions", async () => {
    const testUrl = "https://test.example.com";

    nock("https://test.example.com").get("/robots.txt").reply(200, "User-agent: *\nDisallow: /");

    await expect(
      crawlPage({
        id: "test-job",
        url: testUrl,
        maxDepth: 2,
        currentDepth: 0,
      })
    ).resolves.toEqual({
      content: null,
      depth: 0,
      extractedContent: {
        rawText: "",
        structuredContent: {
          headings: [],
          links: [],
          lists: [],
          paragraphs: [],
          tables: [],
          title: null,
        },
      },
      links: [],
      title: null,
      url: "https://test.example.com",
    });
  });
});
