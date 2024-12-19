export const CRAWL_REQUEST_CONFIG = {
  headers: {
    "User-Agent": "YourBot/1.0 (+http://yourwebsite.com/bot)",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate, br",
    Connection: "keep-alive",
  },
  timeout: 30000, // Increased timeout
  maxContentLength: 10 * 1024 * 1024, // 10MB limit
  validateStatus: null, // Allow all status codes for proper error handling
};
