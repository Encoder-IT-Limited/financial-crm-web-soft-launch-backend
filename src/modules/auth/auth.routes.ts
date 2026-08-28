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
  verifyOtpHandler,
} from "./auth.controller";
import { acceptInviteHandler, previewInviteHandler } from "../users/users.controller";

export const authRouter: Router = Router();

authRouter.get("/csrf", issueCsrfToken);
authRouter.post("/login", loginHandler);
authRouter.post("/logout", logoutHandler);
authRouter.post("/refresh", refreshHandler);
authRouter.post("/signup", signupHandler);
authRouter.get("/invite", previewInviteHandler);
authRouter.post("/accept-invite", acceptInviteHandler);
authRouter.post("/forgot-password", forgotPasswordHandler);
authRouter.post("/verify-otp", verifyOtpHandler);
authRouter.post("/reset-password", resetPasswordHandler);
authRouter.get("/me", authenticateAny, meHandler);

export const publicPlansRouter: Router = Router();
publicPlansRouter.get("/", listPublicPlansHandler);
