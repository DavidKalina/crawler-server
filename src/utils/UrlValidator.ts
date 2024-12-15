// utils/UrlValidator.ts
export class UrlValidator {
  /**
   * Validates if a string is a valid URL
   */
  static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Normalizes a URL to prevent duplicates by:
   * - Converting to lowercase
   * - Removing www prefix
   * - Removing empty fragments (#)
   * - Removing default ports
   * - Standardizing trailing slashes
   * - Sorting query parameters
   */
  static normalizeUrl(url: string, base?: string): string | null {
    try {
      // Parse URL with optional base
      const urlObj = new URL(url, base);

      // Convert hostname to lowercase and remove www
      urlObj.hostname = urlObj.hostname.toLowerCase();
      if (urlObj.hostname.startsWith("www.")) {
        urlObj.hostname = urlObj.hostname.substring(4);
      }

      // Remove default ports
      if (
        (urlObj.protocol === "http:" && urlObj.port === "80") ||
        (urlObj.protocol === "https:" && urlObj.port === "443")
      ) {
        urlObj.port = "";
      }

      // Sort query parameters if they exist
      if (urlObj.search) {
        const searchParams = new URLSearchParams([...urlObj.searchParams.entries()].sort());
        urlObj.search = searchParams.toString();
      }

      // Remove trailing slash from pathname unless it's the root
      if (urlObj.pathname.length > 1 && urlObj.pathname.endsWith("/")) {
        urlObj.pathname = urlObj.pathname.slice(0, -1);
      }

      // Remove empty fragments
      if (urlObj.hash === "#") {
        urlObj.hash = "";
      }

      return urlObj.href;
    } catch (error) {
      return null;
    }
  }

  /**
   * Checks if a URL should be crawled based on its file extension
   * and other characteristics
   */
  static isCrawlableUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);

      // Check protocol
      if (!["http:", "https:"].includes(urlObj.protocol)) {
        return false;
      }

      // Check for obviously non-crawlable paths
      const nonCrawlablePatterns = [
        // Binary and document files
        /\.(jpg|jpeg|png|gif|ico|pdf|doc|docx|xls|xlsx|zip|tar|gz|exe)$/i,
        // Web assets
        /\.(css|js|json|xml|txt|map)$/i,
        // Media files
        /\.(mp3|mp4|avi|mov|wmv|wav|webm)$/i,
        // Font files
        /\.(ttf|woff|woff2|eot)$/i,
        // Other protocols
        /^(mailto:|tel:|ftp:|file:)/i,
      ];

      return !nonCrawlablePatterns.some((pattern) => pattern.test(urlObj.pathname));
    } catch {
      return false;
    }
  }
}
