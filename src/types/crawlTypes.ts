import { ExtractedContent } from "./contentTypes";
import { QueueJobInfo } from "./queueTypes";

export interface CrawlJob {
  id: string;
  url: string;
  maxDepth: number;
  currentDepth: number;
  parentUrl?: string;
}

export interface CrawlDebugInfo {
  url: string;
  timestamp: string;
  responseStatus?: number;
  responseSize?: number;
  cheerioLoadSuccess?: boolean;
  extractionSuccess?: boolean;
  error?: string;
  contentStats?: {
    rawTextLength?: number;
    headingsCount?: number;
    paragraphsCount?: number;
    listsCount?: number;
    tablesCount?: number;
    linksCount?: number;
  };
}

export interface EnhancedJobStatus {
  databaseJob: any;
  queueInfo: {
    mainJob: QueueJobInfo | null;
    childJobs: QueueJobInfo[];
    waitingCount: number;
    activeCount: number;
    completedCount: number;
    failedCount: number;
  };
}

export interface CrawlResult {
  url: string;
  title: string | null;
  content: string | null;
  extractedContent: ExtractedContent;
  links: string[];
  depth: number;
}

export interface CrawlStats {
  crawlId: string;
  stats: {
    total: number;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    pending: number;
  };
  isComplete: boolean;
  status: string;
}
