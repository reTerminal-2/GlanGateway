import express, { Request, Response } from "express";
const router = express.Router();
router.use((req: Request, res: Response) => res.status(501).json({ message: "Migrating to Supabase" }));
export default router;
