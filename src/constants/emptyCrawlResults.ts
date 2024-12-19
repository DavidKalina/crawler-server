import { CrawlResult } from "src";

export const EMPTY_CRAWL_RESULT: CrawlResult = {
  url: "",
  title: null,
  content: null,
  extractedContent: {
    rawText: "",
    structuredContent: {
      title: null,
      headings: [],
      paragraphs: [],
      lists: [],
      tables: [],
      links: [],
    },
  },
  links: [],
  depth: 0,
};
