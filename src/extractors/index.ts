import { CheerioAPI } from "cheerio";

// extractors/BaseExtractor.ts
export abstract class BaseExtractor {
  protected $: CheerioAPI;

  constructor(cheerioInstance: CheerioAPI) {
    this.$ = cheerioInstance;
  }

  abstract extract(base: string): any;

  protected sanitizeText(text: string): string {
    return text
      .replace(/\s+/g, " ")
      .replace(/[\n\r\t]/g, " ")
      .trim();
  }
}
