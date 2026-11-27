const UNITS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86_400 };

/** "15m" → 900. Формат уже перевірений схемою env, але функція захищається й сама. */
export function ttlToSeconds(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  const unit = match?.[2] === undefined ? undefined : UNITS[match[2]];
  if (match?.[1] === undefined || unit === undefined) {
    throw new Error(`Invalid TTL "${ttl}"`);
  }
  return Number(match[1]) * unit;
}
