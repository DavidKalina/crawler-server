import { CrawlJob } from "src";
import { UrlValidator } from "./UrlValidator";
import { domainGuard } from "./DomainGuard";
import {
  DomainNotAllowedError,
  DuplicateUrlError,
  InvalidUrlFormatError,
} from "src/errors/crawler/CrawlerErrorTypes";

export function validateCrawlRequest(job: CrawlJob, crawledUrls: Map<string, Set<string>>) {
  if (crawledUrls.get(job.id)?.has(job.url)) {
    throw new DuplicateUrlError(job.url);
  }

  const normalizedUrl = UrlValidator.normalizeUrl(job.url);
  if (!normalizedUrl) {
    throw new InvalidUrlFormatError(job.url);
  }

  if (!domainGuard.isUrlAllowed(normalizedUrl)) {
    throw new DomainNotAllowedError(normalizedUrl);
  }

  return normalizedUrl;
}
