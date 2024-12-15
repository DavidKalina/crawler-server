import { CheerioAPI } from "cheerio";
import {
  StructuredContent,
  HeadingNode,
  TextNode,
  ListNode,
  TableNode,
  LinkNode,
} from "src/types/contentTypes";
import { domainGuard } from "src/utils/DomainGuard";
import { UrlValidator } from "src/utils/UrlValidator";

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

// extractors/RawTextExtractor.ts
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

// extractors/StructuredContentExtractor.ts
export class StructuredContentExtractor extends BaseExtractor {
  extract(base: string): StructuredContent {
    return {
      title: this.extractTitle(),
      headings: this.extractHeadings(),
      paragraphs: this.extractParagraphs(),
      lists: this.extractLists(),
      tables: this.extractTables(),
      links: this.extractValidLinks(this.extractLinks(), base),
    };
  }

  private extractTitle(): string | null {
    return this.$("title").first().text() || null;
  }

  private extractHeadings(): HeadingNode[] {
    const headings: HeadingNode[] = [];

    for (let level = 1; level <= 6; level++) {
      this.$(`h${level}`).each((_, element) => {
        headings.push({
          type: "heading",
          level: level as 1 | 2 | 3 | 4 | 5 | 6,
          content: this.sanitizeText(this.$(element).text()),
        });
      });
    }

    return headings;
  }

  private extractParagraphs(): TextNode[] {
    const paragraphs: TextNode[] = [];

    this.$("p").each((_, element) => {
      const text = this.sanitizeText(this.$(element).text());
      if (text) {
        paragraphs.push({
          type: "paragraph",
          content: text,
        });
      }
    });

    return paragraphs;
  }

  private extractLists(): ListNode[] {
    const lists: ListNode[] = [];

    this.$("ul, ol, dl").each((_, element) => {
      const items: string[] = [];
      const $element = this.$(element);

      if ($element.is("dl")) {
        $element.children("dt, dd").each((_, item) => {
          items.push(this.sanitizeText(this.$(item).text()));
        });
      } else {
        $element.children("li").each((_, item) => {
          items.push(this.sanitizeText(this.$(item).text()));
        });
      }

      lists.push({
        type: "list",
        listType: $element.is("ol") ? "ordered" : $element.is("dl") ? "definition" : "unordered",
        content: items.join("\n"),
        items,
      });
    });

    return lists;
  }

  private extractTables(): TableNode[] {
    const tables: TableNode[] = [];

    this.$("table").each((_, table) => {
      const headers: string[] = [];
      const rows: string[][] = [];

      // Extract headers
      this.$(table)
        .find("th")
        .each((_, th) => {
          headers.push(this.sanitizeText(this.$(th).text()));
        });

      // Extract rows
      this.$(table)
        .find("tr")
        .each((_, tr) => {
          const row: string[] = [];
          this.$(tr)
            .find("td")
            .each((_, td) => {
              row.push(this.sanitizeText(this.$(td).text()));
            });
          if (row.length > 0) {
            rows.push(row);
          }
        });

      tables.push({
        type: "table",
        content: "", // Raw text representation could be added if needed
        headers,
        rows,
      });
    });

    return tables;
  }

  private extractLinks(): LinkNode[] {
    const links: LinkNode[] = [];

    this.$("a[href]").each((_, element) => {
      const $element = this.$(element);
      const href = $element.attr("href") || "";
      const text = this.sanitizeText($element.text());

      if (href && text) {
        links.push({
          type: "link",
          content: text,
          href,
          text,
        });
      }
    });

    return links;
  }

  private extractValidLinks(links: LinkNode[], base: string): LinkNode[] {
    return links.filter((link) => {
      const normalizedUrl = UrlValidator.normalizeUrl(link.href, base);
      return normalizedUrl && domainGuard.isUrlAllowed(normalizedUrl);
    });
  }
}
