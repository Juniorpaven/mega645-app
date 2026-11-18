// File: src/strategies.ts
// Toàn bộ logic sinh vé dạng HÀM THUẦN (không phụ thuộc React).
// - Dễ test, kết quả TÁI LẬP ĐƯỢC: cùng dữ liệu đầu vào => cùng bộ vé (dùng RNG có seed theo ngày kỳ mới nhất).
// - App.tsx chỉ gọi các hàm này trong useMemo.

import {
  getTemperatureStratification,
  validateTicket10Rules,
  generateAbbreviatedWheel,
} from './Mega645FilterEngine';

export const TOTAL_NUMBERS = 45;
export const ANALYSIS_WINDOW = 30;
export const DOUBLE_NUMBERS = [11, 22, 33, 44];

export type StrategyId = 'WHEEL' | 'BALANCED' | 'REVERSE_WHEEL_8' | 'COMBINATORIAL_10' | 'RANDOM_10';

export const STRATEGY_LABELS: Record<StrategyId, string> = {
  WHEEL: 'Bao 10 số (10 vé)',
  BALANCED: 'Cân bằng (15 vé)',
  REVERSE_WHEEL_8: 'Bao ngược 8 số (4 vé)',
  COMBINATORIAL_10: '10 quy luật (30 vé)',
  RANDOM_10: 'Đối chứng ngẫu nhiên (10 vé)',
};

export type Draw = { date: string; numbers: number[] };

export type TicketStats = {
  numbers: number[];
  sum: number;
  evens: number;
  odds: number;
  highs: number;
  lows: number;
  consecutive: boolean;
  doublesCount: number;
  score: number;
  status: 'EXCELLENT' | 'GOOD' | 'WARNING' | 'BAD';
  issues: string[];
};

export type PoolItem = { num: number; type: 'HOT' | 'WARM' | 'COLD'; count: number };

// ---------------------------------------------------------------------------
// RNG có seed (mulberry32) để kết quả không đổi mỗi lần render / mỗi thiết bị
// ---------------------------------------------------------------------------
export type Rng = () => number;

export const hashSeed = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

