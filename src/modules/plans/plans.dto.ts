export type PlanDto = {
  id: string;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  baseSeats: number;
  additionalSeatPrice: number;
  trialDays: number;
  modules: string[];
  popular: boolean;
  status: string;
};
