// RugCheck (https://rugcheck.xyz) token report summary.
// GET https://api.rugcheck.xyz/v1/tokens/{mint}/report/summary
// → { score, score_normalised, risks: [{ name, value, description, score, level }] }
// "unknown" is never treated as "safe": if the API can't answer, that counts as a flag.
const BASE = 'https://api.rugcheck.xyz/v1/tokens';
const cache = new Map();

export async function rugcheck(mint, { timeoutMs = 4000, retries = 2 } = {}) {
  if (cache.has(mint)) return cache.get(mint);
  for (let a = 0; a <= retries; a++) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      const res = await fetch(`${BASE}/${mint}/report/summary`, { signal: ctl.signal, headers: { accept: 'application/json' } });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 600 * (a + 1))); continue; }
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, risks: [] };
      const j = await res.json();
      const out = { ok: true, score: Number(j.score ?? j.score_normalised ?? 0), risks: Array.isArray(j.risks) ? j.risks : [] };
      cache.set(mint, out);
      return out;
    } catch (e) {
      if (a === retries) return { ok: false, error: e.name === 'AbortError' ? 'timeout' : e.message, risks: [] };
    }
  }
  return { ok: false, error: 'rate limited', risks: [] };
}
