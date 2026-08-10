export type Brand<T, B extends string> = T & { readonly __brand: B };

export type UserId = Brand<string, "UserId">;
export type HouseholdId = Brand<string, "HouseholdId">;
export type HouseholdMemberId = Brand<string, "HouseholdMemberId">;
export type AccountId = Brand<string, "AccountId">;
export type TransactionId = Brand<string, "TransactionId">;
export type VehicleId = Brand<string, "VehicleId">;

export function asUserId(id: string): UserId {
  return id as UserId;
}

export function asHouseholdId(id: string): HouseholdId {
  return id as HouseholdId;
}

export function asHouseholdMemberId(id: string): HouseholdMemberId {
  return id as HouseholdMemberId;
}
