// DomainGuard.ts

import { DomainConfig } from "../types/domainGuard";

export class DomainGuard {
  private config: DomainConfig;
  private static instance: DomainGuard;

  private constructor() {
    // Start with an empty config
    this.config = {
      allowSubdomains: true,
      ignorePaths: false,
      allowedDomains: [],
      excludedPaths: ["/admin", "/private", "/wp-admin", "/login", "/logout"],
    };
  }

  static getInstance(): DomainGuard {
    if (!DomainGuard.instance) {
      DomainGuard.instance = new DomainGuard();
    }
    return DomainGuard.instance;
  }

  configure(config: Partial<DomainConfig>) {
    this.config = {
      ...this.config,
      ...config,
      // Always normalize allowed domains
      allowedDomains: config.allowedDomains
        ? config.allowedDomains.map((domain) => this.normalizeDomain(domain))
        : this.config.allowedDomains,
    };
  }

  configureForUrl(url: string) {
    try {
      const urlObj = new URL(url);
      const domain = this.normalizeDomain(urlObj.hostname);
      this.configure({
        allowedDomains: [domain],
      });
    } catch (error) {
      console.error(`Invalid URL provided for configuration: ${url}`, error);
    }
  }

  /**
   * Checks if a URL is allowed based on domain rules
   */
  isUrlAllowed(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const domain = this.normalizeDomain(urlObj.hostname);

      // If no allowed domains are configured, only restrict to the same domain as URL
      if (this.config.allowedDomains.length === 0) {
        return true; // Allow all domains if none specified
      }

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
      if (this.config.excludedPaths?.length && !this.config.ignorePaths) {
        const path = urlObj.pathname;
        return !this.config.excludedPaths.some((excludedPath) =>
          path.toLowerCase().startsWith(excludedPath.toLowerCase())
        );
      }

      return true;
    } catch (error) {
      console.error(`Invalid URL: ${url}`, error);
      return false;
    }
  }

  getEffectiveDomain(url: string): string | null {
    try {
      const urlObj = new URL(url);
      return this.normalizeDomain(urlObj.hostname);
    } catch {
      return null;
    }
  }

  isSameAllowedDomain(url1: string, url2: string): boolean {
    const domain1 = this.getEffectiveDomain(url1);
    const domain2 = this.getEffectiveDomain(url2);

    if (!domain1 || !domain2) {
      return false;
    }

    return domain1 === domain2;
  }

  private normalizeDomain(domain: string): string {
    return domain
      .toLowerCase()
      .trim()
      .replace(/^www\./, "");
  }
}

// Export a singleton instance
export const domainGuard = DomainGuard.getInstance();

// Don't export default instance anymore
