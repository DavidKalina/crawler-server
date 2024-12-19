export class CrawlerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CRAWLER_ERROR";
  }
}

export class DuplicateUrlError extends CrawlerError {
  constructor(url: string) {
    super(`URL_ALREADY_CRAWLED: ${url}`);
    this.name = "DUPLICATE_URL_ERROR";
  }
}

export class InvalidUrlFormatError extends CrawlerError {
  constructor(url: string) {
    super(`INVALID_URL_FORMAT: ${url}`);
    this.name = `INVALID_URL_FORMAT_ERROR`;
  }
}

export class DomainNotAllowedError extends CrawlerError {
  constructor(domain: string) {
    super(`DOMAIN_NOT_ALLOWED: ${domain}`);
    this.name = `DOMAIN_NOT_ALLOWED_ERROR`;
  }
}

export class RobotsParserError extends CrawlerError {
  constructor(url: string) {
    super(`COULD_NOT_FETCH_ROBOTS_TXT: ${url}`);
    this.name = `ROBOTS_PARSER_ERROR`;
  }
}

export class RobotsNotAllowedError extends CrawlerError {
  constructor(url: string) {
    super(`DENIED_BY_ROBOTS_TXT: ${url}`);
    this.name = `ROBOTS_NOT_ALLOWED_ERROR`;
  }
}

export class ExtractedContentVerificationError extends CrawlerError {
  constructor(title: string) {
    super(`EXTRACTED_CONTENT_FAILED_VERIFICATION: ${title}`);
    this.name = `EXTRACTED_CONTENT_VERIFICATION_ERROR`;
  }
}
