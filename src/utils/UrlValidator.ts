export class UrlValidator {
  static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  static normalizeUrl(url: string, base?: string): string | null {
    try {
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

      // Normalize protocol to lowercase
      urlObj.protocol = urlObj.protocol.toLowerCase();

      // Sort query parameters if they exist
      if (urlObj.search) {
        const searchParams = new URLSearchParams([...urlObj.searchParams.entries()].sort());
        urlObj.search = searchParams.toString();
      }

      // Normalize path: convert to lowercase and handle trailing slashes
      urlObj.pathname = urlObj.pathname.toLowerCase().replace(/\/{2,}/g, "/");

      // For root path ("/"), leave it alone
      // For non-root paths, remove trailing slash
      if (urlObj.pathname !== "/" && urlObj.pathname.endsWith("/")) {
        urlObj.pathname = urlObj.pathname.slice(0, -1);
      }

      // Remove empty fragments
      if (urlObj.hash === "#") {
        urlObj.hash = "";
      }

      // When pathname is just "/", return URL without it
      if (urlObj.pathname === "/") {
        return `${urlObj.protocol}//${urlObj.host}${urlObj.search}${urlObj.hash}`;
      }

      return urlObj.toString();
    } catch (error) {
      return null;
    }
  }

  static isCrawlableUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);

      if (!["http:", "https:"].includes(urlObj.protocol)) {
        return false;
      }

      const nonCrawlablePatterns = [
        /\.(jpg|jpeg|png|gif|ico|pdf|doc|docx|xls|xlsx|zip|tar|gz|exe)$/i,
        /\.(css|js|json|xml|txt|map)$/i,
        /\.(mp3|mp4|avi|mov|wmv|wav|webm)$/i,
        /\.(ttf|woff|woff2|eot)$/i,
        /^(mailto:|tel:|ftp:|file:)/i,
      ];

      return !nonCrawlablePatterns.some((pattern) => pattern.test(urlObj.pathname));
    } catch {
      return false;
    }
  }
}
