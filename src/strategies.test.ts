import { describe, expect, it } from 'vitest';
import {
  analyze,
  createRng,
  normalizeDate,
  parseDrawLine,
  poolHistoryOf,
  selectPool,
  frequencyOf,
  parseDraws,
} from './strategies';
import { validateTicket10Rules, generateAbbreviatedWheel } from './Mega645FilterEngine';

// 40 kỳ thật (DATA_MEGA, mới nhất đứng đầu)
const LINES = `2026-11-18 06 18 20 27 29 32
2026-11-15 06 22 24 26 40 44
2026-11-13 01 07 15 19 31 33
2026-11-11 03 11 14 23 25 43
2026-11-08 01 02 14 20 23 36
2026-11-06 01 10 37 38 39 45
2026-11-04 07 14 20 30 34 40
2026-11-01 05 09 17 18 34 36
2026-10-30 07 21 22 40 41 45
2026-10-28 01 09 11 28 33 42
2026-10-25 04 13 22 25 40 41
2026-10-23 02 05 11 22 32 40
2026-10-21 04 10 14 22 25 44
2026-10-18 10 11 31 38 40 44
2026-10-16 09 20 26 35 36 38
2026-10-14 06 16 19 21 34 43
2026-10-11 03 09 16 29 30 44
2026-10-09 05 07 12 23 32 41
2026-10-07 10 14 36 37 41 43
2026-10-04 15 20 29 37 40 45
2026-10-02 01 06 20 27 31 41
2026-09-30 02 09 24 27 30 33
2026-09-27 02 04 13 25 31 39
2026-09-25 03 15 18 28 33 36
2026-09-23 02 06 12 15 25 26
2026-09-20 10 15 16 27 33 38
2026-09-18 07 12 26 27 41 43
2026-09-16 01 03 10 11 18 23
2026-09-13 04 12 31 34 38 41
2026-09-11 14 18 20 21 26 27
2026-09-09 12 17 20 21 36 43
2026-09-06 09 14 22 26 27 40
2026-09-04 16 21 23 29 34 45
2026-09-02 06 09 27 29 35 44
2026-08-30 01 03 12 15 37 45
2026-08-28 03 13 15 22 36 39
2026-08-26 03 10 11 16 33 40
2026-08-23 04 16 17 22 32 39`.split('\n');

const isValidTicket = (t: number[]) =>
  t.length === 6 && new Set(t).size === 6 && t.every(n => Number.isInteger(n) && n >= 1 && n <= 45);

describe('parse', () => {
  it('chuẩn hoá ngày', () => {
    expect(normalizeDate('18-11-2026')).toBe('2026-11-18');
    expect(normalizeDate('8/1/2026')).toBe('2026-01-08');
    expect(normalizeDate('2026-11-18')).toBe('2026-11-18');
    expect(normalizeDate('abc')).toBeNull();
  });

  it('bỏ qua số trong phần ngày', () => {
    expect(parseDrawLine('18-11-2026\t06\t18\t20\t27\t29\t32')).toEqual({
      date: '2026-11-18',
      numbers: [6, 18, 20, 27, 29, 32],
    });
    expect(parseDrawLine('rác')).toBeNull();
  });
});

describe('analyze', () => {
  const result = analyze(LINES);

  it('chỉ dùng 30 kỳ gần nhất', () => {
    expect(result.draws).toHaveLength(30);
    const total = Object.values(result.frequency).reduce((a, b) => a + b, 0);
    expect(total).toBe(180);
  });

  it('mọi chiến lược đều sinh vé hợp lệ, không trùng lặp', () => {
    const expected = { WHEEL: 10, BALANCED: 15, REVERSE_WHEEL_8: 4, COMBINATORIAL_10: 30, RANDOM_10: 10 };
    for (const [id, count] of Object.entries(expected)) {
      const tickets = result.strategies[id as keyof typeof expected].map(t => t.numbers);
      expect(tickets, id).toHaveLength(count);
      tickets.forEach(t => expect(isValidTicket(t), `${id}: ${t}`).toBe(true));
      expect(new Set(tickets.map(t => t.join('-'))).size, id).toBe(count);
    }
  });

  it('kết quả tái lập được (cùng dữ liệu => cùng vé)', () => {
    const again = analyze([...LINES]);
    expect(again.strategies).toEqual(result.strategies);
  });

  it('dữ liệu mới => bộ vé ngẫu nhiên thay đổi', () => {
    const next = analyze(['2026-11-20 01 02 03 04 05 06', ...LINES]);
    expect(next.strategies.RANDOM_10).not.toEqual(result.strategies.RANDOM_10);
  });

  it('dữ liệu rỗng không lỗi', () => {
    const empty = analyze(['']);
    expect(empty.strategies.COMBINATORIAL_10).toEqual([]);
  });
});

describe('pool', () => {
  it('rổ 10 số: 4 HOT, 2 COLD', () => {
    const pool = selectPool(frequencyOf(parseDraws(LINES.slice(0, 30))));
    expect(pool).toHaveLength(10);
    expect(pool.filter(p => p.type === 'HOT')).toHaveLength(4);
    expect(pool.filter(p => p.type === 'COLD')).toHaveLength(2);
  });

  it('lịch sử rổ 7 kỳ', () => {
    const history = poolHistoryOf(LINES);
    expect(history).toHaveLength(7);
    expect(history[0].date).toBe('2026-11-15');
  });
});

describe('filter engine', () => {
  it('chấm điểm 10 quy luật', () => {
    expect(validateTicket10Rules([5, 12, 19, 28, 33, 41]).passed).toBe(true);
    const bad = validateTicket10Rules([1, 2, 3, 4, 5, 6]);
    expect(bad.passed).toBe(false);
    expect(bad.failedRules.some(r => r.startsWith('R5'))).toBe(true);
  });

  it('bao thu gọn trả đúng số vé, không trùng', () => {
    const pool = [1, 5, 9, 12, 16, 20, 23, 27, 30, 34, 38, 41, 43, 44, 45];
    const wheel = generateAbbreviatedWheel(pool, 30);
    expect(wheel).toHaveLength(30);
    expect(new Set(wheel.map(t => t.numbers.join('-'))).size).toBe(30);
  });
});

describe('rng', () => {
  it('cùng seed => cùng chuỗi', () => {
    const a = createRng('x');
    const b = createRng('x');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
