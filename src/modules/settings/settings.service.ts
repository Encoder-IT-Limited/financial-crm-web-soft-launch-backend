import { publicPrisma } from "../../db/publicPrisma";

export const LEGAL_FALLBACK = {
  privacyBody: `
<p>This Privacy Policy explains how MRM Portal (“we”, “us”) collects, uses, and protects information when you use our multi-tenant business management platform.</p>
<h2>Information we collect</h2>
<p>We collect account and company details you provide at signup or that an administrator enters (name, email, company name, billing contacts); operational data you create in the product (invoices, payments, inventory, POS sales, and related records); files you upload; and technical data such as IP address, browser, and device information used for security, audit, and support.</p>
<h2>How we use it</h2>
<p>We use this information to provide and operate the service, authenticate users, process subscriptions and seat changes, secure your account, diagnose issues, respond to support requests, and meet legal or regulatory obligations that apply to us or to your organization.</p>
<h2>Data isolation</h2>
<p>Each tenant’s business data is stored in a logically isolated tenant schema and is not visible to other customers. Platform staff access tenant data only as needed for support, billing, security, or legal compliance, and that access is logged.</p>
<h2>Sharing</h2>
<p>We do not sell your business data. We may share information with infrastructure and payment processors that help us run the service, or when required by law. Those processors may only use the data to provide their service to us.</p>
<h2>Data retention</h2>
<p>Data is retained for the life of an active subscription. If a subscription is cancelled or marked for deletion, data remains recoverable for a defined grace period (currently 60 days unless your plan states otherwise) and is then permanently removed from production systems.</p>
<h2>Security</h2>
<p>We use authentication, encrypted transport, tenant isolation, and role-based access controls. You are responsible for choosing strong passwords and for activity under accounts created in your organization.</p>
<h2>Your rights</h2>
<p>Tenant owners can export or update company and user records from the product. To request access, correction, or deletion of personal data we hold about you as an individual, contact support. We will respond within a reasonable period and as required by applicable law.</p>
<h2>Contact</h2>
<p>Questions about this policy can be sent to <a href="mailto:support@mrmportal.com">support@mrmportal.com</a>.</p>
`.trim(),
  termsBody: `
<p>These Terms of Service govern access to MRM Portal, a subscription-based platform for invoicing, inventory, POS, and related business operations.</p>
<h2>The service</h2>
<p>We provide the software as a hosted service. Module availability depends on the subscription plan you purchase. We may update features, provided the core service remains reasonably consistent with your plan.</p>
<h2>Accounts and seats</h2>
<p>Each tenant has an owner account. Your plan includes a base number of user seats; additional seats may be purchased. You are responsible for users you invite, for keeping credentials confidential, and for all activity under your organization.</p>
<h2>Subscription and payment</h2>
<p>Subscriptions renew on the monthly or yearly cycle you select until cancelled. If payment fails or a subscription lapses, the tenant may move to a read-only state: existing data remains viewable and exportable, but new transactions cannot be created until billing is resolved.</p>
<h2>Data ownership</h2>
<p>You retain ownership of the business data you enter. MRM Portal processes that data on your behalf to provide the service. We do not claim ownership of your invoices, inventory, or customer records.</p>
<h2>Acceptable use</h2>
<p>You may not misuse the service, attempt to access another tenant’s data, interfere with security or availability, or use the platform for unlawful activity. We may suspend access to protect the service or other customers.</p>
<h2>Termination</h2>
<p>Either party may terminate the subscription. After cancellation, data is retained for a defined grace period (currently 60 days unless your plan states otherwise) before deletion. You should export any records you need before that period ends.</p>
<h2>Liability</h2>
<p>The service is provided as-is for business use. To the extent permitted by law, our liability is limited to the subscription fees you paid in the three months before a claim. We are not liable for lost profits or data except where caused by our willful misconduct.</p>
<h2>Contact</h2>
<p>Questions about these terms can be sent to <a href="mailto:support@mrmportal.com">support@mrmportal.com</a>.</p>
`.trim(),
  privacyLastUpdated: "28 August 2026",
  termsLastUpdated: "28 August 2026",
};

export type SettingsUpdateInput = {
  platformName?: string;
  primaryColor?: string | null;
  retentionDays?: number;
  seatLimitMessage?: string;
  maintenanceMode?: boolean;
  maintenanceMessage?: string | null;
  tagline?: string | null;
  logoUrl?: string | null;
  contactEmail?: string | null;
  currency?: string;
  privacyBody?: string | null;
  termsBody?: string | null;
  privacyLastUpdated?: string | null;
  termsLastUpdated?: string | null;
  linkedin?: string | null;
  twitter?: string | null;
  instagram?: string | null;
};

export async function getSettings() {
  const row =
    (await publicPrisma.platformSettings.findUnique({ where: { id: "default" } })) ??
    (await publicPrisma.platformSettings.create({ data: { id: "default" } }));
  return row;
}

export async function updateSettings(input: SettingsUpdateInput) {
  return publicPrisma.platformSettings.upsert({
    where: { id: "default" },
    create: { id: "default", ...input },
    update: input,
  });
}

/** Unauthenticated payload for the marketing site. */
export async function getPublicSettings() {
  const row = await getSettings();
  return {
    platformName: row.platformName,
    logoUrl: row.logoUrl ?? "",
    tagline: row.tagline ?? "",
    contactEmail: row.contactEmail ?? "",
    currency: (row.currency ?? "AED").toUpperCase(),
    maintenanceMode: row.maintenanceMode,
    maintenanceMessage: row.maintenanceMessage ?? "",
    privacyBody: row.privacyBody ?? LEGAL_FALLBACK.privacyBody,
    termsBody: row.termsBody ?? LEGAL_FALLBACK.termsBody,
    privacyLastUpdated: row.privacyLastUpdated ?? LEGAL_FALLBACK.privacyLastUpdated,
    termsLastUpdated: row.termsLastUpdated ?? LEGAL_FALLBACK.termsLastUpdated,
    socialLinks: {
      linkedin: row.linkedin ?? "",
      twitter: row.twitter ?? "",
      instagram: row.instagram ?? "",
    },
  };
}
