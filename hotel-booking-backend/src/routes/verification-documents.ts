import express, { Request, Response } from "express";

const router = express.Router();

// Stubbed: Migrate to Supabase Storage and PostgreSQL
router.use((req: Request, res: Response) => {
  res.status(501).json({ message: "Feature migrating to Supabase Storage" });
});

export default router;
