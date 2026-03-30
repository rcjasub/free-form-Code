import { Router } from "express";
import {getAllBlocks} from "../controllers/blocksController"

// mergeParams: true allows this router to access :id from the parent route in server.ts
const router = Router({ mergeParams: true });

router.get("/", getAllBlocks);

export default router;
