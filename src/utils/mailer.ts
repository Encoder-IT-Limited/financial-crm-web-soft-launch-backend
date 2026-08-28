import { logger } from "./logger";

export type InviteMail = {
  to: string;
  tenantName: string;
  acceptUrl: string;
};

export interface MailPort {
  sendInvite(msg: InviteMail): Promise<{ sent: boolean }>;
}

class LogMailer implements MailPort {
  async sendInvite(msg: InviteMail): Promise<{ sent: boolean }> {
    logger.info({ to: msg.to, tenantName: msg.tenantName, acceptUrl: msg.acceptUrl }, "Invite email skipped (no SMTP)");
    return { sent: false };
  }
}

export function createMailPort(): MailPort {
  if (process.env.SMTP_HOST) {
    logger.warn("SMTP_HOST is set but no SMTP adapter is wired yet — falling back to log mailer");
  }
  return new LogMailer();
}

export const mailer: MailPort = createMailPort();
