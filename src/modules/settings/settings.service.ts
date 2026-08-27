import { publicPrisma } from "../../db/publicPrisma";

const LEGAL_FALLBACK = {
  privacyBody:
    "<p>This is a placeholder Privacy Policy. The final text will be reviewed and provided by legal before launch.</p>",
  termsBody:
    "<p>This is a placeholder Terms of Service. The final text will be reviewed and provided by legal before launch.</p>",
  privacyLastUpdated: "Draft — not yet published",
  termsLastUpdated: "Draft — not yet published",
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
