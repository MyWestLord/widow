// The colony: one queen, sixteen jobs. Each spider owns one step of the
// pipeline and signs every line it prints, so the terminal reads like the video.
import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { c, say } from './log.js';
import { runChecks } from './risk/checks.js';
import { rugcheck as realRugcheck } from './risk/rugcheck.js';
import { edge as edgeOf, decide } from './brain/brain.js';
import { Bag } from './position/bag.js';

export const JOBS = [
  ['QUEEN', 'org'], ['SCAN', 'org'], ['KOTH', 'can'], ['TREND', 'plum'], ['VET', 'amb'], ['CURVE', 'org'], ['BUNDLE', 'pink'], ['RUG', 'org'],
  ['HOLD', 'pink'], ['LP', 'pur'], ['SCORE', 'grn'], ['ROUTE', 'amb'], ['GATE', 'grn'], ['SIZE', 'can'], ['SNIPE', 'teal'], ['BAG', 'can'],
];

export class Colony {
  constructor({ cfg, feed, trader, clock, rugcheck }) {
    Object.assign(this, { cfg, feed, trader, clock });
    this.rugcheck = rugcheck || realRugcheck;
    this.s = Object.fromEntries(JOBS.map(([job, col], id) => [job, { id, job, paint: c[col] }]));
    this.watch = new Map(); // mint → launch
    this.bags = new Map(); // mint → Bag
    this.stats = { seen: 0, cut: 0, passed: 0, sniped: 0, closed: 0, wins: 0, rugsDodged: 0, pnl: 0, skippedFull: 0 };
    this.maxWatch = 6;
    this.journalOn = cfg.mode !== 'replay';
  }

  hatch() {
    say(null, c.org('the web wakes') + c.gray(' · pump.fun · raydium · X trends → one web'));
    for (let n = 1; n <= 16; n *= 2) {
      const born = JOBS.slice(n === 1 ? 0 : n / 2, n).map(([j]) => this.s[j].paint(j)).join(c.gray(' · '));
      say(null, `${c.plum('hatch')} ${String(n).padStart(2)} spider${n > 1 ? 's' : ' '}  ${born}`);
    }
  }

  journal(rec) {
    if (!this.journalOn) return;
    if (!existsSync('journal')) mkdirSync('journal');
    appendFileSync(`journal/${new Date().toISOString().slice(0, 10)}.jsonl`, JSON.stringify({ t: new Date().toISOString(), mode: this.cfg.mode, ...rec }) + '\n');
  }

  onEvent(ev) {
    if (ev.type === 'create') return this.onCreate(ev);
    if (ev.type === 'trade') return this.onTrade(ev);
    if (ev.type === 'migrate' && (this.watch.has(ev.mint) || this.bags.has(ev.mint))) say(this.s.LP, `${ev.mint.slice(0, 6)}… migrated → ${c.teal('raydium / pump-amm')} · ROUTE switches pool`);
  }

  onCreate(ev) {
    this.stats.seen++;
    if (this.watch.size >= this.maxWatch) { this.stats.skippedFull++; return; }
    const L = { mint: ev.mint, dev: ev.dev, name: ev.name, symbol: ev.symbol, uri: ev.uri, createdAt: ev.ts, mcap0: ev.marketCapSol || 28,
      lastMcap: ev.marketCapSol || 28, lastVSol: ev.vSol, devTokens: ev.initialBuyTokens || 0, devSold: false, trades: [] };
    this.watch.set(L.mint, L);
    this.feed.watchToken(L.mint);
    this.feed.watchAccount(L.dev);
    say(this.s.SCAN, `new launch ${c.bone('$' + (L.symbol || '?'))} ${c.gray(L.mint.slice(0, 6) + '…')}  mc ${L.mcap0.toFixed(1)} SOL  dev buy ${(L.devTokens / 1e7).toFixed(1)}%`);
    this.clock.after(this.cfg.watchSec, () => this.evaluate(L));
  }

