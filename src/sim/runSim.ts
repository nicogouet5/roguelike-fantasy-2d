import { runHeadlessBot } from '../core/bot.ts';
import { loadGameData } from '../core/data.ts';

function parseArg(flag: string, fallback: number): number {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  const val = Number(process.argv[idx + 1]);
  return Number.isFinite(val) && val > 0 ? Math.floor(val) : fallback;
}

const runs = parseArg('--runs', 25);
const seedBase = parseArg('--seed', 42);
const data = loadGameData();

console.log(`DinoBlade Headless Sim — ${runs} runs across ${data.classes.length} dinosaur classes (seed base ${seedBase})\n`);

const byClass = new Map<string, { total: number; wins: number; kills: number; level: number; time: number }>();
for (const cls of data.classes) {
  byClass.set(cls.id, { total: 0, wins: 0, kills: 0, level: 0, time: 0 });
}

for (let i = 0; i < runs; i++) {
  const cls = data.classes[i % data.classes.length]!;
  const res = runHeadlessBot(data, cls.id, `sim-${seedBase}-${i}`);
  const agg = byClass.get(cls.id)!;
  agg.total += 1;
  if (res.victory) agg.wins += 1;
  agg.kills += res.kills;
  agg.level += res.level;
  agg.time += res.elapsedSec;
}

for (const cls of data.classes) {
  const agg = byClass.get(cls.id)!;
  const n = Math.max(1, agg.total);
  const winPct = Math.round((agg.wins / n) * 100);
  console.log(
    `${cls.id.padEnd(15)} | runs: ${String(agg.total).padStart(2)} | win: ${String(winPct).padStart(3)}% | avg Lv: ${(agg.level / n).toFixed(1)} | avg kills: ${(agg.kills / n).toFixed(1)} | avg time: ${(agg.time / n).toFixed(0)}s`
  );
}
