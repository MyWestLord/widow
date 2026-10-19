// Real-time pump.fun feed via PumpPortal's public websocket.
// One connection only — PumpPortal asks clients not to open many sockets.
// Docs: https://pumpportal.fun/data-api/real-time
import { EventEmitter } from 'node:events';

const URL = 'wss://pumpportal.fun/api/data';

export function normalize(m) {
  if (!m || typeof m !== 'object' || !m.mint) return null;
  const base = {
    mint: m.mint,
    trader: m.traderPublicKey,
    marketCapSol: Number(m.marketCapSol) || 0,
    vSol: Number(m.vSolInBondingCurve) || 0,
    pool: m.pool || 'pump',
    sig: m.signature,
  };
  if (m.txType === 'create') {
    return { type: 'create', ...base, dev: m.traderPublicKey, name: m.name || '', symbol: m.symbol || '', uri: m.uri || '',
      initialBuyTokens: Number(m.initialBuy) || 0, solAmount: Number(m.solAmount) || 0 };
  }
  if (m.txType === 'buy' || m.txType === 'sell') {
    return { type: 'trade', ...base, side: m.txType, tokenAmount: Number(m.tokenAmount) || 0, solAmount: Number(m.solAmount) || 0 };
  }
  if (m.txType === 'migrate' || m.txType === 'migration') return { type: 'migrate', ...base };
  return null;
}

export class PumpPortalFeed extends EventEmitter {
  constructor(clock) {
    super();
    this.clock = clock;
    this.tokens = new Set();
    this.accounts = new Set();
    this.backoff = 1;
    this.closed = false;
  }

  start() {
    if (typeof WebSocket === 'undefined') throw new Error('Node 22+ is required (global WebSocket)');
    const ws = (this.ws = new WebSocket(URL));
    ws.onopen = () => {
      this.backoff = 1;
      this.send({ method: 'subscribeNewToken' });
      this.send({ method: 'subscribeMigration' });
      if (this.tokens.size) this.send({ method: 'subscribeTokenTrade', keys: [...this.tokens] });
      if (this.accounts.size) this.send({ method: 'subscribeAccountTrade', keys: [...this.accounts] });
      this.emit('open');
    };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(typeof e.data === 'string' ? e.data : e.data.toString()); } catch { return; }
      const ev = normalize(m);
      if (ev) { ev.ts = this.clock.now(); this.emit('event', ev); }
    };
    ws.onclose = () => {
      if (this.closed) return;
      this.emit('status', `feed closed, reconnecting in ${this.backoff}s`);
      setTimeout(() => this.start(), this.backoff * 1000);
      this.backoff = Math.min(30, this.backoff * 2);
    };
    ws.onerror = () => {};
  }

  send(obj) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(obj)); }
  watchToken(mint) { if (!this.tokens.has(mint)) { this.tokens.add(mint); this.send({ method: 'subscribeTokenTrade', keys: [mint] }); } }
  unwatchToken(mint) { if (this.tokens.delete(mint)) this.send({ method: 'unsubscribeTokenTrade', keys: [mint] }); }
  watchAccount(acc) { if (acc && !this.accounts.has(acc)) { this.accounts.add(acc); this.send({ method: 'subscribeAccountTrade', keys: [acc] }); } }
  unwatchAccount(acc) { if (this.accounts.delete(acc)) this.send({ method: 'unsubscribeAccountTrade', keys: [acc] }); }
  stop() { this.closed = true; this.ws?.close(); }
}
