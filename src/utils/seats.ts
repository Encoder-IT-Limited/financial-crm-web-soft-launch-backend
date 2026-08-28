/** Seat occupancy is stored on the role row (`countsTowardSeats`). */

export function occupiesSeat(status: string): boolean {
  return status === "ACTIVE" || status === "INVITED";
}

export function usedSeats(users: { status: string; countsTowardSeats: boolean }[]): number {
  return users.filter((u) => occupiesSeat(u.status) && u.countsTowardSeats).length;
}
