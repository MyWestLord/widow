// Pretty terminal output. Every line is signed by the spider that did the work.
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const rgb = (r, g, b) => (s) => (useColor ? `\x1b[38;2;${r};${g};${b}m${s}\x1b[0m` : s);
const bold = (s) => (useColor ? `\x1b[1m${s}\x1b[22m` : s);
const dim = (s) => (useColor ? `\x1b[2m${s}\x1b[22m` : s);

export const c = {
  org: rgb(255, 122, 26), amb: rgb(255, 176, 32), can: rgb(255, 216, 74), grn: rgb(139, 255, 60),
  pur: rgb(163, 92, 255), plum: rgb(224, 75, 255), red: rgb(255, 46, 77), bone: rgb(243, 233, 210),
  teal: rgb(61, 255, 208), pink: rgb(255, 95, 176), gray: rgb(143, 122, 163), bold, dim,
};

const t0 = Date.now();
let nowFn = () => (Date.now() - t0) / 1000;
export function setNow(fn) { nowFn = fn; }
const stamp = () => dim(nowFn().toFixed(2).padStart(7) + 's');

export function say(spider, msg) {
  const tag = spider ? spider.paint(`WDW-${String(spider.id).padStart(2, '0')} ${spider.job.padEnd(6)}`) : c.org('QUEEN       ');
  console.log(`${stamp()}  🕷 ${tag}  ${msg}`);
}

export function banner(mode) {
  const lines = [
    '',
    c.org('   ██╗    ██╗██╗██████╗  ██████╗ ██╗    ██╗'),
    c.org('   ██║    ██║██║██╔══██╗██╔═══██╗██║    ██║'),
    c.amb('   ██║ █╗ ██║██║██║  ██║██║   ██║██║ █╗ ██║'),
    c.plum('   ██║███╗██║██║██║  ██║██║   ██║██║███╗██║'),
    c.pur('   ╚███╔███╔╝██║██████╔╝╚██████╔╝╚███╔███╔╝'),
    c.pur('    ╚══╝╚══╝ ╚═╝╚═════╝  ╚═════╝  ╚══╝╚══╝ '),
    `   ${c.bone('pump.fun sniper colony')} ${c.gray('·')} ${c.can('by GrokBot')} ${c.gray('·')} mode ${mode === 'live' ? c.red(bold('LIVE')) : c.grn(bold(mode))}`,
    `   ${c.gray('rug check before the buy rule · exit rule before the entry')}`,
    '',
  ];
  console.log(lines.join('\n'));
}
