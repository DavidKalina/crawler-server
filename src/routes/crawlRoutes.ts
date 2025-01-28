// routes/crawlRoutes.ts
import { NextFunction, Request, Response, Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "../lib/supabaseClient";
import { ServiceFactory } from "../services/serviceFactory";
import { domainGuard } from "../utils/DomainGuard";
import { UrlValidator } from "../utils/UrlValidator";

const router = Router();

const verifyAuth = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing authorization header" });
  }

  const token = authHeader?.split(" ")[1];

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ error: "Invalid token" });
    }

    req.user = user ?? undefined;

    next();
  } catch (error) {
    console.error("Auth error:", error);
    res.status(401).json({ error: "Authentication failed" });
  }
};

router.post("/", verifyAuth, async (req, res) => {
  const services = ServiceFactory.getServices();
  const { startUrl, maxDepth = 3, allowedDomains, userId } = req.body;

  if (!startUrl || !UrlValidator.isValidUrl(startUrl)) {
    res.status(400).json({ error: "Invalid start URL" });
    return;
  }

  try {
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

    // Create database record in pending state
    await services.dbService.createCrawlJob({
      id: jobId,
      start_url: startUrl,
      max_depth: maxDepth,
      status: "pending",
      user_id: userId,
    });

    res.json({
      message: "Crawl job created",
      jobId,
    });
  } catch (error) {
    console.error("Failed to create crawl job:", error);
    res.status(500).json({ error: "Failed to create crawl job" });
  }
});
// GET /api/crawl/:jobId - Get status of a specific crawl job
router.get("/:jobId", verifyAuth, async (req, res) => {
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
