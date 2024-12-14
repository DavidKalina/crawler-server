// utils/UrlValidator.ts
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
      const normalized = new URL(url, base);
      return normalized.href;
    } catch {
      return null;
    }
  }
}
