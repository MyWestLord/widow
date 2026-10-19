// The whole brain is three lines:
//
//   if risk.flags > 1:  cut_thread()
//   if edge > 0.74:     snipe(size)
//   bag.secure(tp=[2.0, 3.5])
//
// Order matters: the rug check runs before the buy rule ever gets a vote,
// and the exit plan exists before the entry does.

const sig = (z) => 1 / (1 + Math.exp(-z));
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Heuristic edge in [0..1] from the first seconds of a launch.
// Not a prediction — a filter that says "this one is worth the risk budget".
export const WEIGHTS = { bias: -2.2, buyers: 1.1, flow: 0.9, volume: 0.8, growth: 1.0, devLow: 0.7, spread: 0.7, velocity: 0.6 };

export function edge(s, w = WEIGHTS) {
  const f = {
    buyers: clamp01(s.uniqueBuyers / 40),
    flow: clamp01(Math.log(Math.max(1, s.bsRatio)) / Math.log(4)),
    volume: clamp01(s.buyVol / 15),
    growth: clamp01((s.growth - 1) / 1.5),
    devLow: 1 - clamp01(s.devPct / 0.15),
    spread: 1 - clamp01(s.topBuyerShare / 0.3),
    velocity: clamp01(s.velocity / 4),
  };
  let z = w.bias;
  for (const k of Object.keys(f)) z += w[k] * f[k];
  return { edge: sig(z), features: f };
}

export function decide({ flags, edge: e }, cfg) {
  if (flags > cfg.maxFlags) return { action: 'cut', reason: `flags ${flags} > ${cfg.maxFlags}` };
  if (e > cfg.edgeMin) return { action: 'snipe', size: cfg.sizeSol, reason: `edge ${e.toFixed(2)} > ${cfg.edgeMin}` };
  return { action: 'pass', reason: `edge ${e.toFixed(2)} ≤ ${cfg.edgeMin}` };
}
