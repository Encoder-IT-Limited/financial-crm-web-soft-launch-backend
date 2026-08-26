import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { requireTenantWritable } from "../../middlewares/requireTenantWritable";
import * as c from "./proposals.controller";

export const proposalsRouter: Router = Router();

proposalsRouter.use(authenticate);

proposalsRouter.get("/", c.listProposalsHandler);
proposalsRouter.get("/next-number", c.nextProposalNumberHandler);
proposalsRouter.post("/", requireTenantWritable, c.createProposalHandler);
proposalsRouter.get("/:id", c.getProposalHandler);
proposalsRouter.patch("/:id", requireTenantWritable, c.updateProposalHandler);
proposalsRouter.post("/:id/send", requireTenantWritable, c.sendProposalHandler);
proposalsRouter.post("/:id/reject", requireTenantWritable, c.rejectProposalHandler);
proposalsRouter.post("/:id/convert", requireTenantWritable, c.convertProposalHandler);
