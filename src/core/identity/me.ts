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
  };
};
