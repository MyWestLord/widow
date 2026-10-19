import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, edge } from '../src/brain/brain.js';
import { Bag } from '../src/position/bag.js';
import { runChecks } from '../src/risk/checks.js';
import { parseLadder } from '../src/config.js';
import { encode, decode } from '../src/util/base58.js';

const cfg = { maxFlags: 1, edgeMin: 0.74, sizeSol: 0.1 };

test('rug check runs before the buy rule', () => {
  // a perfect edge can never outvote two flags
  assert.equal(decide({ flags: 2, edge: 0.99 }, cfg).action, 'cut');
  assert.equal(decide({ flags: 1, edge: 0.99 }, cfg).action, 'snipe');
  assert.equal(decide({ flags: 0, edge: 0.74 }, cfg).action, 'pass');
  assert.equal(decide({ flags: 0, edge: 0.75 }, cfg).action, 'snipe');
});

test('edge rewards real demand and punishes concentration', () => {
  const good = edge({ uniqueBuyers: 35, bsRatio: 3.5, buyVol: 14, growth: 2.3, devPct: 0.02, topBuyerShare: 0.03, velocity: 3.5 }).edge;
  const bad = edge({ uniqueBuyers: 3, bsRatio: 0.8, buyVol: 0.6, growth: 1.02, devPct: 0.14, topBuyerShare: 0.25, velocity: 0.3 }).edge;
  assert.ok(good > 0.85, `good edge ${good}`);
  assert.ok(bad < 0.3, `bad edge ${bad}`);
});

test('bag.secure: TP ladder sells half at 2x, the rest at 3.5x', () => {
  const b = new Bag({ mint: 'm', symbol: 'S', entryMcap: 100, sizeSol: 1, openedAt: 0, ladder: parseLadder('2.0:50,3.5:100'), stopX: 0.6, maxHoldSec: 600 });
  assert.deepEqual(b.tick(150, 1), []);
  const o1 = b.tick(200, 2);
  assert.equal(o1.length, 1); assert.equal(o1[0].pct, 50);
  b.fill(50, 2.0, 0);
  const o2 = b.tick(350, 3);
  assert.equal(o2[0].pct, 100);
  b.fill(100, 3.5, 0);
  assert.ok(b.closed);
  assert.equal(+b.pnl().toFixed(6), +(0.5 * 2 + 0.5 * 3.5 - 1).toFixed(6)); // +1.75 SOL on 1 SOL
});

test('stop, time stop and cut_thread close the whole bag', () => {
  const mk = () => new Bag({ mint: 'm', symbol: 'S', entryMcap: 100, sizeSol: 1, openedAt: 0, ladder: parseLadder('2:50,3.5:100'), stopX: 0.6, maxHoldSec: 60 });
  assert.equal(mk().tick(59, 1)[0].pct, 100);
  assert.match(mk().tick(100, 61)[0].reason, /time stop/);
  assert.match(mk().cutThread('dev sold')[0].reason, /cut_thread/);
});

test('gate: a dev sell and a bundle are flags, not opinions', () => {
  const L = { mint: 'm', dev: 'D', name: 'n', symbol: 'S', uri: 'u', createdAt: 0, mcap0: 30, lastMcap: 45, lastVSol: 40, devTokens: 2e7, devSold: true, trades: [] };
  for (let i = 0; i < 7; i++) L.trades.push({ trader: 'w' + i, side: 'buy', tokenAmount: 1e7, solAmount: 0.5, ts: 0.1 * i });
  const g = runChecks(L, { ok: true, risks: [] });
  assert.ok(g.flags >= 2, `flags ${g.flags}`);
  assert.equal(decide({ flags: g.flags, edge: 0.99 }, cfg).action, 'cut');
});

test('unknown rugcheck is a flag (unknown ≠ safe)', () => {
  const L = { mint: 'm', dev: 'D', name: 'n', symbol: 'S', uri: 'u', createdAt: 0, mcap0: 30, lastMcap: 30, devTokens: 0, devSold: false, trades: [] };
  assert.equal(runChecks(L, { ok: false, error: 'timeout', risks: [] }).flags, 1);
});

test('base58 roundtrip', () => {
  const b = Uint8Array.from([0, 0, 1, 2, 3, 250, 251, 252, 253, 254, 255]);
  assert.deepEqual(decode(encode(b)), b);
  assert.equal(encode(decode('11Ldp')), '11Ldp');
});
