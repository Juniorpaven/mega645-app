// File: src/Mega645FilterEngine.ts
// Kiến trúc toán học: Bộ lọc 10 Quy luật & Bao thu gọn 30 vé (K = 12, 15, 18)

export const PRIMES_45 = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43];

export interface RuleCheckResult {
  passed: boolean;
  score: number;
  failedRules: string[];
}

export interface TemperatureStratification {
  hot: number[];
  warm: number[];
  cold: number[];
}

// 1. Phân tầng 45 số thành 3 nhóm (15 Hot, 15 Warm, 15 Cold)
export const getTemperatureStratification = (frequency: Record<number, number>) => {
  const arr = Array.from({ length: 45 }, (_, i) => {
    const num = i + 1;
    return { num, count: frequency[num] || 0 };
  });

  // Sắp xếp giảm dần theo tần suất; nếu bằng tần suất thì ưu tiên phân bổ từ tâm (23) ra 2 phía
  // để tránh lỗi dồn toàn bộ các số nhỏ (01..15) vào đầu mảng Warm và Cold
  arr.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return Math.abs(a.num - 23) - Math.abs(b.num - 23);
  });

  return {
    hot: arr.slice(0, 15).map(x => x.num),
    warm: arr.slice(15, 30).map(x => x.num),
    cold: arr.slice(30, 45).map(x => x.num),
  };
};

// 2. Kiểm tra toàn diện 10 quy luật trên một bộ 6 số (sorted)
export const validateTicket10Rules = (
  nums: number[],
  lastDrawNumbers: number[] = [],
  stratification?: TemperatureStratification
): RuleCheckResult => {
  const failedRules: string[] = [];
  let score = 100;

  // --- R1: Tổng 6 số (95 <= Sum <= 181) ---
  const sum = nums.reduce((a, b) => a + b, 0);
  if (sum < 95 || sum > 181) {
    failedRules.push(`R1: Tổng lệch (${sum})`);
    score -= 25;
  }

  // --- R2: Cân bằng Chẵn / Lẻ (2, 3, hoặc 4 số chẵn) ---
  const evens = nums.filter(n => n % 2 === 0).length;
  if (evens < 2 || evens > 4) {
    failedRules.push(`R2: Chẵn/Lẻ lệch (${evens}C/${6 - evens}L)`);
    score -= 20;
  }

  // --- R3: Cân bằng Thấp / Cao (1..22 vs 23..45: tỷ lệ 2, 3 hoặc 4) ---
  const lows = nums.filter(n => n <= 22).length;
  if (lows < 2 || lows > 4) {
    failedRules.push(`R3: Thấp/Cao lệch (${lows}T/${6 - lows}C)`);
    score -= 20;
  }

  // --- R4: Độ phức tạp số học (AC Value >= 6) ---
  const diffs = new Set<number>();
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      diffs.add(Math.abs(nums[i] - nums[j]));
    }
  }
  const ac = diffs.size - 5;
  if (ac < 6) {
    failedRules.push(`R4: AC thấp (${ac})`);
    score -= 30;
  }

  // --- R5: Ràng buộc số liên tiếp (Không có dây 3; tối đa 2 cặp liên tiếp) ---
  let consecutivePairs = 0;
  let hasThreeConsecutive = false;
  let streak = 1;

  for (let i = 0; i < nums.length - 1; i++) {
    if (nums[i + 1] === nums[i] + 1) {
      consecutivePairs++;
      streak++;
      if (streak >= 3) hasThreeConsecutive = true;
    } else {
      streak = 1;
    }
  }
  if (hasThreeConsecutive || consecutivePairs > 2) {
    failedRules.push(`R5: Số liền kề vi phạm`);
    score -= 30;
  }

  // --- R6: Phân bổ đầu số (Có mặt ít nhất 3 đầu số, mỗi đầu tối đa 3 số) ---
  const decades: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  nums.forEach(n => {
    const d = Math.min(4, Math.floor(n / 10));
    decades[d]++;
  });
  const activeDecades = Object.values(decades).filter(c => c > 0).length;
  const maxInOneDecade = Math.max(...Object.values(decades));

  if (activeDecades < 3 || maxInOneDecade > 3) {
    failedRules.push(`R6: Đầu số dồn tụ`);
    score -= 20;
  }

  // --- R7: Phân bổ đuôi số (Ít nhất 4 đuôi khác nhau, tối đa 2 số cùng đuôi) ---
  const tails: Record<number, number> = {};
  nums.forEach(n => {
    const tail = n % 10;
    tails[tail] = (tails[tail] || 0) + 1;
  });
  const uniqueTails = Object.keys(tails).length;
  const maxSameTail = Math.max(...Object.values(tails));

  if (uniqueTails < 4 || maxSameTail > 2) {
    failedRules.push(`R7: Đuôi số trùng`);
    score -= 15;
  }

  // --- R8: Độ rộng (22..43) & Số nguyên tố (1..3 số) ---
  const range = nums[nums.length - 1] - nums[0];
  const primeCount = nums.filter(n => PRIMES_45.includes(n)).length;

  if (range < 22 || range > 43) {
    failedRules.push(`R8: Độ rộng lệch (${range})`);
    score -= 15;
  }
  if (primeCount < 1 || primeCount > 3) {
    failedRules.push(`R8: Nguyên tố lệch (${primeCount})`);
    score -= 15;
  }

  // --- R9: Số rơi từ kỳ trước (Chỉ cho phép trùng 0, 1 hoặc 2 số) ---
  if (lastDrawNumbers.length >= 6) {
    const repeats = nums.filter(n => lastDrawNumbers.includes(n)).length;
    if (repeats > 2) {
      failedRules.push(`R9: Lặp kỳ trước nhiều (${repeats})`);
      score -= 35;
    }
  }

  // --- R10: Phân tầng nhiệt độ ---
  if (stratification) {
    const hCount = nums.filter(n => stratification.hot.includes(n)).length;
    const cCount = nums.filter(n => stratification.cold.includes(n)).length;

    if (hCount >= 5 || cCount >= 4 || (hCount === 0 && cCount === 0)) {
      failedRules.push(`R10: Nhiệt độ lệch`);
      score -= 25;
    }
  }

  score = Math.max(0, score);
  return {
    passed: failedRules.length === 0,
    score,
    failedRules,
  };
};

