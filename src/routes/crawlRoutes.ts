// routes/crawlRoutes.ts
import { NextFunction, Request, Response, Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "../lib/supabaseClient";
import { serviceFactory } from "../services/serviceFactory";
import { domainGuard } from "../utils/DomainGuard";
import { UrlValidator } from "../utils/UrlValidator";

const router = Router();

const verifyAuth = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing authorization header" });
    return;
  }

  const token = authHeader?.split(" ")[1];

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    req.user = user ?? undefined;

    next();
  } catch (error) {
    console.error("Auth error:", error);
    res.status(401).json({ error: "Authentication failed" });
    return;
  }
};

router.post("/", verifyAuth, async (req, res) => {
  const services = serviceFactory.getServices();
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

router.post("/:jobId/stop", verifyAuth, async (req, res) => {
  const { jobId } = req.params;
  const services = serviceFactory.getServices();

  try {
    // Verify job exists and belongs to user
    const job = await services.dbService.getJobById(jobId);
    if (!job) {
      res.status(404).json({ error: "Crawl job not found" });
      return;
    }

    if (job.user_id !== req.user?.id) {
      res.status(403).json({ error: "Not authorized to stop this crawl" });
      return;
    }

    // Check if job is already stopped or completed
    if (["stopped", "completed", "failed"].includes(job.status)) {
      res.status(400).json({
        error: "Cannot stop job",
        message: `Job is already in ${job.status} state`,
      });
      return;
    }

    // Stop the crawl
    await services.queueService.stopCrawl(jobId);

    res.json({
      message: "Crawl stop initiated",
      jobId,
    });
    return;
  } catch (error) {
    console.log(error);
    console.error("Failed to stop crawl job:", error);
    res.status(500).json({
      error: "Failed to stop crawl job",
      details: error instanceof Error ? error.message : "Unknown error",
    });
    return;
  }
});

export const crawlRouter = router;
