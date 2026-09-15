import { Router, type IRouter } from "express";
import healthRouter from "./health";
import campusPickRouter from "./campus-pick";

const router: IRouter = Router();

router.use(healthRouter);
router.use(campusPickRouter);

export default router;
