// routes/crawlRoutes.ts
import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { UrlValidator } from "../utils/UrlValidator";
import { domainGuard } from "../utils/DomainGuard";
import { ServiceFactory } from "../services/serviceFactory";

const router = Router();

router.post("/", async (req, res) => {
  const { startUrl, maxDepth = 3, allowedDomains } = req.body;
  const services = ServiceFactory.getServices();

  if (!startUrl || !UrlValidator.isValidUrl(startUrl)) {
    res.status(400).json({ error: "Invalid start URL" });
    return;
  }

  try {
    // Configure domain guard
    if (allowedDomains) {
      domainGuard.configure({
        allowedDomains,
        allowSubdomains: true,
      });
    } else {
      domainGuard.configureForUrl(startUrl);
    }

    // Create job ID
    const jobId = uuidv4();

    // Create database record
    await services.dbService.createCrawlJob({
      id: jobId,
      start_url: startUrl,
      max_depth: maxDepth,
      status: "pending",
    });

    // Add to queue
    await services.queueService.addJob({
      id: jobId,
      url: startUrl,
      maxDepth,
      currentDepth: 0,
    });

    // Broadcast update
    await services.queueUpdateService.broadcastQueueUpdate();

    // Log operation

    res.json({
      message: "Crawl job started",
      jobId,
    });
  } catch (error) {
    console.log("ERROR", error);
    console.error("Failed to start crawl job:", error);
    res.status(500).json({ error: "Failed to start crawl job" });
  }
});

// GET /api/crawl/:jobId - Get status of a specific crawl job
router.get("/:jobId", async (req, res) => {
  const { jobId } = req.params;
  const services = ServiceFactory.getServices();

  try {
    // Get database job and queue information in parallel
    const [databaseJob, queueJobs, queueStats] = await Promise.all([
      services.dbService.getJobById(jobId),
      services.queueService.getJobsByCrawlId(jobId),
      services.queueService.getQueueStats(),
    ]);

    // Format response
    const response = {
      databaseJob,
      queueInfo: {
        jobs: queueJobs,
        ...queueStats,
      },
    };

    res.json(response);
  } catch (error) {
    console.error("Failed to fetch enhanced job status:", error);
    res.status(500).json({
      error: "Failed to fetch job status",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export const crawlRouter = router;