export const createRng = (seed: number | string): Rng => {
  let a = typeof seed === 'string' ? hashSeed(seed) : seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffle = <T,>(arr: T[], rng: Rng): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const pick = <T,>(arr: T[], rng: Rng): T => arr[Math.floor(rng() * arr.length)];

// ---------------------------------------------------------------------------
// Chuẩn hoá ngày & phân tích dữ liệu thô
// ---------------------------------------------------------------------------

/** Chuẩn hoá ngày về yyyy-mm-dd. Nhận: yyyy-mm-dd, dd-mm-yyyy, dd/mm/yyyy, dd.mm.yyyy */
export const normalizeDate = (raw: string): string | null => {
  const s = raw.trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
};

/** Phân tích 1 dòng "ngày b1 b2 b3 b4 b5 b6". Trả null nếu không đủ 6 số hợp lệ. */
export const parseDrawLine = (line: string): Draw | null => {
  const parts = line.trim().split(/[\t,;|\s]+/);
  let date = 'N/A';
  let numberText = line;
  if (parts[0] && /[-/.]/.test(parts[0])) {
    date = normalizeDate(parts[0]) ?? parts[0].replace(/[/. ]/g, '-');
    numberText = parts.slice(1).join(' ');
  }
  const nums = (numberText.match(/\d+/g) || [])
    .map(n => parseInt(n, 10))
    .filter(n => n >= 1 && n <= TOTAL_NUMBERS);
  if (nums.length < 6) return null;
  return { date, numbers: nums.slice(-6) };
};

export const parseDraws = (lines: string[]): Draw[] =>
  lines.map(parseDrawLine).filter((d): d is Draw => d !== null);

export const formatDrawLine = (d: Draw) =>
  `${d.date} ${d.numbers.map(n => String(n).padStart(2, '0')).join(' ')}`;

export const frequencyOf = (draws: Draw[]): Record<number, number> => {
  const freq: Record<number, number> = {};
  for (let i = 1; i <= TOTAL_NUMBERS; i++) freq[i] = 0;
  draws.forEach(d => d.numbers.forEach(n => { freq[n]++; }));
  return freq;
};

const sortByFrequency = (freq: Record<number, number>) =>
  Object.keys(freq)
    .map(k => ({ num: Number(k), count: freq[Number(k)] }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.num - b.num));

/** Rổ 10 số: 4 HOT, 4 WARM (giữa bảng), 2 COLD */
export const selectPool = (freq: Record<number, number>): PoolItem[] => {
  const arr = sortByFrequency(freq);
  if (arr.length === 0) return [];
  const hot = arr.slice(0, 4).map(i => i.num);
  const midStart = Math.max(0, Math.floor(arr.length / 2) - 2);
  const warm = arr.slice(midStart, midStart + 4).map(i => i.num);
  const cold = arr.slice(Math.max(0, arr.length - 2)).map(i => i.num);

  const pool = Array.from(new Set([...hot, ...warm, ...cold]));
  for (let p = 0; pool.length < 10 && p < arr.length; p++) {
    if (!pool.includes(arr[p].num)) pool.push(arr[p].num);
  }
  return pool
    .slice(0, 10)
    .sort((a, b) => a - b)
    .map(num => ({
      num,
      count: freq[num] ?? 0,
      type: hot.includes(num) ? 'HOT' : cold.includes(num) ? 'COLD' : 'WARM',
    }));
};

// ---------------------------------------------------------------------------
// Chấm điểm sức khoẻ vé (dựa trên 10 quy luật)
// ---------------------------------------------------------------------------
export const makeHealthCalculator = (lastDraw: number[], freq: Record<number, number>) => {
  const strat = getTemperatureStratification(freq);
  return (numbers: number[]): TicketStats => {
    const sorted = [...numbers].sort((a, b) => a - b);
    const evens = sorted.filter(n => n % 2 === 0).length;
    const highs = sorted.filter(n => n > 22).length;
    const consecutive = sorted.some((n, i) => i > 0 && n === sorted[i - 1] + 1);
    const check = validateTicket10Rules(sorted, lastDraw, strat);

    let status: TicketStats['status'] = 'BAD';
    if (check.score >= 90) status = 'EXCELLENT';
    else if (check.score >= 70) status = 'GOOD';
    else if (check.score >= 50) status = 'WARNING';

    return {
      numbers: sorted,
      sum: sorted.reduce((a, b) => a + b, 0),
      evens,
      odds: 6 - evens,
      highs,
      lows: 6 - highs,
      consecutive,
      doublesCount: sorted.filter(n => DOUBLE_NUMBERS.includes(n)).length,
      score: check.score,
      status,
      issues: check.failedRules,
    };
  };
};

export type HealthFn = ReturnType<typeof makeHealthCalculator>;

// ---------------------------------------------------------------------------
// CHIẾN LƯỢC 1: Bao 10 số theo khuôn 10 vé
// ---------------------------------------------------------------------------
const WHEEL_TEMPLATE = [
  [0, 1, 2, 3, 4, 5], [0, 1, 2, 6, 7, 8], [0, 1, 3, 4, 6, 9],
  [0, 2, 3, 5, 7, 8], [1, 4, 5, 6, 8, 9], [2, 3, 4, 7, 8, 9],
  [0, 3, 5, 6, 7, 9], [1, 2, 4, 5, 8, 9], [3, 4, 6, 7, 8, 5], [0, 1, 2, 9, 4, 8],
];

export const wheelStrategy = (pool: PoolItem[], health: HealthFn): TicketStats[] => {
  if (pool.length < 10) return [];
  const nums = pool.map(p => p.num);
  return WHEEL_TEMPLATE.map(row => health(row.map(idx => nums[idx])));
};

// ---------------------------------------------------------------------------
// CHIẾN LƯỢC 2: Cân bằng (đầu 4 + đuôi 3/8 + cặp liền kề + số nhỏ)
// ---------------------------------------------------------------------------
const isBalancedValid = (nums: number[]) => {
  if (new Set(nums).size !== 6) return false;
  const sum = nums.reduce((a, b) => a + b, 0);
  if (sum < 130 || sum > 170) return false;
  const evens = nums.filter(n => n % 2 === 0).length;
  if (evens !== 3 && evens !== 4) return false;
  if (nums.filter(n => n <= 22).length !== 3) return false;
  const sorted = [...nums].sort((a, b) => a - b);
  let hasAdj = false;
  let streak = 1;
  for (let i = 0; i < 5; i++) {
    if (sorted[i + 1] === sorted[i] + 1) {
      streak++;
      hasAdj = true;
      if (streak >= 3) return false;
    } else {
      streak = 1;
    }
  }
  return hasAdj;
};

export const balancedStrategy = (health: HealthFn, rng: Rng, count = 15): TicketStats[] => {
  const HEAD_4_POOL = [41, 42, 43, 45];
  const TAIL_3_8_PRIORITY = [28, 23, 13, 18];
  const TAIL_3_8_POOL = [3, 13, 23, 33, 8, 18, 28, 38];
  const FILLERS_PRIORITY = [2, 9, 10, 14, 17];
  const FILLERS_POOL = Array.from({ length: 19 }, (_, i) => i + 1);

  const results: TicketStats[] = [];
  const seen = new Set<string>();

  for (let attempts = 0; results.length < count && attempts < 20000; attempts++) {
    const current: number[] = [];

    // B1: 2 số đầu 4 (ưu tiên cặp 42-43 hoặc 41-45)
    const r = rng();
    if (r < 0.4) current.push(42, 43);
    else if (r < 0.64) current.push(41, 45);
    else current.push(...shuffle(HEAD_4_POOL, rng).slice(0, 2));

    // B2: 1-2 số đuôi 3/8
    const step2Count = rng() < 0.7 ? 1 : 2;
    const step2Source = rng() > 0.7 ? TAIL_3_8_POOL : TAIL_3_8_PRIORITY;
    current.push(...shuffle(step2Source.filter(n => !current.includes(n)), rng).slice(0, step2Count));

    // B3: đảm bảo có 1 cặp liền kề
    current.sort((a, b) => a - b);
    const hasAdj = current.some((n, i) => i > 0 && n === current[i - 1] + 1);
    if (!hasAdj) {
      const base = pick(current, rng);
      const opts = [base + 1, base - 1].filter(n => n >= 1 && n <= 45 && !current.includes(n));
      if (opts.length > 0) current.push(pick(opts, rng));
    }

    // B4: bù số nhỏ (01-19), ưu tiên nhóm FILLERS_PRIORITY
    const available = FILLERS_POOL.filter(n => !current.includes(n));
    const orderedFillers = [
      ...shuffle(available.filter(n => FILLERS_PRIORITY.includes(n)), rng),
      ...shuffle(available.filter(n => !FILLERS_PRIORITY.includes(n)), rng),
    ];
    while (current.length < 6 && orderedFillers.length > 0) current.push(orderedFillers.shift()!);

    if (!isBalancedValid(current)) continue;
    const sig = [...current].sort((a, b) => a - b).join('-');
    if (seen.has(sig)) continue;
    seen.add(sig);
    results.push(health(current));
  }

  return results.sort((a, b) => b.score - a.score);
};

// ---------------------------------------------------------------------------
// CHIẾN LƯỢC 3: Bao ngược 8 số (cặp neo + tịnh tiến ±1 trong vùng trung vị)
// ---------------------------------------------------------------------------
export const reverseWheel8Strategy = (
  freq: Record<number, number>,
  pool: PoolItem[],
  health: HealthFn,
  rng: Rng,
): TicketStats[] => {
  if (pool.length < 5) return [];
  const arr = sortByFrequency(freq);
  const medianPool = arr.slice(22).map(f => f.num); // loại 22 số nóng nhất

  const byFreq = [...pool].sort((a, b) => b.count - a.count);
  const A = byFreq[0].num;
  const B = byFreq[1].num;

  const derived = new Set<number>();
  [byFreq[2].num, byFreq[3].num, byFreq[4].num].forEach(x => {
    derived.add(x - 1 < 1 ? 45 : x - 1);
    derived.add(x + 1 > 45 ? 1 : x + 1);
  });

  const six: number[] = [];
  for (const n of derived) {
    if (n !== A && n !== B && medianPool.includes(n) && !six.includes(n)) six.push(n);
  }
  const candidates = shuffle(medianPool.filter(n => n !== A && n !== B && !six.includes(n)), rng);
  while (six.length < 6 && candidates.length > 0) six.push(candidates.shift()!);
  for (let fb = 1; six.length < 6 && fb <= 45; fb++) {
    if (!six.includes(fb) && fb !== A && fb !== B) six.push(fb);
  }

  six.sort((a, b) => a - b);
  const [C, D, E, F, G, H] = six;
  const tickets = [
    [A, B, C, D, E, F],
    [A, B, C, D, G, H],
    [A, B, E, F, G, H],
    [C, D, E, F, G, H],
  ];
  return tickets.map((t, i) => {
    const h = health(t);
    return {
      ...h,
      issues: [...h.issues, i === 3 ? 'Vé bảo lãnh (Không có Neo)' : `Chứa cặp Neo (${A}, ${B})`],
    };
  });
};

// ---------------------------------------------------------------------------
// CHIẾN LƯỢC 4: 10 quy luật + bao thu gọn 30 vé (K = 15)
// ---------------------------------------------------------------------------
export const combinatorial10Strategy = (
  freq: Record<number, number>,
  lastDraw: number[],
  health: HealthFn,
  targetTickets = 30,
): TicketStats[] => {
  const strat = getTemperatureStratification(freq);
  const poolK = Array.from(new Set([
    ...strat.hot.slice(0, 6),
    ...strat.warm.slice(0, 5),
    ...strat.cold.slice(0, 3),
    ...lastDraw.slice(0, 2),
    ...strat.hot,
    ...strat.warm,
  ])).slice(0, 15).sort((a, b) => a - b);

  return generateAbbreviatedWheel(poolK, targetTickets, lastDraw, strat).map(t => health(t.numbers));
};

// ---------------------------------------------------------------------------
// NHÓM ĐỐI CHỨNG: vé ngẫu nhiên thuần tuý — để so sánh công bằng hiệu quả các chiến lược
// ---------------------------------------------------------------------------
export const randomControlStrategy = (health: HealthFn, rng: Rng, count = 10): TicketStats[] => {
  const all = Array.from({ length: TOTAL_NUMBERS }, (_, i) => i + 1);
  const out: TicketStats[] = [];
  const seen = new Set<string>();
  while (out.length < count) {
    const t = shuffle(all, rng).slice(0, 6).sort((a, b) => a - b);
    const sig = t.join('-');
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(health(t));
  }
  return out;
};

// ---------------------------------------------------------------------------
// Tính toàn bộ phương án cho 1 cửa sổ dữ liệu
// ---------------------------------------------------------------------------
export type AnalysisResult = {
  draws: Draw[];
  frequency: Record<number, number>;
  prevFrequency: Record<number, number>;
  pool: PoolItem[];
  health: HealthFn;
  strategies: Record<StrategyId, TicketStats[]>;
};

export const analyze = (lines: string[]): AnalysisResult => {
  const draws = parseDraws(lines.slice(0, ANALYSIS_WINDOW));
  const frequency = frequencyOf(draws);
  const prevFrequency = lines.length > 1 ? frequencyOf(parseDraws(lines.slice(1, ANALYSIS_WINDOW + 1))) : {};
  const lastDraw = draws[0]?.numbers ?? [];
  const health = makeHealthCalculator(lastDraw, frequency);
  const pool = selectPool(frequency);
  const seed = `${draws[0]?.date ?? 'none'}|${lastDraw.join('-')}`;

  const strategies: Record<StrategyId, TicketStats[]> = draws.length === 0
    ? { WHEEL: [], BALANCED: [], REVERSE_WHEEL_8: [], COMBINATORIAL_10: [], RANDOM_10: [] }
    : {
        WHEEL: wheelStrategy(pool, health),
        BALANCED: balancedStrategy(health, createRng(`${seed}|BALANCED`)),
        REVERSE_WHEEL_8: reverseWheel8Strategy(frequency, pool, health, createRng(`${seed}|RW8`)),
        COMBINATORIAL_10: combinatorial10Strategy(frequency, lastDraw, health),
        RANDOM_10: randomControlStrategy(health, createRng(`${seed}|RANDOM`)),
      };

  return { draws, frequency, prevFrequency, pool, health, strategies };
};

/** Rổ 10 số của các kỳ trước (offset 1..7) — để xem độ ổn định của rổ */
export const poolHistoryOf = (lines: string[], periods = 7) => {
  const history: { date: string; pool: PoolItem[]; offset: number }[] = [];
  for (let i = 1; i <= periods; i++) {
    const slice = lines.slice(i, i + ANALYSIS_WINDOW);
    if (slice.length < ANALYSIS_WINDOW) break;
    const draws = parseDraws(slice);
    if (draws.length < 10) continue;
    history.push({ date: draws[0].date, pool: selectPool(frequencyOf(draws)), offset: i });
  }
  return history;
};
