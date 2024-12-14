// types/ContentTypes.ts

export interface ExtractedContent {
  rawText: string;
  structuredContent: StructuredContent;
}

export interface StructuredContent {
  title: string | null;
  headings: HeadingNode[];
  paragraphs: TextNode[];
  lists: ListNode[];
  tables: TableNode[];
  links: LinkNode[];
}

interface BaseNode {
  type: string;
  content: string;
  metadata?: Record<string, any>;
}

export interface HeadingNode extends BaseNode {
  type: "heading";
  level: 1 | 2 | 3 | 4 | 5 | 6;
}

export interface TextNode extends BaseNode {
  type: "paragraph" | "span" | "div";
}

export interface ListNode extends BaseNode {
  type: "list";
  listType: "ordered" | "unordered" | "definition";
  items: string[];
}

export interface TableNode extends BaseNode {
  type: "table";
  headers: string[];
  rows: string[][];
}

export interface LinkNode extends BaseNode {
  type: "link";
  href: string;
  text: string;
}
