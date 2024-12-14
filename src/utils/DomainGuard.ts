import { DomainConfig } from "src/types/domainGuard";

export class DomainGuard {
  private readonly config: DomainConfig;

  constructor(config: DomainConfig) {
    this.config = {
      ...config,
      allowedDomains: config.allowedDomains.map((domain) => this.normalizeDomain(domain)),
    };
  }

  /**
   * Checks if a URL is allowed based on domain rules
   */
  isUrlAllowed(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const domain = this.normalizeDomain(urlObj.hostname);

      // Check if URL matches allowed domains
      const isDomainAllowed = this.config.allowedDomains.some((allowedDomain) => {
        if (this.config.allowSubdomains) {
          return domain === allowedDomain || domain.endsWith(`.${allowedDomain}`);
        }
        return domain === allowedDomain;
      });

      if (!isDomainAllowed) {
        return false;
      }

      // Check excluded paths if configured
      if (this.config.excludedPaths?.length) {
        const path = urlObj.pathname;
        return !this.config.excludedPaths.some((excludedPath) => path.startsWith(excludedPath));
      }

      return true;
    } catch (error) {
      console.error(`Invalid URL: ${url}`, error);
      return false;
    }
  }

  /**
   * Get the effective domain for a given URL
   */
  getEffectiveDomain(url: string): string | null {
    try {
      const urlObj = new URL(url);
      return this.normalizeDomain(urlObj.hostname);
    } catch {
      return null;
    }
  }

  /**
   * Check if two URLs belong to the same allowed domain
   */
  isSameAllowedDomain(url1: string, url2: string): boolean {
    const domain1 = this.getEffectiveDomain(url1);
    const domain2 = this.getEffectiveDomain(url2);

    if (!domain1 || !domain2) {
      return false;
    }

    // If subdomains are allowed, check if they share the same base domain
    if (this.config.allowSubdomains) {
      const baseAllowedDomain = this.config.allowedDomains.find(
        (domain) => domain1.endsWith(domain) && domain2.endsWith(domain)
      );
      return !!baseAllowedDomain;
    }

    return domain1 === domain2 && this.isUrlAllowed(url1);
  }

  private normalizeDomain(domain: string): string {
    return domain
      .toLowerCase()
      .trim()
      .replace(/^www\./, "");
  }
}

const domainGuard = new DomainGuard({
  allowSubdomains: true,
  ignorePaths: false,
  allowedDomains: ["example.com"],
  excludedPaths: ["/admin", "/private"],
});

export default domainGuard;
