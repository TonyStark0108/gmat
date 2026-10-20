// What the tutor costs: from each reply's token counts, at Claude Opus 5.5's published rates
// ($4 per million input tokens, $20 output, $0.20 cache reads; a 5-minute cache write is 1.25×
// input). A reply served by a fallback model is priced the same way, so the figure is approximate.

export const PRICES = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 }; // US$ per million tokens

export interface Usage { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }

export function costOf(u: Usage): { input: number; output: number; cacheRead: number; cacheWrite: number; usd: number } {
  const input = u.input_tokens ?? 0, output = u.output_tokens ?? 0, cacheRead = u.cache_read_input_tokens ?? 0, cacheWrite = u.cache_creation_input_tokens ?? 0;
  const usd = (input * PRICES.input + output * PRICES.output + cacheRead * PRICES.cacheRead + cacheWrite * PRICES.cacheWrite) / 1_000_000;
  return { input, output, cacheRead, cacheWrite, usd: Math.round(usd * 10_000) / 10_000 };
}

export const DEFAULT_MONTHLY_CAP = 15;

export function spentThisMonth(spend: Map<string, number>, today: string): number {
  return Math.round((spend.get(today.slice(0, 7)) ?? 0) * 100) / 100;
}

export function overCap(spend: Map<string, number>, today: string, cap: number): boolean {
  return cap > 0 && spentThisMonth(spend, today) >= cap;
}
