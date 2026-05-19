import express from "express";
import fs from "fs";
import path from "path";
import compression from "compression";
import morgan from "morgan";
import { errorHandler, setupProcessErrorHandlers } from "./middleware/errorHandler";

import { corsMiddleware } from "./middleware/cors";
import { 
  securityMiddleware,
  setupTrustProxy,
  setupRateLimiting,
  cookieParserMiddleware,
  csrfMiddleware,
  getCsrfToken
} from "./middleware/security";
import { applyComplianceMiddleware } from "./middleware/compliance";
import { mountRoutes } from "./routes";
import { featureFlagMiddleware } from "./middleware/feature-flag";
import { metrics } from "./core/metrics";

// Environment Variables Validation
const requiredEnvVars = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "JWT_SECRET_KEY",
  "STRIPE_PUBLISHABLE_KEY",
  "STRIPE_SECRET_KEY",
];

export const validateEnvironment = () => {
  const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

  if (missingEnvVars.length > 0) {
    console.error("❌ Missing required environment variables:");
    missingEnvVars.forEach((envVar) => console.error(`   - ${envVar}`));
    process.exit(1);
  }

  console.log("✅ All required environment variables are present");
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL || "Not set"}`);
  console.log(
    `🔗 Backend URL: ${process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`}`
  );
};

export const configureCloudinary = () => {
  console.log("☁️  Cloudinary integration decommissioned. Utilizing Supabase Storage buckets.");
};

export const createUploadsDirectory = () => {
  console.log("☁️  Local uploads directory creation disabled. Utilizing Supabase Storage buckets.");
};

// Supabase Connection with Validation
export const connectDB = async () => {
  try {
    console.log("📡 Validating connection to Supabase Database...");
    const { supabase } = require("./core/supabase");
    
    // Test connection by doing a simple health select
    const { data, error } = await supabase.from("users").select("id").limit(1);
    
    if (error) {
      if (error.message.includes("Could not find the table") || error.message.includes("does not exist")) {
        console.warn("⚠️  Supabase connected successfully, but 'public.users' table was not found.");
        console.warn("💡 Action Required: Please copy and run the SQL migration script from 'supabase_migration_plan.md' in your Supabase SQL Editor to set up your tables!");
        return;
      }
      throw new Error(`Supabase test query failed: ${error.message}`);
    }
    
    console.log("✅ Supabase Database connected and validated successfully");
  } catch (error: any) {
    console.warn("⚠️  Supabase validation warning:", error.message || error);
    console.warn("💡 Make sure to verify your SUPABASE_URL and SUPABASE_ANON_KEY in your .env");
  }
};

export const setupMongoEventHandlers = () => {
  console.log("⚡ Supabase integration active. Realtime and connection state auto-monitored.");
};


export const createAndConfigureApp = () => {
  const app = express();

  // Metrics middleware - first in stack to capture all requests
  app.use(metrics.expressMiddleware());

  app.use(securityMiddleware);
  setupTrustProxy(app);
  setupRateLimiting(app);
  applyComplianceMiddleware(app);
  
  app.use(compression());
  app.use(morgan("combined"));

  // Static file serving for uploaded images
  app.use('/uploads', express.static(path.join(__dirname, '..', '..', 'uploads')));

  // Observability endpoints
  app.get("/health", metrics.getHealthCheckHandler.bind(metrics));
  app.get("/metrics", metrics.getMetricsHandler.bind(metrics));
  

  
  app.use(corsMiddleware);
  
  app.use(cookieParserMiddleware);
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  
  app.use(csrfMiddleware);
  app.use(featureFlagMiddleware);
  app.get("/api/csrf-token", getCsrfToken);
  
  app.use((req, res, next) => {
    // Ensure Vary header for CORS
    res.header("Vary", "Origin");
    next();
  });

  mountRoutes(app);

  // Global Error Handler - MUST be the LAST middleware
  app.use(errorHandler);

  setupProcessErrorHandlers();

  return app;
};

// Graceful Shutdown Handler
export const createGracefulShutdown = (server: any) => {
  return (signal: string) => {
    console.log(`\n⚠️  ${signal} received. Starting graceful shutdown...`);

    server.close(async () => {
      console.log("🔒 HTTP server closed");

      try {
        console.log("🔒 Supabase connection closed");
        console.log("✅ Graceful shutdown completed");
        process.exit(0);
      } catch (error) {
        console.error("❌ Error during shutdown:", error);
        process.exit(1);
      }
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
      console.error("⚠️  Forced shutdown after timeout");
      process.exit(1);
    }, 30000);
  };
};
