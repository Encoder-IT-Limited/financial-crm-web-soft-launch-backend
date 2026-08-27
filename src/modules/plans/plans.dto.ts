export type PlanDto = {
  id: string;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  baseSeats: number;
  additionalSeatPrice: number;
  trialDays: number;
  minSeats: number;
  maxSeats: number | null;
  salesAssisted: boolean;
  modules: string[];
  popular: boolean;
  status: string;
};
