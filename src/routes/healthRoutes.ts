// routes/healthRoutes.ts
import { Router } from "express";
import { serviceFactory } from "../services/serviceFactory";

const router = Router();

// GET /api/health - Get system health status
router.get("/", async (_, res) => {
  const { healthService } = serviceFactory.getServices();

  try {
    const { status, statusCode } = await healthService.getSystemHealth();
    res.status(statusCode).json(status);
  } catch (error) {
    console.error("Health check failed:", error);
    res.status(503).json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      message: error instanceof Error ? error.message : "Health check failed",
    });
  }
});

export const healthRouter = router;
