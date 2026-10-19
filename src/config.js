// Config: .env file (tiny parser, no deps) → process.env → CLI flags.
import { readFileSync, existsSync } from 'node:fs';

export function loadDotEnv(path = '.env') {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (!(k in process.env)) process.env[k] = v;
  }
}

export function parseLadder(s) {
  // "2.0:50,3.5:100" → [{ x: 2, pct: 50 }, { x: 3.5, pct: 100 }]
  return String(s).split(',').map((p) => {
    const [x, pct] = p.split(':').map(Number);
    if (!(x > 1) || !(pct > 0 && pct <= 100)) throw new Error(`bad TP_LADDER step "${p}"`);
    return { x, pct };
  }).sort((a, b) => a.x - b.x);
}

function argv() {
  const out = {};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith('--')) {
      const k = a[i].slice(2);
      const v = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : 'true';
      out[k] = v;
    }
  }
  return out;
}

export function loadConfig(overrides = {}) {
  loadDotEnv();
  const e = process.env;
  const cli = argv();
  const num = (k, d) => (e[k] !== undefined && e[k] !== '' ? Number(e[k]) : d);
  const cfg = {
    mode: cli.mode || e.WIDOW_MODE || 'paper',
    speed: Number(cli.speed || 1),
    seed: Number(cli.seed || 7),
    launches: Number(cli.launches || 14),
    wallet: e.WALLET_PRIVATE_KEY || '',
    rpcUrl: e.RPC_URL || 'https://api.mainnet-beta.solana.com',
    liveConfirm: e.LIVE_CONFIRM || '',
    maxFlags: num('MAX_FLAGS', 1),
    edgeMin: num('EDGE_MIN', 0.74),
    sizeSol: num('SIZE_SOL', 0.1),
    ladder: parseLadder(e.TP_LADDER || '2.0:50,3.5:100'),
    stopX: num('STOP_X', 0.6),
    maxHoldSec: num('MAX_HOLD_SEC', 600),
    slippagePct: num('SLIPPAGE_PCT', 15),
    priorityFeeSol: num('PRIORITY_FEE_SOL', 0.0005),
    pool: e.POOL || 'auto',
    maxOpen: num('MAX_OPEN_POSITIONS', 2),
    maxDailyLossSol: num('MAX_DAILY_LOSS_SOL', 0.3),
    watchSec: num('WATCH_SEC', 8),
    ...overrides,
  };
  if (!['replay', 'paper', 'live'].includes(cfg.mode)) throw new Error(`unknown mode "${cfg.mode}"`);
  if (cfg.mode === 'live') {
    if (cfg.liveConfirm !== 'I_UNDERSTAND_THE_RISK') throw new Error('live mode needs LIVE_CONFIRM=I_UNDERSTAND_THE_RISK in .env');
    if (!cfg.wallet) throw new Error('live mode needs WALLET_PRIVATE_KEY in .env');
  }
  return cfg;
}
