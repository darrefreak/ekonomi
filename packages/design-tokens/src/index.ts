export const semanticColors = [
  "surface",
  "surfaceMuted",
  "surfaceElevated",
  "border",
  "borderStrong",
  "textPrimary",
  "textSecondary",
  "textMuted",
  "positive",
  "negative",
  "warning",
  "info",
  "accent",
] as const;

export type SemanticColor = (typeof semanticColors)[number];
