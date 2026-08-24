export type Me = {
  id: string;
  name: string;
  email: string;
  realm: "admin" | "tenant";
  permissions: string[];
  tenant?: {
    id: string;
    name: string;
    subdomain: string;
    plan: string;
    activeModules: string[];
    legalName?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    taxNumber?: string | null;
    currency?: string | null;
  };
};
