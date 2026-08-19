import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { loginHandler, refreshHandler, meHandler } from "./auth.controller";

export const authRouter: Router = Router();

authRouter.post("/login", loginHandler);
authRouter.post("/refresh", refreshHandler);
authRouter.get("/me", authenticate, meHandler);
