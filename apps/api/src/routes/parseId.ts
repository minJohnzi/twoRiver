export function parseId(id: string): number | undefined {
  const parsed = Number(id);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
