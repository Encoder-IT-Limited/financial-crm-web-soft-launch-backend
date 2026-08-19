import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { requireTenantWritable } from "../../middleware/requireTenantWritable";
import * as c from "./invoicing.controller";

export const invoicingRouter: Router = Router();

invoicingRouter.use(authenticate);

invoicingRouter.get("/invoices", c.listInvoicesHandler);
invoicingRouter.post("/invoices", requireTenantWritable, c.createInvoiceHandler);
invoicingRouter.get("/invoices/:id", c.getInvoiceHandler);
invoicingRouter.post("/invoices/:id/send", requireTenantWritable, c.sendInvoiceHandler);
invoicingRouter.post("/invoices/:id/payments", requireTenantWritable, c.recordPaymentHandler);
invoicingRouter.post("/invoices/:id/fulfill", requireTenantWritable, c.fulfillInvoiceHandler);
invoicingRouter.post("/invoices/:id/cancel", requireTenantWritable, c.cancelInvoiceHandler);

invoicingRouter.post("/credit-notes", requireTenantWritable, c.createCreditNoteHandler);

invoicingRouter.get("/recurring-templates", c.listRecurringTemplatesHandler);
invoicingRouter.post("/recurring-templates", requireTenantWritable, c.createRecurringTemplateHandler);
