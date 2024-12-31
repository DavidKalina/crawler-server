import { UrlValidator } from "./UrlValidator";
import { domainGuard } from "./DomainGuard";
import {
  DuplicateUrlError,
  InvalidUrlFormatError,
  DomainNotAllowedError,
} from "../errors/crawler/CrawlerErrorTypes";
import { CrawlJob } from "..";

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
