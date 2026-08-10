import Link from "next/link";

const householdLinks = [
  { href: "/vehicles", label: "Översikt" },
  { href: "/vehicles/market", label: "Marknad" },
  { href: "/vehicles/candidates", label: "Kandidater" },
  { href: "/vehicles/compare", label: "Jämför" },
] as const;

export function VehicleHouseholdNav({ active }: { active?: string }) {
  return (
    <nav className="flex flex-wrap gap-3 text-sm">
      {householdLinks.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={
            active === l.href
              ? "font-medium text-accent"
              : "text-text-secondary hover:text-accent"
          }
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

export function VehicleDetailNav({
  vehicleId,
  active,
}: {
  vehicleId: string;
  active: "overview" | "costs" | "maintenance" | "valuation" | "replacement";
}) {
  const links = [
    { key: "overview" as const, href: `/vehicles/${vehicleId}`, label: "Översikt" },
    { key: "costs" as const, href: `/vehicles/${vehicleId}/costs`, label: "Kostnader" },
    {
      key: "maintenance" as const,
      href: `/vehicles/${vehicleId}/maintenance`,
      label: "Underhåll",
    },
    {
      key: "valuation" as const,
      href: `/vehicles/${vehicleId}/valuation`,
      label: "Värdering",
    },
    {
      key: "replacement" as const,
      href: `/vehicles/${vehicleId}/replacement`,
      label: "Byte / sälj",
    },
  ];
  return (
    <nav className="flex flex-wrap gap-3 text-sm">
      {links.map((l) => (
        <Link
          key={l.key}
          href={l.href}
          className={
            active === l.key
              ? "font-medium text-accent"
              : "text-text-secondary hover:text-accent"
          }
        >
          {l.label}
        </Link>
      ))}
      <Link
        href={`/vehicles/compare?vehicleId=${vehicleId}`}
        className="text-text-secondary hover:text-accent"
      >
        Jämför →
      </Link>
    </nav>
  );
}
