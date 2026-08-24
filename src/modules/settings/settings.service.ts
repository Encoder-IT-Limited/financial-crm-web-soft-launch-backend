import { publicPrisma } from "../../db/publicPrisma";

export async function getSettings() {
  const row =
    (await publicPrisma.platformSettings.findUnique({ where: { id: "default" } })) ??
    (await publicPrisma.platformSettings.create({ data: { id: "default" } }));
  return row;
}

export async function updateSettings(input: {
  platformName?: string;
  primaryColor?: string | null;
  retentionDays?: number;
  seatLimitMessage?: string;
  maintenanceMode?: boolean;
  maintenanceMessage?: string | null;
}) {
  return publicPrisma.platformSettings.upsert({
    where: { id: "default" },
    create: { id: "default", ...input },
    update: input,
  });
}
