// Two traders with one interface. Paper fills at the feed price with modelled
// slippage + the 1% pump.fun fee. Live builds the transaction with PumpPortal's
// Local Transaction API, signs it locally (your key never leaves the machine)
// and sends it through YOUR RPC.
// Docs: https://pumpportal.fun/local-trading-api/trading-api
import { decode } from '../util/base58.js';

export class PaperTrader {
  constructor(cfg) { this.cfg = cfg; this.kind = 'paper'; }
  async init() { return { pub: 'paper-wallet', balance: 10 }; }
  async buy(mint, sol, mcap) { return { sig: 'paper', fillMcap: mcap * 1.02 }; }
  async sell(mint, pct, mcap) { return { sig: 'paper', fillMcap: mcap * 0.98 }; }
}

export class LiveTrader {
  constructor(cfg) { this.cfg = cfg; this.kind = 'live'; }

  async init() {
    try { this.w3 = await import('@solana/web3.js'); } catch { throw new Error('live mode needs @solana/web3.js → run `npm install`'); }
    this.kp = this.w3.Keypair.fromSecretKey(decode(this.cfg.wallet));
    this.conn = new this.w3.Connection(this.cfg.rpcUrl, 'confirmed');
    this.pub = this.kp.publicKey.toBase58();
    const balance = (await this.conn.getBalance(this.kp.publicKey)) / 1e9;
    return { pub: this.pub, balance };
  }

  async balance() { return (await this.conn.getBalance(this.kp.publicKey)) / 1e9; }

  async trade(body) {
    const res = await fetch('https://pumpportal.fun/api/trade-local', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicKey: this.pub, slippage: this.cfg.slippagePct, priorityFee: this.cfg.priorityFeeSol, pool: this.cfg.pool, ...body }),
    });
    if (res.status !== 200) throw new Error(`pumpportal ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const tx = this.w3.VersionedTransaction.deserialize(new Uint8Array(await res.arrayBuffer()));
    tx.sign([this.kp]);
    const sig = await this.conn.sendTransaction(tx, { skipPreflight: false, maxRetries: 2 });
    await this.confirm(sig);
    return sig;
  }

  async confirm(sig, timeoutMs = 45000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const { value } = await this.conn.getSignatureStatuses([sig]);
      const st = value?.[0];
      if (st?.err) throw new Error(`tx failed: ${JSON.stringify(st.err)}`);
      if (st && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized')) return;
      await new Promise((r) => setTimeout(r, 1200));
    }
    throw new Error(`tx not confirmed in ${timeoutMs / 1000}s: ${sig}`);
  }

  async buy(mint, sol, mcap) { return { sig: await this.trade({ action: 'buy', mint, amount: sol, denominatedInSol: 'true' }), fillMcap: mcap }; }
  async sell(mint, pct, mcap) { return { sig: await this.trade({ action: 'sell', mint, amount: `${pct}%`, denominatedInSol: 'false' }), fillMcap: mcap }; }
}
