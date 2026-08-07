import { moneyFromJson, type MoneyJson } from "@ffos/domain";
import { formatMoney } from "@ffos/utils";

export function MoneyValue({
  value,
  signed = false,
  className = "",
}: {
  value: MoneyJson;
  signed?: boolean;
  className?: string;
}) {
  const text = formatMoney(moneyFromJson(value), "sv-SE", { signed });
  return <span className={`tabular-nums ${className}`}>{text}</span>;
}
