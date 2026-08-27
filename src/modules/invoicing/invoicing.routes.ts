import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { requireTenantWritable } from "../../middlewares/requireTenantWritable";
import * as c from "./invoicing.controller";

export const invoicingRouter: Router = Router();

invoicingRouter.use(authenticate);

invoicingRouter.get("/invoices", c.listInvoicesHandler);
invoicingRouter.get("/invoices/next-number", c.nextInvoiceNumberHandler);
invoicingRouter.get("/invoices/stats", c.invoiceStatsHandler);
invoicingRouter.get("/invoices/summary", c.invoiceSummaryHandler);
invoicingRouter.post("/invoices", requireTenantWritable, c.createInvoiceHandler);
invoicingRouter.get("/invoices/:id", c.getInvoiceHandler);
invoicingRouter.patch("/invoices/:id", requireTenantWritable, c.updateInvoiceHandler);
invoicingRouter.post("/invoices/:id/send", requireTenantWritable, c.sendInvoiceHandler);
invoicingRouter.post("/invoices/:id/payments", requireTenantWritable, c.recordPaymentHandler);
invoicingRouter.post("/invoices/:id/fulfill", requireTenantWritable, c.fulfillInvoiceHandler);
invoicingRouter.post("/invoices/:id/reminders", requireTenantWritable, c.sendInvoiceReminderHandler);
invoicingRouter.post("/invoices/:id/cancel", requireTenantWritable, c.cancelInvoiceHandler);

invoicingRouter.get("/fulfillments", c.listFulfillmentsHandler);
invoicingRouter.get("/fulfillments/pending-reconciliation", c.listPendingReconciliationHandler);
invoicingRouter.post(
  "/fulfillments/lines/:lineId/reconcile",
  requireTenantWritable,
  c.reconcileFulfillmentLineHandler,
);

invoicingRouter.post("/credit-notes", requireTenantWritable, c.createCreditNoteHandler);
invoicingRouter.get("/credit-notes", c.listCreditNotesHandler);
invoicingRouter.get("/credit-notes/next-number", c.nextCreditNoteNumberHandler);
invoicingRouter.post("/credit-notes/:id/void", requireTenantWritable, c.voidCreditNoteHandler);
invoicingRouter.post("/credit-notes/:id/convert", requireTenantWritable, c.convertCreditNoteHandler);

invoicingRouter.post("/debit-notes", requireTenantWritable, c.createDebitNoteHandler);
invoicingRouter.get("/debit-notes", c.listDebitNotesHandler);
invoicingRouter.get("/debit-notes/next-number", c.nextDebitNoteNumberHandler);
invoicingRouter.post("/debit-notes/:id/void", requireTenantWritable, c.voidDebitNoteHandler);
invoicingRouter.post("/debit-notes/:id/convert", requireTenantWritable, c.convertDebitNoteHandler);

invoicingRouter.get("/recurring-templates", c.listRecurringTemplatesHandler);
invoicingRouter.post("/recurring-templates", requireTenantWritable, c.createRecurringTemplateHandler);
invoicingRouter.patch("/recurring-templates/:id", requireTenantWritable, c.updateRecurringTemplateHandler);
invoicingRouter.delete("/recurring-templates/:id", requireTenantWritable, c.deleteRecurringTemplateHandler);
invoicingRouter.post(
  "/recurring-templates/:id/generate",
  requireTenantWritable,
  c.generateRecurringTemplateHandler,
);
invoicingRouter.patch(
  "/recurring-templates/:id/status",
  requireTenantWritable,
  c.setRecurringTemplateStatusHandler,
);
