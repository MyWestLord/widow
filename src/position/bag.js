// bag.secure(): every position is born with its exit plan.
// TP ladder steps sell a % of what is left; stop and time-stop sell the rest;
// a dev-wallet sell cuts the thread immediately.
export class Bag {
  constructor({ mint, symbol, entryMcap, sizeSol, openedAt, ladder, stopX, maxHoldSec }) {
    Object.assign(this, { mint, symbol, entryMcap, sizeSol, openedAt, ladder, stopX, maxHoldSec });
    this.left = 1; // fraction of the original bag still held
    this.step = 0;
    this.proceeds = 0;
    this.closed = false;
    this.events = [];
  }

  x(mcap) { return mcap / this.entryMcap; }

  // returns sell orders: [{ pct, reason }], pct = % of what is left
  tick(mcap, now) {
    if (this.closed) return [];
    const x = this.x(mcap);
    const out = [];
    while (this.step < this.ladder.length && x >= this.ladder[this.step].x) {
      const st = this.ladder[this.step++];
      out.push({ pct: st.pct, reason: `TP${this.step} ${st.x.toFixed(1)}x` });
      if (st.pct >= 100) break;
    }
    if (!out.length && x <= this.stopX) out.push({ pct: 100, reason: `stop ${x.toFixed(2)}x ≤ ${this.stopX}x` });
    if (!out.length && now - this.openedAt >= this.maxHoldSec) out.push({ pct: 100, reason: `time stop ${this.maxHoldSec}s` });
    return out;
  }

  cutThread(reason) { return this.closed ? [] : [{ pct: 100, reason: `cut_thread · ${reason}` }]; }

  // book a fill: sold `pct` of what was left at multiple `x` (after fees)
  fill(pct, x, feePct = 1) {
    const frac = this.left * (pct / 100);
    this.left -= frac;
    const got = frac * this.sizeSol * x * (1 - feePct / 100);
    this.proceeds += got;
    if (this.left < 1e-6) { this.left = 0; this.closed = true; }
    return got;
  }

  pnl(markX = 0) { return this.proceeds + this.left * this.sizeSol * markX - this.sizeSol; }
}
