import { UrlValidator } from "./UrlValidator";
import { domainGuard } from "./DomainGuard";
import {
  DuplicateUrlError,
  InvalidUrlFormatError,
  DomainNotAllowedError,
} from "../errors/crawler/CrawlerErrorTypes";
import { CrawlJob } from "../types/crawlTypes";

export function validateCrawlRequest(job: CrawlJob) {
  const normalizedUrl = UrlValidator.normalizeUrl(job.url);
  if (!normalizedUrl) {
    throw new InvalidUrlFormatError(job.url);
  }

  if (!domainGuard.isUrlAllowed(normalizedUrl)) {
    throw new DomainNotAllowedError(normalizedUrl);
  }

  return normalizedUrl;
}