  async onTrade(ev) {
    const L = this.watch.get(ev.mint);
    if (!L) return;
    L.trades.push(ev);
    if (ev.marketCapSol) L.lastMcap = ev.marketCapSol;
    if (ev.vSol) L.lastVSol = ev.vSol;
    if (ev.trader === L.dev && ev.side === 'sell') {
      L.devSold = true;
      const bag = this.bags.get(L.mint);
      if (bag && !bag.closed) {
        say(this.s.VET, c.red(`dev wallet SOLD on $${L.symbol} · the web trembles`));
        await this.sell(L, bag, bag.cutThread('dev sold'), true);
        return;
      }
    }
    const bag = this.bags.get(L.mint);
    if (bag && !bag.closed) await this.sell(L, bag, bag.tick(L.lastMcap, this.clock.now()));
  }

  async evaluate(L) {
    if (!this.watch.has(L.mint)) return;
    const rc = await this.rugcheck(L.mint);
    const g = runChecks(L, rc);
    const { edge } = edgeOf(g.stats);
    say(this.s.RUG, `$${L.symbol} rugcheck ${rc.ok ? c.grn('ok') : c.red(rc.error)} · ${rc.risks.length} risks${rc.risks.length ? c.gray(' (' + rc.risks.map((r) => r.name).slice(0, 2).join(', ') + ')') : ''}`);
    const bad = g.checks.filter((x) => !x.pass).map((x) => (x.flag ? c.red('✗ ' + x.name) : c.gray('· ' + x.name)));
    say(this.s.GATE, `$${L.symbol} ${g.passed === g.total ? c.grn(`${g.passed}/${g.total}`) : c.can(`${g.passed}/${g.total}`)} checks · flags ${g.flags > this.cfg.maxFlags ? c.red(g.flags) : c.grn(g.flags)}${bad.length ? '  ' + bad.slice(0, 3).join('  ') : ''}`);
    say(this.s.SCORE, `$${L.symbol} edge ${edge > this.cfg.edgeMin ? c.grn(edge.toFixed(2)) : c.gray(edge.toFixed(2))} ${c.gray(`(buyers ${g.stats.uniqueBuyers} · ${g.stats.growth.toFixed(2)}x · ${g.stats.buyVol.toFixed(1)} SOL in)`)}`);
    const d = decide({ flags: g.flags, edge }, this.cfg);
    this.journal({ kind: 'decision', mint: L.mint, symbol: L.symbol, passed: g.passed, total: g.total, flags: g.flags, edge, action: d.action, reason: d.reason });
    if (d.action === 'cut') {
      this.stats.cut++;
      say(this.s.QUEEN, `${c.red('✂ cut_thread()')} $${L.symbol} · ${d.reason} · not touching it`);
      return this.drop(L);
    }
    if (d.action === 'pass') {
      this.stats.passed++;
      say(this.s.QUEEN, c.gray(`pass $${L.symbol} · ${d.reason}`));
      return this.drop(L);
    }
    await this.snipe(L, edge);
  }

  async snipe(L, edge) {
    const open = [...this.bags.values()].filter((b) => !b.closed).length;
    if (existsSync('STOP')) { say(this.s.SIZE, c.red('STOP file present · no new entries')); return this.drop(L); }
    if (open >= this.cfg.maxOpen) { say(this.s.SIZE, c.can(`max ${this.cfg.maxOpen} open bags · skip $${L.symbol}`)); return this.drop(L); }
    if (this.stats.pnl <= -this.cfg.maxDailyLossSol) { say(this.s.SIZE, c.red(`daily loss limit hit (${this.stats.pnl.toFixed(3)} SOL) · web sleeps`)); return this.drop(L); }
    const size = this.cfg.sizeSol;
    say(this.s.SIZE, `size ${c.can(size + ' SOL')} · open ${open}/${this.cfg.maxOpen}`);
    say(this.s.ROUTE, `route via ${c.amb(this.cfg.pool)} · slippage ${this.cfg.slippagePct}% · prio ${this.cfg.priorityFeeSol} SOL`);
    try {
      const r = await this.trader.buy(L.mint, size, L.lastMcap);
      const bag = new Bag({ mint: L.mint, symbol: L.symbol, entryMcap: r.fillMcap, sizeSol: size, openedAt: this.clock.now(), ladder: this.cfg.ladder, stopX: this.cfg.stopX, maxHoldSec: this.cfg.maxHoldSec });
      this.bags.set(L.mint, bag);
      this.stats.sniped++;
      say(this.s.SNIPE, `${c.teal(c.bold('DROP IN'))} $${L.symbol} · ${size} SOL @ mc ${r.fillMcap.toFixed(1)} · edge ${edge.toFixed(2)} ${c.gray(r.sig === 'paper' ? '(paper fill)' : r.sig)}`);
      say(this.s.BAG, `bag.secure(tp=[${this.cfg.ladder.map((s) => s.x.toFixed(1)).join(', ')}]) · stop ${this.cfg.stopX}x · time ${this.cfg.maxHoldSec}s`);
      this.journal({ kind: 'buy', mint: L.mint, symbol: L.symbol, sol: size, mcap: r.fillMcap, sig: r.sig });
    } catch (e) {
      say(this.s.SNIPE, c.red(`buy failed: ${e.message}`));
      this.drop(L);
    }
  }

