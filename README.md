# Web Crawler Project

A scalable web crawler built with Node.js, TypeScript, Redis, and Supabase. The crawler supports configurable depth, domain restrictions, and provides detailed content extraction.

## Prerequisites

- Node.js (v16 or higher)
- Redis
- Supabase account and project

## Environment Setup

Create a `.env` file in the root directory with the following variables:

```env
PORT=3000
REDIS_HOST=localhost
REDIS_PORT=6379
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_service_key
```

## Installation

```bash
npm install
```

## Starting the Server

1. Start Redis:

```bash
redis-server
```

2. Start the application:

```bash
npm run build
npm start
```

For development with auto-reload:

```bash
npm run dev
```

## API Usage

### Start a New Crawl

```bash
curl -X POST http://localhost:3000/api/crawl \
  -H "Content-Type: application/json" \
  -d '{
    "startUrl": "https://www.oeockent.org",
    "maxDepth": 3,
    "allowedDomains": ["www.oeockent.org"]
  }'
```

Response:

```json
{
  "message": "Crawl job started",
  "jobId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Check Crawl Status

```bash
curl http://localhost:3000/api/crawl/550e8400-e29b-41d4-a716-446655440000
```

Response:

```json
{
  "databaseJob": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "active",
    "total_pages_crawled": 42,
    ...
  },
  "queueInfo": {
    "waitingCount": 10,
    "activeCount": 5,
    "completedCount": 35,
    "failedCount": 2
  }
}
```

### Clear Queue and Stop All Jobs

```bash
curl -X POST http://localhost:3000/api/queue/clear
```

Response:

```json
{
  "success": true,
  "summary": {
    "total_crawls_affected": 3,
    "total_jobs_cleared": 45,
    "affected_crawl_ids": ["id1", "id2", "id3"]
  }
}
```

## Configuration Options

When starting a crawl, you can configure:

- `startUrl` (required): The initial URL to crawl
- `maxDepth` (optional): Maximum crawl depth (default: 3)
- `allowedDomains` (optional): Array of allowed domains to crawl

Example with all options:

```bash
curl -X POST http://localhost:3000/api/crawl \
  -H "Content-Type: application/json" \
  -d '{
    "startUrl": "https://example.com",
    "maxDepth": 5,
    "allowedDomains": [
      "example.com",
      "blog.example.com",
      "docs.example.com"
    ]
  }'
```

## Testing

Run the test suite:

```bash
npm test
```

Run tests with coverage:

```bash
npm run test:coverage
```

## Rate Limiting

The crawler implements rate limiting to be respectful to target websites:

- Respects robots.txt directives
- Implements per-domain request delays
- Supports configurable concurrent requests per domain

## Error Handling

The crawler handles various error scenarios:

- Invalid URLs
- Network timeouts
- Rate limiting responses
- Malformed HTML
- Domain restrictions

## Monitoring

Monitor crawl progress through:

- Real-time job status endpoint
- Detailed logging in Supabase
- Queue statistics
- Performance metrics

## License

MIT
