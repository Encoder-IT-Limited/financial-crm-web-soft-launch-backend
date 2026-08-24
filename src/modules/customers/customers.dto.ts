export type CustomerDto = {
  id: string;
  customerCode: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxNumber: string | null;
  creditLimit: number;
  openingBalance: number;
  status: string;
};
