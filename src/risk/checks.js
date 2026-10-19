// The gate: every launch has to walk across these checks before the brain
// even looks at the edge. A failed check lowers the gate count; a *flag* is a
// failed check bad enough that WIDOW will not hold the token at all.
export const SUPPLY = 1e9;

export function stats(L) {
  const buys = L.trades.filter((t) => t.side === 'buy');
  const sells = L.trades.filter((t) => t.side === 'sell');
  const byWallet = new Map();
  for (const t of buys) if (t.trader !== L.dev) byWallet.set(t.trader, (byWallet.get(t.trader) || 0) + t.tokenAmount);
  const early = buys.filter((t) => t.trader !== L.dev && t.ts - L.createdAt <= 1.0).length;
  const buyVol = buys.reduce((a, t) => a + t.solAmount, 0);
  const sellVol = sells.reduce((a, t) => a + t.solAmount, 0);
  const elapsed = Math.max(1, (L.trades.at(-1)?.ts ?? L.createdAt) - L.createdAt);
  const vSol = L.lastVSol || 0;
  return {
    buys: buys.length, sells: sells.length, buyVol, sellVol,
    uniqueBuyers: byWallet.size,
    topBuyerShare: byWallet.size ? Math.max(...byWallet.values()) / SUPPLY : 0,
    early,
    devPct: L.devTokens / SUPPLY,
    devSold: L.devSold,
    growth: L.lastMcap / Math.max(1e-9, L.mcap0),
    mcap: L.lastMcap,
    velocity: L.trades.length / elapsed,
    bsRatio: buyVol / Math.max(0.05, sellVol),
    curve: vSol > 0 ? Math.max(0, Math.min(1, (vSol - 30) / 85)) : 0, // approx bonding-curve progress
  };
}

export function runChecks(L, rc) {
  const s = stats(L);
  const danger = (rc?.risks || []).filter((r) => String(r.level).toLowerCase() === 'danger');
  const warn = (rc?.risks || []).filter((r) => String(r.level).toLowerCase() === 'warn');
  const has = (re) => (rc?.risks || []).some((r) => re.test(r.name || ''));
  const C = [
    ['rugcheck answered', !!rc?.ok, !rc?.ok, rc?.ok ? 'ok' : rc?.error],
    ['no danger risks', danger.length === 0, false, danger.map((r) => r.name).join(', ') || 'none'],
    ['≤ 2 warn risks', warn.length <= 2, false, `${warn.length} warn`],
    ['mint authority revoked', !has(/mint authority/i), has(/mint authority/i), ''],
    ['freeze authority revoked', !has(/freeze authority/i), has(/freeze authority/i), ''],
    ['dev bought < 8% supply', s.devPct < 0.08, s.devPct >= 0.15, `${(s.devPct * 100).toFixed(1)}%`],
    ['dev has not sold', !s.devSold, s.devSold, s.devSold ? 'DEV SOLD' : 'holding'],
    ['no bundle (≤ 3 buys in 1s)', s.early <= 3, s.early >= 6, `${s.early} early buys`],
    ['top buyer < 6% supply', s.topBuyerShare < 0.06, s.topBuyerShare >= 0.12, `${(s.topBuyerShare * 100).toFixed(1)}%`],
    ['≥ 12 unique buyers', s.uniqueBuyers >= 12, false, `${s.uniqueBuyers}`],
    ['buy/sell volume ≥ 1.5', s.bsRatio >= 1.5, false, s.bsRatio.toFixed(2)],
    ['≥ 3 SOL bought', s.buyVol >= 3, false, `${s.buyVol.toFixed(2)} SOL`],
    ['mcap grew ≥ 1.2x', s.growth >= 1.2, false, `${s.growth.toFixed(2)}x`],
    ['not late (mcap < 250 SOL)', s.mcap < 250, false, `${s.mcap.toFixed(0)} SOL`],
    ['≥ 1 trade / sec', s.velocity >= 1, false, `${s.velocity.toFixed(2)}/s`],
    ['has name & symbol', !!(L.name && L.symbol), false, `${L.symbol}`],
    ['has metadata uri', !!L.uri, false, ''],
    ['curve < 85% (no pre-migration chase)', s.curve < 0.85, false, `${Math.round(s.curve * 100)}%`],
  ].map(([name, pass, flag, detail]) => ({ name, pass: !!pass, flag: !!flag, detail }));
  // each rugcheck "danger" risk is its own flag
  const flags = C.filter((c) => c.flag).length + danger.length;
  return { checks: C, passed: C.filter((c) => c.pass).length, total: C.length, flags, stats: s };
}