  async sell(L, bag, orders, dodged = false) {
    for (const o of orders) {
      if (bag.closed) break;
      try {
        const r = await this.trader.sell(L.mint, o.pct, L.lastMcap);
        const x = bag.x(r.fillMcap);
        const got = bag.fill(o.pct, x);
        const col = o.reason.startsWith('TP') ? c.can : o.reason.startsWith('cut') ? c.grn : c.red;
        say(this.s.BAG, `${col(o.reason)} · sold ${o.pct}% of bag @ ${x.toFixed(2)}x → ${got.toFixed(3)} SOL`);
        this.journal({ kind: 'sell', mint: L.mint, symbol: L.symbol, pct: o.pct, x, sol: got, reason: o.reason, sig: r.sig });
      } catch (e) { say(this.s.BAG, c.red(`sell failed: ${e.message} · will retry on next tick`)); return; }
    }
    if (bag.closed) {
      const p = bag.pnl();
      this.stats.closed++;
      this.stats.pnl += p;
      if (p > 0) this.stats.wins++;
      if (dodged) this.stats.rugsDodged++;
      say(this.s.QUEEN, `bag closed $${bag.symbol} · ${p >= 0 ? c.grn('+' + p.toFixed(3)) : c.red(p.toFixed(3))} SOL · session ${this.stats.pnl >= 0 ? c.grn('+' + this.stats.pnl.toFixed(3)) : c.red(this.stats.pnl.toFixed(3))} SOL`);
      this.drop(L);
    }
  }

  drop(L) {
    if (this.bags.get(L.mint)?.closed === false) return; // keep watching an open bag
    this.watch.delete(L.mint);
    this.feed.unwatchToken(L.mint);
    this.feed.unwatchAccount(L.dev);
  }

  // time stops for bags whose token went quiet
  async sweep() {
    for (const [mint, bag] of this.bags) {
      if (bag.closed) continue;
      const L = this.watch.get(mint);
      if (L) await this.sell(L, bag, bag.tick(L.lastMcap, this.clock.now()));
    }
  }

  async closeAll(reason) {
    for (const [mint, bag] of this.bags) {
      const L = this.watch.get(mint);
      if (!bag.closed && L) await this.sell(L, bag, [{ pct: 100, reason }]);
    }
  }

  summary() {
    const s = this.stats;
    const line = (k, v) => `   ${c.gray(k.padEnd(18))}${v}`;
    console.log(['', c.org(c.bold('   ── session ─────────────────────────')),
      line('launches seen', s.seen), line('cut by flags', c.red(s.cut)), line('passed (low edge)', c.gray(s.passed)),
      line('sniped', c.teal(s.sniped)), line('bags closed', s.closed), line('wins', c.grn(s.wins)), line('rugs dodged', c.grn(s.rugsDodged)),
      line('realized pnl', (s.pnl >= 0 ? c.grn('+') : c.red('')) + (s.pnl >= 0 ? c.grn(s.pnl.toFixed(3)) : c.red(s.pnl.toFixed(3))) + ' SOL'),
      s.skippedFull ? line('ignored (web full)', c.gray(s.skippedFull)) : '', ''].filter((x) => x !== '').join('\n'));
  }
}
