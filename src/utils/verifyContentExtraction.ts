import { ExtractedContentVerificationError } from "../errors/crawler/CrawlerErrorTypes";
import { ExtractedContent } from "../types/contentTypes";

export function verifyContentExtraction(extractedContent: ExtractedContent) {
  if (!extractedContent.rawText && extractedContent.structuredContent.paragraphs.length === 0) {
    throw new ExtractedContentVerificationError(
      "Extraction succeeded but no content was extracted"
    );
  }
}
