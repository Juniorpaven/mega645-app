import { useState, useEffect, useMemo, useRef } from 'react';
import { db } from './firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

import { FileSpreadsheet, Calendar, Check, Activity, HeartPulse, Layers, Download, Upload, Trash2, PlusCircle, Copy, ClipboardPaste, Maximize2, Lock, Flame, Snowflake, Zap, RotateCcw, History, X, BarChart3 } from 'lucide-react';

// --- CONSTANTS & CONFIG ---
const TOTAL_NUMBERS = 45;
const DOUBLE_NUMBERS = [11, 22, 33, 44];
const WHEEL_TEMPLATE = [
  [0, 1, 2, 3, 4, 5], [0, 1, 2, 6, 7, 8], [0, 1, 3, 4, 6, 9],
  [0, 2, 3, 5, 7, 8], [1, 4, 5, 6, 8, 9], [2, 3, 4, 7, 8, 9],
  [0, 3, 5, 6, 7, 9], [1, 2, 4, 5, 8, 9], [3, 4, 6, 7, 8, 5], [0, 1, 2, 9, 4, 8]
];

// Sample Data
const INITIAL_EXCEL_DATA = `22-11-2023	03	14	22	26	31	43
20-11-2023	05	12	19	28	35	44
18-11-2023	02	05	14	26	33	40
15-11-2023	01	10	12	25	31	42
13-11-2023	07	14	22	28	36	45
11-11-2023	05	08	19	21	34	39
08-11-2023	03	15	26	30	40	44
06-11-2023	12	18	22	25	33	41
04-11-2023	01	05	09	14	27	38
01-11-2023	04	11	19	23	35	45
30-10-2023	02	09	15	22	31	40
28-10-2023	05	11	18	25	33	42
25-10-2023	01	08	14	20	29	38
23-10-2023	03	12	19	24	35	44
21-10-2023	06	15	22	28	36	41
18-10-2023	02	10	17	25	32	39
16-10-2023	04	13	21	29	34	43
14-10-2023	01	07	15	23	30	45
11-10-2023	05	12	18	26	33	40
09-10-2023	03	09	16	22	31	42
07-10-2023	02	08	14	20	28	37
04-10-2023	06	11	19	25	34	44
02-10-2023	01	10	17	24	32	41
30-09-2023	04	13	21	29	36	45
27-09-2023	05	12	18	26	33	40
25-09-2023	02	09	15	22	30	39
23-09-2023	03	11	19	27	35	43
20-09-2023	01	08	16	24	31	42
18-09-2023	06	14	21	28	36	44
16-09-2023	04	10	17	25	32	41`;

// --- TYPES ---
type TicketStats = {
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

type NumberInsight = {
  num: number;
  lastDate: string;
  totalFreq: number;
  currentGap: number;
  maxStreak: number;
  type: 'HOT' | 'WARM' | 'COLD';
};

// --- HELPER: POOL CALCULATION ---
const getPoolForData = (lines: string[]) => {
  // 1. Calculate Frequency
  const freqMap: Record<number, number> = {};
  for (let i = 1; i <= 45; i++) freqMap[i] = 0;

  let validCount = 0;
  let firstDate = "N/A";

  lines.forEach((line, idx) => {
    const parts = line.trim().split(/[\t,;|\s]+/);
    if (idx === 0 && parts[0]) {
      if (parts[0].includes('/') || parts[0].includes('-') || parts[0].includes('.')) {
        firstDate = parts[0].replace(/[/. ]/g, '-');
      }
    }

    const allNumbers = line.match(/\d+/g)?.map(n => parseInt(n)).filter(n => !isNaN(n)) || [];
    const validRangeNumbers = allNumbers.filter(n => n >= 1 && n <= 45);

    if (validRangeNumbers.length >= 6) {
      const finalNums = validRangeNumbers.slice(-6);
      finalNums.forEach(n => { if (freqMap[n] !== undefined) freqMap[n]++; });
      validCount++;
    }
  });

  if (validCount < 10) return null;

  // 2. Select Pool
  const freqArray = Object.keys(freqMap).map(k => ({ num: parseInt(k), count: freqMap[parseInt(k)] }));
  freqArray.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.num - b.num;
  });

  const hot = freqArray.slice(0, 3).map(i => i.num);
  const midStart = Math.max(0, Math.floor(freqArray.length / 2) - 2);
  const warm = freqArray.slice(midStart, midStart + 4).map(i => i.num);
  const cold = freqArray.slice(Math.max(0, freqArray.length - 3)).map(i => i.num);

  let poolIndices = Array.from(new Set([...hot, ...warm, ...cold]));
  let ptr = 0;
  while (poolIndices.length < 10 && ptr < freqArray.length) {
    if (!poolIndices.includes(freqArray[ptr].num)) poolIndices.push(freqArray[ptr].num);
    ptr++;
  }

  const finalPool = poolIndices.slice(0, 10).sort((a, b) => a - b).map(num => ({
    num,
    type: hot.includes(num) ? 'HOT' : cold.includes(num) ? 'COLD' : 'WARM'
  }));

  return {
    date: firstDate,
    pool: finalPool
  };
};