// 3. Thuật toán Bao thu gọn nén dàn vé (Abbreviated Wheeling System)
export const generateAbbreviatedWheel = (
  poolNumbers: number[],
  targetTicketsCount: number = 30,
  lastDrawNumbers: number[] = [],
  stratification?: TemperatureStratification
): { numbers: number[]; score: number; issues: string[] }[] => {
  if (poolNumbers.length < 6) return [];

  const combinations: number[][] = [];
  const k = poolNumbers.length;

  // Sinh toàn bộ tổ hợp C(K, 6)
  const combine = (start: number, chosen: number[]) => {
    if (chosen.length === 6) {
      combinations.push([...chosen]);
      return;
    }
    // Giới hạn an toàn bộ nhớ trình duyệt cho rổ lớn K = 18
    if (combinations.length >= 25000) return;

    for (let i = start; i < k; i++) {
      chosen.push(poolNumbers[i]);
      combine(i + 1, chosen);
      chosen.pop();
    }
  };

  combine(0, []);

  // Lọc và chấm điểm qua 10 quy tắc
  const scoredCombinations = combinations
    .map(ticket => {
      const sorted = [...ticket].sort((a, b) => a - b);
      const evalResult = validateTicket10Rules(sorted, lastDrawNumbers, stratification);
      return {
        numbers: sorted,
        score: evalResult.score,
        issues: evalResult.failedRules,
      };
    })
    .filter(item => item.score >= 60)
    .sort((a, b) => b.score - a.score);

  // Phủ khoảng cách Hamming để tối ưu diện tích bắt giải
  const selectedTickets: typeof scoredCombinations = [];

  // Vòng 1: Quét với khoảng cách Hamming gắt (trùng tối đa 3 số)
  for (const candidate of scoredCombinations) {
    if (selectedTickets.length >= targetTicketsCount) break;

    const isDiverse = selectedTickets.every(selected => {
      const intersect = candidate.numbers.filter(n => selected.numbers.includes(n)).length;
      return intersect <= 3;
    });

    if (isDiverse) {
      selectedTickets.push(candidate);
    }
  }

  // Vòng 2: Nới lỏng khoảng cách (trùng tối đa 4 số) nếu chưa đạt đủ số lượng mục tiêu
  if (selectedTickets.length < targetTicketsCount) {
    for (const candidate of scoredCombinations) {
      if (selectedTickets.length >= targetTicketsCount) break;
      if (!selectedTickets.some(t => t.numbers.join('-') === candidate.numbers.join('-'))) {
        const isAcceptable = selectedTickets.every(selected => {
          const intersect = candidate.numbers.filter(n => selected.numbers.includes(n)).length;
          return intersect <= 4;
        });
        if (isAcceptable) {
          selectedTickets.push(candidate);
        }
      }
    }
  }

  // Vòng 3: Bổ sung các vé có điểm số cao nhất còn lại nếu vẫn chưa đủ 30 vé
  if (selectedTickets.length < targetTicketsCount) {
    for (const candidate of scoredCombinations) {
      if (selectedTickets.length >= targetTicketsCount) break;
      if (!selectedTickets.some(t => t.numbers.join('-') === candidate.numbers.join('-'))) {
        selectedTickets.push(candidate);
      }
    }
  }

  return selectedTickets;
};
