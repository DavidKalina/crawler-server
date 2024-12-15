// tests/unit/contentExtractor.test.ts
import { CheerioAPI, load } from "cheerio";
import { ContentExtractor } from "../../src/classes/ContentExtractor";

describe("ContentExtractor", () => {
  let cheerio: CheerioAPI;

  beforeEach(() => {
    const html = `
      <html>
        <head><title>Test Page</title></head>
        <body>
          <h1>Main Heading</h1>
          <p>Test paragraph</p>
          <ul>
            <li>List item 1</li>
            <li>List item 2</li>
          </ul>
          <a href="https://example.com">Test Link</a>
        </body>
      </html>
    `;
    cheerio = load(html);
  });

  it("should extract content correctly", () => {
    const extractor = new ContentExtractor(cheerio, "https://test.com");
    const content = extractor.extract();

    expect(content).toHaveProperty("rawText");
    expect(content).toHaveProperty("structuredContent");
    expect(content.structuredContent.title).toBe("Test Page");
    expect(content.structuredContent.headings).toHaveLength(1);
    expect(content.structuredContent.paragraphs).toHaveLength(1);
    expect(content.structuredContent.lists).toHaveLength(1);
    expect(content.structuredContent.links).toHaveLength(1);
  });
});