const Mega645AnalyzerV10 = () => {
  // --- STATE ---
  const [rawData, setRawData] = useState(() => localStorage.getItem('mega645_rawData') || INITIAL_EXCEL_DATA);
  const [processedData, setProcessedData] = useState<{ date: string, numbers: number[] }[]>([]);
  const [frequency, setFrequency] = useState<Record<number, number>>({});
  const [prevFrequency, setPrevFrequency] = useState<Record<number, number>>({});
  const [selectedPool, setSelectedPool] = useState<{ num: number, type: string, count: number }[]>([]);
  const [activeHeatmap, setActiveHeatmap] = useState<'CURRENT' | 'PREVIOUS' | null>(null);
  const [insightNumber, setInsightNumber] = useState<NumberInsight | null>(null);

  // Strategy State
  const [currentDay, setCurrentDay] = useState(() => parseInt(localStorage.getItem('mega645_currentDay') || '1'));
  const [generatedMatrix, setGeneratedMatrix] = useState<TicketStats[]>([]);
  const [lockedMatrix, setLockedMatrix] = useState<TicketStats[] | null>(() => {
    const saved = localStorage.getItem('mega645_lockedMatrix');
    return saved ? JSON.parse(saved) : null;
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumberRef = useRef<HTMLDivElement>(null);

  const [newDayInput, setNewDayInput] = useState('');

  // --- PERSISTENCE ---
  // --- PERSISTENCE & SYNC ---
  // 1. Listen for updates from Firebase
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "mega645", "data"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        // Update state only if different to avoid loops/jitters
        if (data.rawData !== undefined) {
          setRawData(prev => prev !== data.rawData ? data.rawData : prev);
        }
        if (data.currentDay !== undefined) {
          setCurrentDay(prev => prev !== data.currentDay ? data.currentDay : prev);
        }
        if (data.lockedMatrix !== undefined) {
          setLockedMatrix(prev => JSON.stringify(prev) !== JSON.stringify(data.lockedMatrix) ? data.lockedMatrix : prev);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Save to Firebase (Debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      // Save to LocalStorage (Backup/Fast Load)
      localStorage.setItem('mega645_rawData', rawData);
      localStorage.setItem('mega645_currentDay', currentDay.toString());
      if (lockedMatrix) {
        localStorage.setItem('mega645_lockedMatrix', JSON.stringify(lockedMatrix));
      } else {
        localStorage.removeItem('mega645_lockedMatrix');
      }

      // Save to Firebase
      setDoc(doc(db, "mega645", "data"), {
        rawData,
        currentDay,
        lockedMatrix: lockedMatrix || null
      }, { merge: true }).catch(err => console.error("Firebase save error:", err));

    }, 1000); // 1s debounce
    return () => clearTimeout(timer);
  }, [rawData, currentDay, lockedMatrix]);

  const handleHardReset = () => {
    if (window.confirm('Bạn có chắc muốn xóa toàn bộ dữ liệu và reset về mặc định?')) {
      localStorage.clear();
      setRawData(INITIAL_EXCEL_DATA);
      setLockedMatrix(null);
      setCurrentDay(1);
      window.location.reload();
    }
  };

  const handleClearData = () => {
    if (window.confirm("Bạn có chắc muốn xóa toàn bộ dữ liệu đầu vào?")) {
      setRawData("");
    }
  };

  const handleCopyInput = () => {
    navigator.clipboard.writeText(rawData);
    alert("Đã sao chép dữ liệu vào bộ nhớ tạm!");
  };

  const handlePasteInput = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setRawData(text);
    } catch (err) {
      alert("Không thể dán tự động. Vui lòng dùng Ctrl+V.");
    }
  };

  const handleSelectAll = () => {
    if (textareaRef.current) {
      textareaRef.current.select();
    }
  };

  const handleUpdateNewDay = () => {
    if (!newDayInput.trim()) return;

    const nums = newDayInput.match(/\d+/g);
    if (!nums || nums.length < 6) {
      alert("Vui lòng nhập đúng định dạng (ít nhất 6 số)!");
      return;
    }

    const currentLines = rawData.trim().split('\n');
    // Keep history, don't slice to 30
    const newLines = [newDayInput.trim(), ...currentLines];

    setRawData(newLines.join('\n'));
    setNewDayInput('');

    if (currentDay < 7) {
      setCurrentDay(currentDay + 1);
    } else {
      alert("Đã hoàn thành chu kỳ 7 ngày! Hãy cân nhắc Reset chiến dịch.");
    }
  };

  // --- ENGINE: TICKET HEALTH SCORING ---
  const calculateTicketHealth = (numbers: number[]): TicketStats => {
    const sum = numbers.reduce((a, b) => a + b, 0);
    const evens = numbers.filter(n => n % 2 === 0).length;
    const odds = 6 - evens;
    const highs = numbers.filter(n => n > 22).length;
    const lows = 6 - highs;
    const doublesCount = numbers.filter(n => DOUBLE_NUMBERS.includes(n)).length;

    const sorted = [...numbers].sort((a, b) => a - b);
    let consecutive = false;
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i + 1] === sorted[i] + 1) {
        consecutive = true;
        break;
      }
    }

    let score = 100;
    let issues: string[] = [];

    if (sum >= 118 && sum <= 158) {
    } else if ((sum >= 100 && sum < 118) || (sum > 158 && sum <= 200)) {
      score -= 15;
      issues.push(`Tổng lệch (${sum})`);
    } else {
      score -= 40;
      issues.push(`Tổng cực đoan (${sum})`);
    }

    if (evens === 0 || evens === 6) {
      score -= 40;
      issues.push(`Chẵn/Lẻ lệch (0-6)`);
    } else if (evens === 1 || evens === 5) {
      score -= 15;
      issues.push(`Chẵn/Lẻ lệch (1-5)`);
    }

    if (highs === 0 || highs === 6) {
      score -= 30;
      issues.push(`Tài/Xỉu lệch (0-6)`);
    } else if (highs === 1 || highs === 5) {
      score -= 10;
      issues.push(`Tài/Xỉu lệch (1-5)`);
    }

    if (consecutive) {
      score += 5;
    } else {
      score -= 5;
    }

    if (doublesCount > 2) {
      score -= 20;
      issues.push(`Dư thừa số Kép (${doublesCount})`);
    }

    score = Math.min(100, Math.max(0, score));

    let status: TicketStats['status'] = 'GOOD';
    if (score >= 90) status = 'EXCELLENT';
    else if (score >= 70) status = 'GOOD';
    else if (score >= 50) status = 'WARNING';
    else status = 'BAD';

    return { numbers: sorted, sum, evens, odds, highs, lows, consecutive, doublesCount, score, status, issues };
  };

  // --- ENGINE: DATA PROCESSING ---
  useEffect(() => {
    const allLines = rawData.trim().split('\n');

    const processSegment = (lines: string[]) => {
      const freqMap: Record<number, number> = {};
      for (let i = 1; i <= TOTAL_NUMBERS; i++) freqMap[i] = 0;
      const validDraws: { date: string, numbers: number[] }[] = [];

      lines.forEach(line => {
        const parts = line.trim().split(/[\t,;|\s]+/);
        let dateStr = "N/A";
        if (parts[0] && (parts[0].includes('/') || parts[0].includes('-') || parts[0].includes('.'))) {
          dateStr = parts[0].replace(/[/. ]/g, '-');
        }

        const allNumbers = line.match(/\d+/g)?.map(n => parseInt(n)).filter(n => !isNaN(n)) || [];
        const validRangeNumbers = allNumbers.filter(n => n >= 1 && n <= 45);

        if (validRangeNumbers.length >= 6) {
          const finalNums = validRangeNumbers.slice(-6);
          validDraws.push({ date: dateStr, numbers: finalNums });
          finalNums.forEach(n => { if (freqMap[n] !== undefined) freqMap[n]++; });
        }
      });
      return { freqMap, validDraws };
    };

    // 1. Current Data (Top 30)
    const current = processSegment(allLines.slice(0, 30));
    setProcessedData(current.validDraws);
    setFrequency(current.freqMap);

    // 2. Previous Data (Offset 1, 30 lines)
    // This simulates the state BEFORE the latest line was added
    if (allLines.length > 1) {
      const prev = processSegment(allLines.slice(1, 31));
      setPrevFrequency(prev.freqMap);
    } else {
      setPrevFrequency({});
    }

  }, [rawData]);

  // --- ENGINE: SELECTION ---
  useEffect(() => {
    const freqArray = Object.keys(frequency).map(k => ({ num: parseInt(k), count: frequency[parseInt(k)] }));
    if (freqArray.length === 0) return;

    freqArray.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.num - b.num;
    });

    const hot = freqArray.slice(0, 3).map(i => i.num);
    const midStart = Math.max(0, Math.floor(freqArray.length / 2) - 2);
    const warm = freqArray.slice(midStart, midStart + 4).map(i => i.num);
    const cold = freqArray.slice(Math.max(0, freqArray.length - 3)).map(i => i.num);

    let poolIndices = Array.from(new Set([...hot, ...warm, ...cold]));
    let ptr = 0;
    while (poolIndices.length < 10 && ptr < freqArray.length) {
      if (!poolIndices.includes(freqArray[ptr].num)) poolIndices.push(freqArray[ptr].num);
      ptr++;
    }

    const finalPool = poolIndices.slice(0, 10).sort((a, b) => a - b).map(num => ({
      num, count: frequency[num], type: hot.includes(num) ? 'HOT' : cold.includes(num) ? 'COLD' : 'WARM'
    }));

    setSelectedPool(finalPool);

    const poolNums = finalPool.map(p => p.num);
    const rawMatrix = WHEEL_TEMPLATE.map(row =>
      row.map(idx => poolNums[idx] !== undefined ? poolNums[idx] : 0)
    );

    const analyzedMatrix = rawMatrix.map(ticketNums => calculateTicketHealth(ticketNums));
    setGeneratedMatrix(analyzedMatrix);

  }, [frequency]);

  // --- POOL HISTORY ---
  const poolHistory = useMemo(() => {
    const allLines = rawData.trim().split('\n');
    const history = [];

    // Calculate for past 7 periods (offsets 1 to 7)
    for (let i = 1; i <= 7; i++) {
      const slice = allLines.slice(i, i + 30);
      if (slice.length < 30) break;
      const res = getPoolForData(slice);
      if (res) history.push({ ...res, offset: i });
    }
    return history;
  }, [rawData]);



  // --- INSIGHT LOGIC ---
  const handleNumberClick = (num: number) => {
    const totalFreq = frequency[num] || 0;

    let lastDate = "Chưa xuất hiện";
    let currentGap = 0;
    let found = false;

    for (let i = 0; i < processedData.length; i++) {
      if (processedData[i].numbers.includes(num)) {
        if (!found) {
          lastDate = processedData[i].date;
          currentGap = i;
          found = true;
        }
      }
    }
    if (!found) currentGap = processedData.length;

    let maxStreak = 0;
    let currentStreak = 0;
    for (let i = 0; i < processedData.length; i++) {
      if (processedData[i].numbers.includes(num)) {
        currentStreak++;
      } else {
        if (currentStreak > maxStreak) maxStreak = currentStreak;
        currentStreak = 0;
      }
    }
    if (currentStreak > maxStreak) maxStreak = currentStreak;

    const vals = Object.values(frequency);
    const maxVal = Math.max(...vals, 1);
    const minVal = Math.min(...vals, 0);
    const range = maxVal - minVal;
    const hotThreshold = maxVal - (range / 3);
    const coldThreshold = minVal + (range / 3);

    let type: 'HOT' | 'WARM' | 'COLD' = 'WARM';
    if (totalFreq >= hotThreshold) type = 'HOT';
    else if (totalFreq <= coldThreshold) type = 'COLD';

    setInsightNumber({
      num,
      lastDate,
      totalFreq,
      currentGap,
      maxStreak,
      type
    });
  };

  // --- HANDLERS ---
  const handleLock = () => { setLockedMatrix(generatedMatrix); setCurrentDay(1); };
  const handleUnlock = () => { setLockedMatrix(null); }; // Unlock to edit
  const handleNextDay = () => { if (currentDay < 7) setCurrentDay(currentDay + 1); };

  const handleExport = async () => {
    try {
      const minified = {
        r: rawData,
        d: currentDay,
        l: lockedMatrix ? lockedMatrix.map(t => t.numbers) : null,
        t: new Date().getTime()
      };
      const jsonString = JSON.stringify(minified);
      const code = btoa(unescape(encodeURIComponent(jsonString)));
      try {
        await navigator.clipboard.writeText(code);
        alert(`✅ Đã COPY Mã Dữ Liệu!`);
      } catch (clipboardError) {
        prompt("Copy mã:", code);
      }
    } catch (e) {
      alert("Lỗi: " + (e as Error).message);
    }
  };

  const handleImport = () => {
    const code = prompt("Dán Mã Dữ Liệu:");
    if (!code) return;
    try {
      const decoded = decodeURIComponent(escape(atob(code)));
      const data = JSON.parse(decoded);
      const rawDataVal = data.r || data.rawData;
      const currentDayVal = data.d !== undefined ? data.d : data.currentDay;
      const lockedRaw = data.l || data.lockedMatrix;

      if (rawDataVal && currentDayVal !== undefined) {
        setRawData(rawDataVal);
        setCurrentDay(currentDayVal);
        if (lockedRaw) {
          const isMinified = Array.isArray(lockedRaw[0]) && typeof lockedRaw[0][0] === 'number';
          if (isMinified) {
            setLockedMatrix(lockedRaw.map((nums: number[]) => calculateTicketHealth(nums)));
          } else {
            setLockedMatrix(lockedRaw);
          }
        } else {
          setLockedMatrix(null);
        }
        alert("✅ Đồng bộ thành công!");
      }
    } catch (e) {
      alert("❌ Mã lỗi.");
    }
  };

  // --- COMPONENTS ---
  const FrequencyHeatmap = ({
    data,
    title,
    highlight = [],
    isPrevious = false,
    onClick
  }: {
    data: Record<number, number>,
    title: string,
    highlight?: number[],
    isPrevious?: boolean,
    onClick?: () => void
  }) => {
    const vals = Object.values(data);
    const max = Math.max(...vals, 1);
    const min = Math.min(...vals, 0);
    const range = max - min;
    const hotThreshold = max - (range / 3);
    const coldThreshold = min + (range / 3);

    return (
      <div
        onClick={onClick}
        className={`flex flex-col gap-2 bg-slate-900/50 p-2 rounded-lg border border-slate-800 transition-all cursor-pointer hover:border-slate-600 ${isPrevious ? 'opacity-60 grayscale-[0.3]' : ''}`}
      >
        <div className="flex justify-between items-center">
          <h3 className="text-[9px] font-bold text-slate-400 uppercase tracking-wider truncate flex items-center gap-1">
            {title} <Maximize2 className="w-2 h-2 opacity-50" />
          </h3>
        </div>
        <div className="grid grid-cols-8 gap-1">
          {Array.from({ length: 45 }, (_, i) => i + 1).map(num => {
            const freq = data[num] || 0;
            const isHighlighted = highlight.includes(num);

            // 3-Level Logic: Hot / Warm / Cold
            let bgClass = 'bg-slate-800 text-slate-500 border-slate-700'; // Default (0 freq or error)

            if (freq > 0) {
              if (freq >= hotThreshold) {
                bgClass = 'bg-red-600 text-white border-red-800 shadow-red-900/50';
              } else if (freq <= coldThreshold) {
                bgClass = 'bg-blue-600 text-white border-blue-800 shadow-blue-900/50';
              } else {
                bgClass = 'bg-amber-500 text-black border-amber-700 shadow-amber-900/50';
              }
            }

            return (
              <div
                key={num}
                className={`
                  relative w-full aspect-square rounded-full flex flex-col items-center justify-center transition-all border-2
                  ${bgClass}
                  ${isHighlighted ? 'ring-1 ring-white scale-110 z-10 shadow-lg' : 'opacity-90 hover:opacity-100 hover:scale-105'}
                `}
                title={`Số ${num}: ${freq} lần`}
              >
                <span className="text-[9px] font-bold leading-none">{num < 10 ? `0${num}` : num}</span>
                <span className="text-[7px] font-bold leading-none mt-px opacity-80">{freq}</span>
                {isHighlighted && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const HealthBadge = ({ score, status }: { score: number, status: string }) => {
    let color = 'bg-slate-500';
    if (status === 'EXCELLENT') color = 'bg-emerald-500';
    if (status === 'GOOD') color = 'bg-blue-500';
    if (status === 'WARNING') color = 'bg-yellow-500';
    if (status === 'BAD') color = 'bg-red-500';

    return (
      <div className="flex items-center gap-2" title={`Điểm sức khỏe: ${score}/100`}>
        <div className="w-20 h-2.5 bg-slate-700 rounded-full overflow-hidden">
          <div className={`h-full ${color}`} style={{ width: `${score}%` }}></div>
        </div>
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${color.replace('bg-', 'text-')} bg-opacity-20 border border-opacity-50 border-${color.replace('bg-', '')}`}>
          {score}
        </span>
      </div>
    );
  };

  const TicketRowV10 = ({ stats, index, isLocked, lockedSet }: { stats: TicketStats, index: number, isLocked: boolean, lockedSet?: Set<number> }) => {
    const isBad = stats.status === 'BAD';
    const opacityClass = isBad && !isLocked ? 'opacity-50 grayscale hover:opacity-100 hover:grayscale-0 transition-all' : '';

    return (
      <div className={`flex flex-col gap-3 p-4 rounded-xl border bg-slate-900/80 shadow-sm ${opacityClass} ${isBad ? 'border-red-900/50 bg-red-900/5' : 'border-slate-800'}`}>

        {/* Row Header: Score & Status */}
        <div className="flex justify-between items-center border-b border-slate-800/50 pb-3 mb-1">
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500 font-mono font-bold">#{index + 1}</span>
            <HealthBadge score={stats.score} status={stats.status} />
          </div>
          {stats.issues.length > 0 && (
            <div className="flex gap-1.5 flex-wrap justify-end">
              {stats.issues.map((issue, i) => (
                <span key={i} className="text-[10px] uppercase font-bold bg-red-950 text-red-400 px-2 py-1 rounded border border-red-900/50">
                  {issue}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Numbers & Stats */}
        <div className="flex flex-col xl:flex-row justify-between items-center gap-4">
          <div className="flex gap-1 md:gap-1.5 flex-nowrap overflow-x-auto max-w-full py-2 px-2 justify-start md:justify-center scrollbar-hide">
            {stats.numbers.map((n, i) => {
              const isDouble = DOUBLE_NUMBERS.includes(n);
              const isMatch = !isLocked && lockedSet?.has(n);

              // LIVE MATRIX: Gold Border Style (No Hot/Cold Colors)
              // LOCKED MATRIX: Green Tint
              let colorClass = 'bg-slate-800 text-slate-200 border border-slate-700';

              if (isLocked) {
                colorClass = 'bg-emerald-900/20 text-emerald-100 border border-emerald-800/50';
              } else {
                // Live Matrix Style: Dark BG + Gold Border + Gold Text
                colorClass = 'bg-slate-950 text-yellow-500 border border-yellow-600/50 shadow-[0_0_8px_rgba(234,179,8,0.15)]';
              }

              // Match highlight for Live Matrix
              if (isMatch && !isLocked) {
                colorClass = 'bg-yellow-900/20 text-yellow-400 border border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.6)] ring-1 ring-yellow-400 z-10 scale-110';
              }

              return (
                <span key={i} className={`relative font-mono font-bold w-7 h-7 md:w-9 md:h-9 flex-none flex items-center justify-center rounded-lg text-xs md:text-base ${colorClass}`}>
                  {n < 10 ? `0${n}` : n}
                  {isDouble && <span className="absolute -top-1 -right-1 w-1.5 h-1.5 md:w-2 md:h-2 bg-purple-500 rounded-full border-2 border-slate-900"></span>}
                </span>
              );
            })}
          </div>

          {/* Mini Indicators (Always Visible) */}
          <div className="flex gap-2 text-xs font-mono font-medium flex-wrap justify-center">
            <span className={`px-2 py-1 rounded border ${stats.sum >= 118 && stats.sum <= 158 ? 'border-slate-700 text-slate-400 bg-slate-800/50' : 'border-red-800 text-red-400 bg-red-900/20'}`}>
              ∑{stats.sum}
            </span>
            <span className={`px-2 py-1 rounded border ${stats.evens >= 2 && stats.evens <= 4 ? 'border-slate-700 text-slate-400 bg-slate-800/50' : 'border-yellow-800 text-yellow-400 bg-yellow-900/20'}`}>
              {stats.evens}C/{stats.odds}L
            </span>
            <span className={`px-2 py-1 rounded border ${stats.highs >= 2 && stats.highs <= 4 ? 'border-slate-700 text-slate-400 bg-slate-800/50' : 'border-blue-800 text-blue-400 bg-blue-900/20'}`}>
              {stats.highs}T/{stats.lows}X
            </span>
            {stats.consecutive && <span className="px-2 py-1 rounded bg-emerald-900/30 text-emerald-400 border border-emerald-800">LiênKề</span>}
          </div>
        </div>
      </div>
    );
  };



  const lineNumbers = useMemo(() => {
    const count = rawData.split('\n').length;
    return Array.from({ length: Math.max(count, 30) }, (_, i) => i + 1).join('\n');
  }, [rawData]);

  const lockedNumbersSet = useMemo(() => {
    if (!lockedMatrix) return new Set<number>();
    const set = new Set<number>();
    lockedMatrix.forEach(ticket => ticket.numbers.forEach(n => set.add(n)));
    return set;
  }, [lockedMatrix]);

  // Helper to render lines for the new 2-column view
  const renderInputLines = () => {
    const allLines = rawData.split('\n');
    const col1 = allLines.slice(0, 15);
    const col2 = allLines.slice(15, 30);
    const history = allLines.slice(30);

    const LineItem = ({ line, idx, isHistory = false }: { line: string, idx: number, isHistory?: boolean }) => (
      <div className={`flex items-center gap-2 font-mono ${isHistory ? 'opacity-30' : 'text-slate-300'}`}>
        <span className="w-6 text-right text-slate-600 select-none">{idx + 1}</span>
        <span className="whitespace-pre">{line}</span>
      </div>
    );

    return (
      <div className="flex flex-col h-full overflow-y-auto p-3 bg-black text-xs md:text-sm leading-loose">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-0">
          {/* Column 1 */}
          <div className="flex flex-col">
            {col1.map((line, i) => <LineItem key={i} line={line} idx={i} />)}
          </div>
          {/* Column 2 */}
          <div className="flex flex-col">
            {col2.map((line, i) => <LineItem key={i + 15} line={line} idx={i + 15} />)}
          </div>
        </div>

        {/* History / Dimmed Lines */}
        {history.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-800/50 flex flex-col">
            <div className="text-[10px] text-slate-700 font-bold uppercase mb-2">Lịch sử (Đã loại bỏ khỏi tính toán)</div>
            {history.map((line, i) => <LineItem key={i + 30} line={line} idx={i + 30} isHistory={true} />)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen h-auto md:h-screen flex flex-col bg-slate-950 text-slate-100 font-sans overflow-x-hidden">

      {/* --- HEADER --- */}
      <header className="h-14 flex-none bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 md:px-6 z-50 sticky top-0">
        <div className="flex items-center gap-3">
          <HeartPulse className="w-6 h-6 text-red-500" />
          <div>
            <h1 className="text-lg font-bold text-emerald-500">
              Mega 6/45 Pro V10.4
            </h1>
            <p className="text-[10px] text-slate-500 font-mono">Full Screen & Mobile Optimized</p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-4">

          {/* --- NEW CONTROLS AREA --- */}
          <div className="flex items-center gap-2">
            {lockedMatrix ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleNextDay}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded shadow-lg border border-blue-500 transition-all font-bold text-xs uppercase animate-pulse"
                  title="Hoàn thành kỳ hiện tại và chuyển sang ngày tiếp theo"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline">Hoàn thành kỳ {currentDay} ➝ {currentDay + 1}</span>
                  <span className="xl:hidden">Kỳ {currentDay}➝{currentDay + 1}</span>
                </button>
                <button
                  onClick={handleUnlock}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded border border-slate-700 transition-colors"
                  title="Mở khóa (Sửa lại)"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={handleLock}
                className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded shadow-lg border border-emerald-500 transition-all font-bold text-xs uppercase"
              >
                <Lock className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Khóa & Tạo Chiến Dịch</span>
              </button>
            )}

            {/* Stats Badge (Compact) */}
            <div className="hidden 2xl:flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded border border-slate-700 opacity-80">
              <Layers className="w-3 h-3 text-emerald-400" />
              <span className="text-xs font-mono text-emerald-400">{processedData.length} Kỳ</span>
              {!lockedMatrix && (
                <>
                  <span className="w-px h-3 bg-slate-700 mx-1"></span>
                  <span className="text-xs font-mono text-yellow-400">Ngày {currentDay}/7</span>
                </>
              )}
            </div>
          </div>

          <div className="flex gap-1">
            <button onClick={handleExport} className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded border border-indigo-500 text-xs flex items-center gap-1 transition-colors">
              <Download className="w-3 h-3" /> <span className="hidden sm:inline">Xuất</span>
            </button>
            <button onClick={handleImport} className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded border border-slate-600 text-xs flex items-center gap-1 transition-colors">
              <Upload className="w-3 h-3" /> <span className="hidden sm:inline">Nạp</span>
            </button>
            <button onClick={handleHardReset} className="px-2 py-1 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded border border-red-900/50 text-xs transition-colors">
              Reset
            </button>
          </div>
        </div>
      </header>

      {/* --- MAIN CONTENT --- */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">

        {/* --- LEFT PANEL: INPUT KHỔNG LỒ --- */}
        <section className="w-full md:w-[40%] flex flex-col border-b md:border-b-0 md:border-r border-slate-800 bg-slate-900/20 relative h-[50vh] md:h-full">

          {/* Toolbar */}
          <div className="flex-none p-2 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-bold text-slate-300">INPUT DATA</span>
            </div>
            {!lockedMatrix && (
              <div className="flex gap-1">
                <button onClick={handleSelectAll} className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white" title="Chọn tất cả">
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={handleCopyInput} className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white" title="Sao chép">
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button onClick={handlePasteInput} className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white" title="Dán">
                  <ClipboardPaste className="w-3.5 h-3.5" />
                </button>
                <div className="w-px h-4 bg-slate-700 mx-1"></div>
                <button onClick={handleClearData} className="p-1.5 hover:bg-red-900/30 rounded text-red-400 hover:text-red-300" title="Xóa hết">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Editor Area */}
          <div className="flex-1 flex flex-col relative overflow-hidden">
            {lockedMatrix ? (
              <div className="absolute inset-0 z-10 flex flex-col">
                {/* New Day Input Overlay */}
                <div className="p-3 bg-emerald-900/10 border-b border-emerald-500/20 flex-none">
                  <label className="text-[10px] font-bold text-emerald-400 uppercase flex items-center gap-2 mb-1">
                    <PlusCircle className="w-3 h-3" /> Cập nhật ngày mới (Auto-Trim)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newDayInput}
                      onChange={(e) => setNewDayInput(e.target.value)}
                      placeholder="VD: 29-11-2023 01 02 03 04 05 06"
                      className="flex-1 bg-slate-950 border border-emerald-500/30 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                      onKeyDown={(e) => e.key === 'Enter' && handleUpdateNewDay()}
                    />
                    <button
                      onClick={handleUpdateNewDay}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded text-xs font-bold whitespace-nowrap"
                    >
                      Thêm
                    </button>
                  </div>
                </div>

                {/* Read Only Content - 2 Columns */}
                <div className="flex-1 overflow-hidden relative">
                  {renderInputLines()}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex overflow-hidden">
                <div ref={lineNumberRef} className="bg-slate-950 text-slate-600 text-sm font-mono p-3 text-right border-r border-slate-800 select-none overflow-hidden w-10">
                  <pre className="leading-loose">{lineNumbers}</pre>
                </div>
                <textarea
                  ref={textareaRef}
                  className="flex-1 bg-black text-sm font-mono p-3 focus:outline-none text-slate-300 whitespace-pre resize-none leading-loose"
                  value={rawData}
                  onChange={(e) => setRawData(e.target.value)}
                  onScroll={() => {
                    if (textareaRef.current && lineNumberRef.current) {
                      lineNumberRef.current.scrollTop = textareaRef.current.scrollTop;
                    }
                  }}
                  placeholder={`DD-MM-YYYY  01  02  03  04  05  06\n...`}
                  spellCheck={false}
                />
              </div>
            )}
          </div>

          {/* Heatmap Comparison */}
          <div className="h-auto border-t border-slate-800 bg-slate-900/30 p-2 flex-none overflow-y-auto">
            <div className="grid grid-cols-2 gap-2">
              <FrequencyHeatmap
                data={frequency}
                title="🔥 Hiện Tại"
                highlight={processedData[0]?.numbers}
                onClick={() => setActiveHeatmap('CURRENT')}
              />
              <FrequencyHeatmap
                data={prevFrequency}
                title="❄️ Trước Đó"
                isPrevious={true}
                onClick={() => setActiveHeatmap('PREVIOUS')}
              />
            </div>
          </div>
        </section>

        {/* --- RIGHT PANEL: MATRIX RỘNG MỞ --- */}
        <section className="flex-1 flex flex-col bg-slate-950 relative h-auto md:h-full overflow-hidden">

          {/* Top Area: Pool & History (Auto-Height) */}
          <div className="flex-none h-auto flex flex-col md:flex-row border-b border-slate-800 bg-slate-900/10">

            {/* LEFT: POOL 10 (Compact - ~35%) */}
            <div className="w-full md:w-[35%] max-w-[450px] p-3 flex flex-col gap-2 border-b md:border-b-0 md:border-r border-slate-800">
              {/* Header + Legend */}
              <div className="flex justify-between items-center flex-none">
                <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  POOL 10
                  <span className="text-[9px] font-normal text-slate-500 normal-case">(Tối ưu)</span>
                </h2>
                <div className="flex gap-2 text-[8px] font-bold bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-800 shadow-sm">
                  <span className="flex items-center gap-1 text-red-500"><Flame className="w-2.5 h-2.5" /> HOT</span>
                  <span className="flex items-center gap-1 text-amber-500"><Zap className="w-2.5 h-2.5" /> WARM</span>
                  <span className="flex items-center gap-1 text-blue-500"><Snowflake className="w-2.5 h-2.5" /> COLD</span>
                </div>
              </div>

              {/* Pool Grid (Auto Height) */}
              <div className="grid grid-cols-5 gap-1.5 content-start">
                {selectedPool.map((item, idx) => (
                  <div key={idx} onClick={() => handleNumberClick(item.num)} className={`
                      relative flex flex-col items-center justify-center rounded shadow-md border-b-2 transition-transform hover:scale-105 cursor-pointer group
                      ${item.type === 'HOT' ? 'bg-gradient-to-br from-red-600 to-red-700 border-red-900' :
                      item.type === 'COLD' ? 'bg-gradient-to-br from-blue-600 to-blue-700 border-blue-900' :
                        'bg-gradient-to-br from-amber-500 to-amber-600 border-amber-800'
                    }
                    `}
                    style={{ height: '45px' }}
                  >
                    <span className="text-lg font-black text-white drop-shadow-md tracking-tighter">{item.num < 10 ? `0${item.num}` : item.num}</span>
                    <span className="absolute top-0.5 right-0.5 text-[10px] font-bold text-white bg-black/40 px-1 rounded shadow-sm">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* RIGHT: HISTORY (Expanded - Auto Height) */}
            <div className="flex-1 bg-slate-900/30 p-3 flex flex-col gap-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase flex-none flex items-center gap-2">
                <History className="w-3.5 h-3.5" /> Lịch sử 7 kỳ gần nhất
              </h3>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-4 gap-y-2">
                {poolHistory.map((hist, idx) => (
                  <div key={idx} className="flex items-center gap-3 text-sm bg-slate-950/80 p-2 rounded border border-slate-800/50 hover:border-slate-700 transition-colors">
                    <div className="w-20 flex-none text-slate-500 font-mono text-[10px] md:text-xs text-right leading-tight border-r border-slate-800 pr-2">
                      {hist.date}
                    </div>
                    <div className="flex-1 flex gap-1.5 flex-wrap">
                      {hist.pool.map((item, i) => {
                        let colorClass = 'text-slate-500';
                        if (item.type === 'HOT') colorClass = 'text-red-400';
                        if (item.type === 'WARM') colorClass = 'text-amber-400';
                        if (item.type === 'COLD') colorClass = 'text-blue-400';
                        return (
                          <span key={i} className={`font-bold font-mono ${colorClass}`}>
                            {item.num < 10 ? `0${item.num}` : item.num}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Bottom Area: Streams (Expanded) */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-800 overflow-hidden">

            {/* LEFT: LOCKED MATRIX */}
            <div className="flex flex-col overflow-hidden bg-slate-900/10 h-[50vh] md:h-full">
              <div className="p-3 border-b border-slate-800 bg-slate-900/50 sticky top-0 z-10 flex justify-between items-center">
                <h3 className="text-xs font-bold text-emerald-500 flex items-center gap-2 uppercase">
                  <Check className="w-3 h-3" /> Luồng Tĩnh (LOCKED)
                </h3>
                {lockedMatrix && <span className="text-[9px] bg-emerald-900/50 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800 font-bold">ĐANG NUÔI</span>}
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin scrollbar-thumb-slate-700">
                {lockedMatrix ? (
                  lockedMatrix.map((stats, idx) => (
                    <TicketRowV10 key={idx} stats={stats} index={idx} isLocked={true} />
                  ))
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-2">
                    <Lock className="w-10 h-10 opacity-20" />
                    <span className="text-sm font-medium">Chưa khóa dữ liệu</span>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT: LIVE MATRIX */}
            <div className="flex flex-col overflow-hidden bg-slate-900/10 h-[50vh] md:h-full">
              <div className="p-3 border-b border-slate-800 bg-slate-900/50 sticky top-0 z-10 flex justify-between items-center">
                <h3 className="text-xs font-bold text-amber-500 flex items-center gap-2 uppercase">
                  <Activity className="w-3 h-3" /> Luồng Động (LIVE)
                </h3>
                <span className="text-[9px] bg-amber-900/50 text-amber-300 px-2 py-0.5 rounded border border-amber-800 font-bold">AUTO-UPDATE</span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin scrollbar-thumb-slate-700">
                {generatedMatrix.map((stats, idx) => (
                  <TicketRowV10 key={idx} stats={stats} index={idx} isLocked={false} lockedSet={lockedNumbersSet} />
                ))}
              </div>
            </div>

          </div>
        </section>

      </main>

      {/* --- HEATMAP MODAL --- */}
      {activeHeatmap && (
        <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setActiveHeatmap(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 w-full max-w-lg shadow-2xl scale-100 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                {activeHeatmap === 'CURRENT' ? '🔥 Heatmap Hiện Tại' : '❄️ Heatmap Trước Đó'}
              </h3>
              <button onClick={() => setActiveHeatmap(null)} className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 text-slate-400">
                <Check className="w-5 h-5" />
              </button>
            </div>

            {/* Render Large Heatmap */}
            <div className="grid grid-cols-8 gap-2">
              {Array.from({ length: 45 }, (_, i) => i + 1).map(num => {
                const data = activeHeatmap === 'CURRENT' ? frequency : prevFrequency;
                const freq = data[num] || 0;
                const highlight = activeHeatmap === 'CURRENT' ? processedData[0]?.numbers : [];
                const isHighlighted = highlight?.includes(num);

                // Recalculate thresholds for this specific dataset
                const vals = Object.values(data);
                const max = Math.max(...vals, 1);
                const min = Math.min(...vals, 0);
                const range = max - min;
                const hotThreshold = max - (range / 3);
                const coldThreshold = min + (range / 3);

                let bgClass = 'bg-slate-800 text-slate-500 border-slate-700';
                if (freq > 0) {
                  if (freq >= hotThreshold) {
                    bgClass = 'bg-red-600 text-white border-red-800 shadow-red-900/50';
                  } else if (freq <= coldThreshold) {
                    bgClass = 'bg-blue-600 text-white border-blue-800 shadow-blue-900/50';
                  } else {
                    bgClass = 'bg-amber-500 text-black border-amber-700 shadow-amber-900/50';
                  }
                }

                return (
                  <div
                    key={num}
                    className={`
                      relative w-full aspect-square rounded-full flex flex-col items-center justify-center border-[3px]
                      ${bgClass}
                      ${isHighlighted ? 'ring-2 ring-white scale-110 z-10 shadow-lg' : ''}
                    `}
                  >
                    <span className="text-sm md:text-lg font-bold leading-none">{num < 10 ? `0${num}` : num}</span>
                    <span className="text-[10px] md:text-xs font-bold leading-none mt-0.5 opacity-80">{freq}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: NUMBER INSIGHT --- */}
      {insightNumber && (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setInsightNumber(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl scale-100 animate-in zoom-in-95 duration-200 relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setInsightNumber(null)} className="absolute top-3 right-3 text-slate-500 hover:text-white"><X className="w-5 h-5" /></button>

            <div className="flex flex-col items-center mb-6">
              <div className={`w-20 h-20 rounded-2xl flex items-center justify-center text-4xl font-black text-white mb-3 shadow-lg border-b-4 ${insightNumber.type === 'HOT' ? 'bg-red-600 border-red-800' : insightNumber.type === 'COLD' ? 'bg-blue-600 border-blue-800' : 'bg-amber-500 border-amber-700'}`}>
                {insightNumber.num < 10 ? `0${insightNumber.num}` : insightNumber.num}
              </div>
              <h3 className={`text-lg font-bold uppercase tracking-wider ${insightNumber.type === 'HOT' ? 'text-red-500' : insightNumber.type === 'COLD' ? 'text-blue-500' : 'text-amber-500'}`}>
                {insightNumber.type === 'HOT' ? 'RẤT HOT 🔥' : insightNumber.type === 'COLD' ? 'ĐANG LẠNH ❄️' : 'TRUNG BÌNH ⚡'}
              </h3>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-slate-950 rounded border border-slate-800">
                <span className="text-slate-400 text-sm flex items-center gap-2"><Calendar className="w-4 h-4" /> Gần nhất</span>
                <span className="text-white font-mono font-bold">{insightNumber.lastDate}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-950 rounded border border-slate-800">
                <span className="text-slate-400 text-sm flex items-center gap-2"><Activity className="w-4 h-4" /> Tổng xuất hiện</span>
                <span className="text-white font-mono font-bold">{insightNumber.totalFreq} lần / 30 kỳ</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-950 rounded border border-slate-800">
                <span className="text-slate-400 text-sm flex items-center gap-2"><History className="w-4 h-4" /> Gan hiện tại</span>
                <span className={`font-mono font-bold ${insightNumber.currentGap > 5 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {insightNumber.currentGap === 0 ? 'Vừa ra' : `${insightNumber.currentGap} kỳ chưa ra`}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-950 rounded border border-slate-800">
                <span className="text-slate-400 text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Streak dài nhất</span>
                <span className="text-yellow-400 font-mono font-bold">{insightNumber.maxStreak} kỳ liên tiếp</span>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Mega645AnalyzerV10;
