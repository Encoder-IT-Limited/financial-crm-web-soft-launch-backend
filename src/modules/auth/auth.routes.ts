import { Router } from "express";
import { authenticateAny } from "../../middlewares/authenticate";
import { issueCsrfToken } from "../../middlewares/csrf";
import {
  loginHandler,
  refreshHandler,
  meHandler,
  logoutHandler,
  signupHandler,
  listPublicPlansHandler,
  forgotPasswordHandler,
  resetPasswordHandler,
} from "./auth.controller";

export const authRouter: Router = Router();

authRouter.get("/csrf", issueCsrfToken);
authRouter.post("/login", loginHandler);
authRouter.post("/logout", logoutHandler);
authRouter.post("/refresh", refreshHandler);
authRouter.post("/signup", signupHandler);
authRouter.post("/forgot-password", forgotPasswordHandler);
authRouter.post("/reset-password", resetPasswordHandler);
authRouter.get("/me", authenticateAny, meHandler);

export const publicPlansRouter: Router = Router();
publicPlansRouter.get("/", listPublicPlansHandler);
