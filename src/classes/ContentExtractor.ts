import { CheerioAPI } from "cheerio";
import { RawTextExtractor } from "../extractors/RawTextExtractor";
import { StructuredContentExtractor } from "../extractors/StructuredContentExtractor";
import { ExtractedContent } from "../types/contentTypes";

// ContentExtractor.ts
export class ContentExtractor {
  private readonly base: string;
  private readonly rawTextExtractor: RawTextExtractor;
  private readonly structuredContentExtractor: StructuredContentExtractor;

  constructor(cheerioInstance: CheerioAPI, base: string) {
    this.base = base;
    this.rawTextExtractor = new RawTextExtractor(cheerioInstance);
    this.structuredContentExtractor = new StructuredContentExtractor(cheerioInstance);
  }

  extract(): ExtractedContent {
    return {
      rawText: this.rawTextExtractor.extract(),
      structuredContent: this.structuredContentExtractor.extract(this.base),
    };
  }
}
