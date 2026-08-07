import { addMoney, money, subMoney, type CurrencyCode, type Money } from "@ffos/domain";

export type NetWorthInput = {
  cash: Money;
  investments: Money;
  assets: Money;
  liabilities: Money;
};

export function calculateNetWorth(input: NetWorthInput): Money {
  const assets = addMoney(addMoney(input.cash, input.investments), input.assets);
  return subMoney(assets, input.liabilities);
}

export function zeroMoney(currency: CurrencyCode): Money {
  return money(0n, currency);
}
