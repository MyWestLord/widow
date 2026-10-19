#!/usr/bin/env node
// WIDOW · pump.fun sniper colony · by GrokBot
//   npm run replay   offline simulation, no network, no money
//   npm run paper    real pump.fun feed + real rugcheck, fake fills
//   npm run live     real money (read docs/PUMPFUN.md first)
import { loadConfig } from './config.js';
import { banner, c, say, setNow } from './log.js';
import { Colony } from './colony.js';
import { RealClock, VirtualClock } from './util/clock.js';
import { PumpPortalFeed } from './feed/pumpportal.js';
import { ReplayFeed } from './feed/replay.js';
import { PaperTrader, LiveTrader } from './exec/traders.js';

async function main() {
  const cfg = loadConfig();
  banner(cfg.mode);
  const replay = cfg.mode === 'replay';
  const clock = replay ? new VirtualClock() : new RealClock();
  if (replay) setNow(() => clock.now());
  const feed = replay ? new ReplayFeed(clock, { seed: cfg.seed, launches: cfg.launches }) : new PumpPortalFeed(clock);
  const trader = cfg.mode === 'live' ? new LiveTrader(cfg) : new PaperTrader(cfg);
  const w = await trader.init();
  if (cfg.mode === 'live') say(null, `wallet ${c.bone(w.pub)} · balance ${c.can(w.balance.toFixed(3) + ' SOL')}`);

  const colony = new Colony({ cfg, feed, trader, clock, rugcheck: replay ? async (m) => feed.rugcheck(m) : undefined });
  colony.hatch();
  feed.on('event', (ev) => colony.onEvent(ev));
  feed.on('status', (m) => say(null, c.gray(m)));
  feed.on('open', () => say(colony.s.SCAN, c.grn(replay ? 'replay market loaded' : 'connected to PumpPortal · listening for new pump.fun launches')));
  feed.start();

  if (replay) {
    await clock.run(cfg.speed > 1 ? cfg.speed : 0);
    await colony.closeAll('replay ended');
    colony.summary();
    return;
  }
  const sweeper = setInterval(() => colony.sweep(), 2000);
  const bye = async () => {
    clearInterval(sweeper);
    say(null, c.can('shutting down · closing open bags'));
    await colony.closeAll('shutdown');
    feed.stop();
    colony.summary();
    process.exit(0);
  };
  process.on('SIGINT', bye);
  process.on('SIGTERM', bye);
}

main().catch((e) => { console.error(c.red('✗ ' + e.message)); process.exit(1); });
