import express, { Request, Response } from "express";
import { supabaseAdmin } from "../core/supabase";
import { asyncHandler } from "../middleware/errorHandler";

const router = express.Router();

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Get API health status
 *     description: Returns the current health status of the API including database connection, memory usage, and uptime
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: API is healthy
 */
router.get("/", asyncHandler(async (req: Request, res: Response) => {
  // Check database connection
  const { data, error } = await supabaseAdmin.from("users").select("id").limit(1);
  const dbStatus = error ? "disconnected" : "connected";

  // Get memory usage
  const memUsage = process.memoryUsage();
  const usedMemoryMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  const totalMemoryMB = Math.round(memUsage.heapTotal / 1024 / 1024);
  const memoryPercentage = Math.round((usedMemoryMB / totalMemoryMB) * 100);

  // Get uptime
  const uptime = process.uptime();

  const healthData = {
    status: dbStatus === "connected" ? "healthy" : "unhealthy",
    timestamp: new Date().toISOString(),
    uptime: Math.round(uptime),
    database: {
      status: dbStatus,
      name: "Supabase PostgreSQL",
    },
    memory: {
      used: usedMemoryMB,
      total: totalMemoryMB,
      percentage: memoryPercentage,
    },
    environment: process.env.NODE_ENV || "development",
    version: "1.0.0",
  };

  const statusCode = dbStatus === "connected" ? 200 : 503;
  res.status(statusCode).json(healthData);
}));

/**
 * @swagger
 * /api/health/detailed:
 *   get:
 *     summary: Get detailed API health status
 *     description: Returns detailed health information including system metrics and performance data
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Detailed health information
 */
router.get("/detailed", async (req: Request, res: Response) => {
  try {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const { data, error } = await supabaseAdmin.from("users").select("id").limit(1);
    const dbStatus = error ? "disconnected" : "connected";

    const detailedHealth = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      system: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        pid: process.pid,
      },
      performance: {
        memory: {
          heapUsed: memUsage.heapUsed,
          heapTotal: memUsage.heapTotal,
          external: memUsage.external,
          rss: memUsage.rss,
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system,
        },
        uptime: Math.round(process.uptime()),
      },
      database: {
        status: dbStatus,
        host: "Supabase",
        name: "PostgreSQL",
      },
    };

    res.status(200).json(detailedHealth);
  } catch (error) {
    res.status(503).json({
      status: "unhealthy",
      error: "Detailed health check failed",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
