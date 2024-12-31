import { BaseExtractor } from ".";

export class RawTextExtractor extends BaseExtractor {
  extract(): string {
    // Remove script and style elements
    this.$("script, style").remove();

    // Get text content with basic formatting preserved
    const rawText = this.$("body")
      .text()
      .split("\n")
      .map((line) => this.sanitizeText(line))
      .filter((line) => line.length > 0)
      .join("\n");

    return rawText;
  }
}
