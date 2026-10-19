// Real clock for paper/live, virtual clock for replay (so a 10-minute
// market replays in seconds and tests are deterministic).
export class RealClock {
  now() { return Date.now() / 1000; }
  after(sec, fn) { return setTimeout(fn, Math.max(0, sec * 1000)); }
}

export class VirtualClock {
  constructor() { this.t = 0; this.q = []; this.seq = 0; }
  now() { return this.t; }
  after(sec, fn) { this.at(this.t + Math.max(0, sec), fn); }
  at(t, fn) { this.q.push({ t, fn, s: this.seq++ }); }
  // run everything in time order; `speed` > 0 paces it for humans watching
  async run(speed = 0) {
    while (this.q.length) {
      this.q.sort((a, b) => a.t - b.t || a.s - b.s);
      const ev = this.q.shift();
      if (speed > 0 && ev.t > this.t) await new Promise((r) => setTimeout(r, ((ev.t - this.t) * 1000) / speed));
      this.t = Math.max(this.t, ev.t);
      await ev.fn();
    }
  }
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
