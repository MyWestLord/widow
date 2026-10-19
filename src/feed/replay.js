// Offline replay: a seeded, synthetic pump.fun market with the archetypes
// that matter — clean runners, duds, bundled launches, slow fades and the
// trick: a launch that looks clean until the dev wallet starts selling.
// Emits exactly the same normalized events as the live PumpPortal feed.
import { EventEmitter } from 'node:events';
import { mulberry32 } from '../util/clock.js';
import { encode } from '../util/base58.js';

const SUPPLY = 1e9;
const ORDER = ['dud', 'bundled', 'trick', 'runner', 'dud', 'fade', 'runner', 'bundled', 'dud', 'trick', 'runner', 'fade', 'dud', 'runner'];

export class ReplayFeed extends EventEmitter {
  constructor(clock, { seed = 7, launches = 14 } = {}) {
    super();
    this.clock = clock;
    this.rand = mulberry32(seed);
    this.n = launches;
    this.truth = new Map(); // mint → archetype (only rugcheck stub peeks at it)
  }

  addr(suffix = '') {
    const b = new Uint8Array(32);
    for (let i = 0; i < 32; i++) b[i] = Math.floor(this.rand() * 256);
    return encode(b).slice(0, 44 - suffix.length) + suffix;
  }

  start() {
    let t = 1;
    for (let i = 0; i < this.n; i++) {
      const kind = ORDER[i % ORDER.length];
      this.schedule(kind, t, i + 1);
      t += 7 + this.rand() * 9;
    }
    this.emit('open');
  }

  emitAt(t, ev) { this.clock.at(t, () => { ev.ts = this.clock.now(); this.emit('event', ev); }); }

  schedule(kind, t0, n) {
    const R = this.rand;
    const mint = this.addr('pump');
    const dev = this.addr();
    this.truth.set(mint, kind);
    const devPct = kind === 'bundled' ? 0.09 : 0.02 + R() * 0.05;
    let mcap = 28 + R() * 4;
    this.emitAt(t0, { type: 'create', mint, dev, trader: dev, name: `replay launch #${n}`, symbol: `SIM${n}`, uri: 'ipfs://sim',
      initialBuyTokens: devPct * SUPPLY, solAmount: devPct * 30, marketCapSol: mcap, vSol: 30, pool: 'pump' });

    // price path multiplier f(s) for s seconds after create
    const path = {
      runner: (s) => 1 + 3.4 * (1 - Math.exp(-s / 32)) + 0.12 * Math.sin(s / 3),
      dud: (s) => 1 + 0.15 * Math.min(1, s / 6) - 0.4 * Math.max(0, (s - 10) / 40),
      fade: (s) => 1 + 0.9 * Math.min(1, s / 10) - 1.1 * Math.max(0, (s - 12) / 60),
      bundled: (s) => (s < 1 ? 1.6 : 1.6 - 1.1 * Math.min(1, (s - 1) / 25)),
      trick: (s) => (s < 33 ? 1 + 1.3 * (1 - Math.exp(-s / 14)) : s < 35 ? 2.1 : 0.45),
    }[kind];
    const life = { runner: 150, dud: 45, fade: 90, bundled: 40, trick: 70 }[kind];
    const rate = { runner: 3.2, dud: 0.7, fade: 1.6, bundled: 1.2, trick: 3.6 }[kind];
    const pool = Array.from({ length: kind === 'dud' ? 9 : 70 }, () => this.addr());

    if (kind === 'bundled') { // 7 wallets buy in the first half-second
      for (let j = 0; j < 7; j++) {
        const s = 0.05 + j * 0.06;
        this.emitAt(t0 + s, { type: 'trade', mint, trader: pool[j], side: 'buy', tokenAmount: 0.035 * SUPPLY, solAmount: 1.1, marketCapSol: 30 * path(s), vSol: 30, pool: 'pump' });
      }
    }
    let s = 0.3;
    let prev = path(0);
    while (s < life) {
      s += -Math.log(1 - R()) / rate;
      const f = Math.max(0.05, path(s) * (1 + (R() - 0.5) * 0.04));
      const side = f >= prev ? (R() < 0.78 ? 'buy' : 'sell') : (R() < 0.3 ? 'buy' : 'sell');
      prev = f;
      mcap = 30 * f;
      const sol = 0.05 + R() * (kind === 'runner' || kind === 'trick' ? 1.4 : 0.7);
      this.emitAt(t0 + s, { type: 'trade', mint, trader: pool[Math.floor(R() * pool.length)], side, tokenAmount: (sol / mcap) * SUPPLY, solAmount: sol, marketCapSol: mcap, vSol: 30 + mcap / 6, pool: 'pump' });
    }
    if (kind === 'trick') { // dev sells a little, then everything
      this.emitAt(t0 + 32.2, { type: 'trade', mint, trader: dev, side: 'sell', tokenAmount: 0.006 * SUPPLY, solAmount: 0.3, marketCapSol: 30 * 2.05, vSol: 40, pool: 'pump' });
      this.emitAt(t0 + 34.8, { type: 'trade', mint, trader: dev, side: 'sell', tokenAmount: devPct * 0.95 * SUPPLY, solAmount: 2.1, marketCapSol: 30 * 0.45, vSol: 31, pool: 'pump' });
    }
  }

  // rugcheck stub with the kind of answers the real API gives
  rugcheck(mint) {
    const kind = this.truth.get(mint);
    const risks = [];
    if (kind === 'bundled') risks.push({ name: 'Top 10 holders high ownership', level: 'danger', score: 2400 }, { name: 'Single holder ownership', level: 'danger', score: 1800 });
    if (kind === 'dud') risks.push({ name: 'Low amount of LP Providers', level: 'warn', score: 400 });
    if (kind === 'trick') risks.push({ name: 'Low Liquidity', level: 'warn', score: 300 });
    return { ok: true, score: risks.reduce((a, r) => a + r.score, 1), risks };
  }

  watchToken() {} unwatchToken() {} watchAccount() {} unwatchAccount() {} stop() {}
}
