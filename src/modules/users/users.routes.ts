import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { requireTenantWritable } from "../../middlewares/requireTenantWritable";
import { requirePermission } from "../../middlewares/requirePermission";
import {
  cancelInviteHandler,
  createInviteHandler,
  createRoleHandler,
  deleteRoleHandler,
  getSeatsHandler,
  listRolesHandler,
  listUsersHandler,
  permissionCatalogHandler,
  resendInviteHandler,
  updateRoleHandler,
  updateUserHandler,
} from "./users.controller";

export const usersRouter: Router = Router();

usersRouter.use(authenticate);
usersRouter.get("/permission-catalog", requirePermission("user.manage"), permissionCatalogHandler);
usersRouter.get("/roles", requirePermission("user.manage"), listRolesHandler);
usersRouter.post("/roles", requireTenantWritable, requirePermission("user.manage"), createRoleHandler);
usersRouter.patch("/roles/:id", requireTenantWritable, requirePermission("user.manage"), updateRoleHandler);
usersRouter.delete("/roles/:id", requireTenantWritable, requirePermission("user.manage"), deleteRoleHandler);
usersRouter.get("/seats", requirePermission("user.manage"), getSeatsHandler);
usersRouter.get("/", requirePermission("user.manage"), listUsersHandler);
usersRouter.post("/invites", requireTenantWritable, requirePermission("user.manage"), createInviteHandler);
usersRouter.post(
  "/invites/:id/resend",
  requireTenantWritable,
  requirePermission("user.manage"),
  resendInviteHandler,
);
usersRouter.delete("/invites/:id", requireTenantWritable, requirePermission("user.manage"), cancelInviteHandler);
usersRouter.patch("/:id", requireTenantWritable, requirePermission("user.manage"), updateUserHandler);
