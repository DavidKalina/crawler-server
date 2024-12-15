// tests/unit/urlValidator.test.ts

import { UrlValidator } from "../../src/utils/UrlValidator";

describe("UrlValidator", () => {
  describe("isValidUrl", () => {
    it("should validate correct URLs", () => {
      expect(UrlValidator.isValidUrl("https://example.com")).toBe(true);
      expect(UrlValidator.isValidUrl("http://sub.example.com/path")).toBe(true);
    });

    it("should reject invalid URLs", () => {
      expect(UrlValidator.isValidUrl("not-a-url")).toBe(false);
      expect(UrlValidator.isValidUrl("")).toBe(false);
    });
  });

  describe("normalizeUrl", () => {
    it("should normalize URLs correctly", () => {
      expect(UrlValidator.normalizeUrl("HTTPS://Example.com/Path/")).toBe(
        "https://example.com/path"
      );
      expect(UrlValidator.normalizeUrl("http://www.example.com")).toBe("http://example.com");
    });

    it("should handle relative URLs with base", () => {
      expect(UrlValidator.normalizeUrl("/path", "https://example.com")).toBe(
        "https://example.com/path"
      );
    });
  });
});
