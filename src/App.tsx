import { useState, useEffect, useMemo, useRef } from 'react';
import { BarChart, Bar, Tooltip, ResponsiveContainer, XAxis, YAxis, CartesianGrid, LabelList } from 'recharts';
import { Save, FileSpreadsheet, RotateCcw, Calendar, Check, Activity, HeartPulse, Flame, Snowflake, Layers, Download, Upload } from 'lucide-react';

// --- CONSTANTS & CONFIG ---
const TOTAL_NUMBERS = 45;
const DOUBLE_NUMBERS = [11, 22, 33, 44];
const WHEEL_TEMPLATE = [
  [0, 1, 2, 3, 4, 5], [0, 1, 2, 6, 7, 8], [0, 1, 3, 4, 6, 9],
  [0, 2, 3, 5, 7, 8], [1, 4, 5, 6, 8, 9], [2, 3, 4, 7, 8, 9],
  [0, 3, 5, 6, 7, 9], [1, 2, 4, 5, 8, 9], [3, 4, 6, 7, 8, 5], [0, 1, 2, 9, 4, 8]
];

// Sample Data (Expanded to 30 lines)
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
  highs: number; // > 22
  lows: number;  // <= 22
  consecutive: boolean;
  doublesCount: number;
  score: number;
  status: 'EXCELLENT' | 'GOOD' | 'WARNING' | 'BAD';
  issues: string[];
};

const Mega645AnalyzerV4 = () => {
  // --- STATE ---
  const [rawData, setRawData] = useState(() => localStorage.getItem('mega645_rawData') || INITIAL_EXCEL_DATA);
  const [processedData, setProcessedData] = useState<{ date: string, numbers: number[] }[]>([]);
  const [frequency, setFrequency] = useState<Record<number, number>>({});
  const [selectedPool, setSelectedPool] = useState<{ num: number, type: string, count: number }[]>([]);

  // Strategy State
  const [currentDay, setCurrentDay] = useState(() => parseInt(localStorage.getItem('mega645_currentDay') || '1'));
  const [generatedMatrix, setGeneratedMatrix] = useState<TicketStats[]>([]);
  const [lockedMatrix, setLockedMatrix] = useState<TicketStats[] | null>(() => {
    const saved = localStorage.getItem('mega645_lockedMatrix');
    return saved ? JSON.parse(saved) : null;
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumberRef = useRef<HTMLDivElement>(null);

  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [lastSaved, setLastSaved] = useState<string>("");

  // --- PERSISTENCE ---
  useEffect(() => {
    setSaveStatus('saving');
    const timer = setTimeout(() => {
      localStorage.setItem('mega645_rawData', rawData);
      localStorage.setItem('mega645_currentDay', currentDay.toString());
      if (lockedMatrix) {
        localStorage.setItem('mega645_lockedMatrix', JSON.stringify(lockedMatrix));
      } else {
        localStorage.removeItem('mega645_lockedMatrix');
      }
      setSaveStatus('saved');
      setLastSaved(new Date().toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit' }));
    }, 500);
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

  // --- ENGINE: TICKET HEALTH SCORING ---
  const calculateTicketHealth = (numbers: number[]): TicketStats => {
    // 1. Basic Stats
    const sum = numbers.reduce((a, b) => a + b, 0);
    const evens = numbers.filter(n => n % 2 === 0).length;
    const odds = 6 - evens;
    const highs = numbers.filter(n => n > 22).length;
    const lows = 6 - highs;
    const doublesCount = numbers.filter(n => DOUBLE_NUMBERS.includes(n)).length;

    // Check Consecutive
    const sorted = [...numbers].sort((a, b) => a - b);
    let consecutive = false;
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i + 1] === sorted[i] + 1) {
        consecutive = true;
        break;
      }
    }

    // 2. Scoring Logic (Base 100)
    let score = 100;
    let issues: string[] = [];

    // Filter A: Sum (Tổng) - Critical
    if (sum >= 118 && sum <= 158) {
      // Perfect zone
    } else if ((sum >= 100 && sum < 118) || (sum > 158 && sum <= 200)) {
      score -= 15;
      issues.push(`Tổng lệch (${sum})`);
    } else {
      score -= 40; // Critical penalty
      issues.push(`Tổng cực đoan (${sum})`);
    }

    // Filter B: Parity (Chẵn/Lẻ) - Critical
    if (evens === 0 || evens === 6) {
      score -= 40;
      issues.push(`Chẵn/Lẻ lệch (0-6)`);
    } else if (evens === 1 || evens === 5) {
      score -= 15;
      issues.push(`Chẵn/Lẻ lệch (1-5)`);
    }

    // Filter C: High/Low (Tài/Xỉu) - High Priority
    if (highs === 0 || highs === 6) {
      score -= 30;
      issues.push(`Tài/Xỉu lệch (0-6)`);
    } else if (highs === 1 || highs === 5) {
      score -= 10;
      issues.push(`Tài/Xỉu lệch (1-5)`);
    }

    // Filter D: Consecutive (Liền kề) - Bonus
    if (consecutive) {
      score += 5; // Bonus for good pattern
    } else {
      score -= 5; // Slight penalty for being too scattered
    }

    // Filter E: Doubles (Số Kép) - Overdose check
    if (doublesCount > 2) {
      score -= 20;
      issues.push(`Dư thừa số Kép (${doublesCount})`);
    }

    // Cap Score
    score = Math.min(100, Math.max(0, score));

    // Determine Status
    let status: TicketStats['status'] = 'GOOD';
    if (score >= 90) status = 'EXCELLENT';
    else if (score >= 70) status = 'GOOD';
    else if (score >= 50) status = 'WARNING';
    else status = 'BAD';

    return { numbers: sorted, sum, evens, odds, highs, lows, consecutive, doublesCount, score, status, issues };
  };

  // --- ENGINE: DATA PROCESSING ---
  useEffect(() => {
    // V9: Auto-Trim - Only process top 30 lines to prevent dilution
    const lines = rawData.trim().split('\n').slice(0, 30);
    const validDraws: { date: string, numbers: number[] }[] = [];
    const freqMap: Record<number, number> = {};
    for (let i = 1; i <= TOTAL_NUMBERS; i++) freqMap[i] = 0;

    lines.forEach(line => {
      // Robust Parsing Strategy:
      // 1. Identify Date (if any) for display
      // 2. Extract all numbers 1-45
      // 3. Take the LAST 6 valid numbers as the draw result

      const parts = line.trim().split(/[\t,;|\s]+/);
      let dateStr = "N/A";

      // Try to find a date-like string at the start
      if (parts[0] && (parts[0].includes('/') || parts[0].includes('-') || parts[0].includes('.'))) {
        dateStr = parts[0].replace(/[/. ]/g, '-');
      }

      // Extract all numbers from the line
      const allNumbers = line.match(/\d+/g)?.map(n => parseInt(n)).filter(n => !isNaN(n)) || [];

      // Filter only valid lottery numbers (1-45)
      const validRangeNumbers = allNumbers.filter(n => n >= 1 && n <= 45);

      // We assume the last 6 valid numbers are the balls
      if (validRangeNumbers.length >= 6) {
        const finalNums = validRangeNumbers.slice(-6);
        validDraws.push({ date: dateStr, numbers: finalNums });
        finalNums.forEach(n => { if (freqMap[n] !== undefined) freqMap[n]++; });
      }
    });

    setProcessedData(validDraws);
    setFrequency(freqMap);
  }, [rawData]);

  // --- ENGINE: 3-4-3 SELECTION & MATRIX GENERATION ---
  useEffect(() => {
    const freqArray = Object.keys(frequency).map(k => ({ num: parseInt(k), count: frequency[parseInt(k)] }));
    if (freqArray.length === 0) return;

    freqArray.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.num - b.num; // Deterministic tie-breaker
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

    // Calculate Health for each ticket in matrix
    const analyzedMatrix = rawMatrix.map(ticketNums => calculateTicketHealth(ticketNums));
    setGeneratedMatrix(analyzedMatrix);

  }, [frequency]);

  // --- HANDLERS ---
  const handleLock = () => { setLockedMatrix(generatedMatrix); setCurrentDay(1); };
  const handleReset = () => { setLockedMatrix(null); setCurrentDay(1); };
  const handleNextDay = () => { if (currentDay < 7) setCurrentDay(currentDay + 1); };

  const handleExport = async () => {
    try {
      // COMPRESSION: Use short keys (r=rawData, d=currentDay, l=lockedMatrix numbers only, t=timestamp)
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
        alert(`✅ Đã COPY Mã Dữ Liệu (Đã nén)!\n\nĐộ dài mã: ${code.length} ký tự.\nGửi mã này qua Zalo/Messenger để đồng bộ.`);
      } catch (clipboardError) {
        prompt("Copy thủ công mã dưới đây:", code);
      }
    } catch (e) {
      alert("❌ Lỗi khi tạo mã: " + (e as Error).message);
    }
  };

  const handleImport = () => {
    const code = prompt("Dán Mã Dữ Liệu (từ thiết bị khác) vào đây:");
    if (!code) return;
    try {
      const decoded = decodeURIComponent(escape(atob(code)));
      const data = JSON.parse(decoded);

      // Support both Old (Long) and New (Minified) formats
      const rawDataVal = data.r || data.rawData;
      const currentDayVal = data.d !== undefined ? data.d : data.currentDay;
      const timestampVal = data.t || data.timestamp;
      const lockedRaw = data.l || data.lockedMatrix;

      if (rawDataVal && currentDayVal !== undefined) {
        if (window.confirm(`Tìm thấy bản sao lưu lúc ${new Date(timestampVal).toLocaleString('vi-VN')}.\nBạn có muốn ghi đè dữ liệu hiện tại không?`)) {
          setRawData(rawDataVal);
          setCurrentDay(currentDayVal);

          // Reconstruct Locked Matrix Stats
          if (lockedRaw) {
            // Check if it's the new format (array of numbers) or old (array of objects)
            const isMinified = Array.isArray(lockedRaw[0]) && typeof lockedRaw[0][0] === 'number';

            if (isMinified) {
              // Re-run engine to get full stats
              const reconstructed = lockedRaw.map((nums: number[]) => calculateTicketHealth(nums));
              setLockedMatrix(reconstructed);
            } else {
              // Old format, use as is
              setLockedMatrix(lockedRaw);
            }
          } else {
            setLockedMatrix(null);
          }

          alert("✅ Đồng bộ & Giải nén thành công!");
        }
      } else {
        alert("❌ Mã dữ liệu không hợp lệ.");
      }
    } catch (e) {
      alert("❌ Lỗi: Mã không đúng định dạng.");
    }
  };

  // --- COMPONENTS ---
  const HealthBadge = ({ score, status }: { score: number, status: string }) => {
    let color = 'bg-slate-500';
    if (status === 'EXCELLENT') color = 'bg-emerald-500';
    if (status === 'GOOD') color = 'bg-blue-500';
    if (status === 'WARNING') color = 'bg-yellow-500';
    if (status === 'BAD') color = 'bg-red-500';

    return (
      <div className="flex items-center gap-2" title={`Điểm sức khỏe: ${score}/100`}>
        <div className="w-16 h-2 bg-slate-700 rounded-full overflow-hidden">
          <div className={`h-full ${color}`} style={{ width: `${score}%` }}></div>
        </div>
        <span className={`text-[10px] font-bold px-1 rounded ${color.replace('bg-', 'text-')} bg-opacity-20 border border-opacity-50 border-${color.replace('bg-', '')}`}>
          {score}
        </span>
      </div>
    );
  };

  const TicketRowV4 = ({ stats, index, isLocked, lockedSet }: { stats: TicketStats, index: number, isLocked: boolean, lockedSet?: Set<number> }) => {
    const isBad = stats.status === 'BAD';
    const opacityClass = isBad && !isLocked ? 'opacity-50 grayscale hover:opacity-100 hover:grayscale-0 transition-all' : '';

    return (
      <div className={`flex flex-col gap-2 p-3 rounded-lg border bg-slate-900 ${opacityClass} ${isBad ? 'border-red-900/50 bg-red-900/5' : 'border-slate-800'}`}>

        {/* Row Header: Score & Status */}
        <div className="flex justify-between items-center border-b border-slate-800/50 pb-2 mb-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-mono">#{index + 1}</span>
            <HealthBadge score={stats.score} status={stats.status} />
          </div>
          {stats.issues.length > 0 && (
            <div className="flex gap-1">
              {stats.issues.map((issue, i) => (
                <span key={i} className="text-[9px] bg-red-900/40 text-red-300 px-1.5 py-0.5 rounded border border-red-800/50">
                  {issue}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Numbers & Stats */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="flex gap-2">
            {stats.numbers.map((n, i) => {
              const isDouble = DOUBLE_NUMBERS.includes(n);
              const isMatch = !isLocked && lockedSet?.has(n);

              return (
                <span key={i} className={`relative font-mono font-bold w-7 h-7 flex items-center justify-center rounded 
                  ${n === 0 ? 'text-slate-700' :
                    isLocked ? 'bg-emerald-900/20 text-emerald-100 border border-emerald-800/50' :
                      isMatch ? 'bg-yellow-900/20 text-yellow-400 border border-yellow-500/50 shadow-[0_0_10px_rgba(234,179,8,0.1)]' :
                        'bg-slate-800 text-slate-200 border border-slate-700'
                  }`}>
                  {n < 10 ? `0${n}` : n}
                  {isDouble && <span className="absolute -top-1 -right-1 w-2 h-2 bg-purple-500 rounded-full animate-pulse"></span>}
                </span>
              );
            })}
          </div>

          {/* Mini Indicators */}
          <div className="flex gap-2 text-[10px] font-mono opacity-80">
            <span className={`px-1.5 py-0.5 rounded border ${stats.sum >= 118 && stats.sum <= 158 ? 'border-slate-700 text-slate-400' : 'border-red-800 text-red-400 bg-red-900/10'}`}>
              ∑{stats.sum}
            </span>
            <span className={`px-1.5 py-0.5 rounded border ${stats.evens >= 2 && stats.evens <= 4 ? 'border-slate-700 text-slate-400' : 'border-yellow-800 text-yellow-400 bg-yellow-900/10'}`}>
              {stats.evens}C/{stats.odds}L
            </span>
            <span className={`px-1.5 py-0.5 rounded border ${stats.highs >= 2 && stats.highs <= 4 ? 'border-slate-700 text-slate-400' : 'border-blue-800 text-blue-400 bg-blue-900/10'}`}>
              {stats.highs}T/{stats.lows}X
            </span>
            {stats.consecutive && <span className="px-1.5 py-0.5 rounded bg-emerald-900/30 text-emerald-400 border border-emerald-800">LiênKề</span>}
          </div>
        </div>
      </div>
    );
  };

  const chartData = useMemo(() => {
    return Object.keys(frequency)
      .map(k => ({ name: k, freq: frequency[parseInt(k)] }))
      .sort((a, b) => parseInt(a.name) - parseInt(b.name));
  }, [frequency]);

  // Generate line numbers
  const lineNumbers = useMemo(() => {
    const count = rawData.split('\n').length;
    return Array.from({ length: Math.max(count, 30) }, (_, i) => i + 1).join('\n');
  }, [rawData]);

  // Flatten locked matrix for comparison
  const lockedNumbersSet = useMemo(() => {
    if (!lockedMatrix) return new Set<number>();
    const set = new Set<number>();
    lockedMatrix.forEach(ticket => ticket.numbers.forEach(n => set.add(n)));
    return set;
  }, [lockedMatrix]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-4 xl:p-6">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-emerald-500 flex items-center gap-2">
            <HeartPulse className="w-8 h-8 text-red-500" />
            Mega 6/45 Pro V9: Auto-Trim Logic
          </h1>
          <div className="flex items-center gap-3">
            <p className="text-slate-400 text-xs mt-1 font-mono">Engine: 3-4-3 Selection + 5-Filter Scoring System</p>
            {saveStatus === 'saved' ? (
              <span className="text-[10px] text-emerald-500 flex items-center gap-1 bg-emerald-900/20 px-2 py-0.5 rounded border border-emerald-900/50">
                <Check className="w-3 h-3" /> Đã lưu: {lastSaved}
              </span>
            ) : (
              <span className="text-[10px] text-yellow-500 flex items-center gap-1 bg-yellow-900/20 px-2 py-0.5 rounded border border-yellow-900/50">
                <RotateCcw className="w-3 h-3 animate-spin" /> Đang lưu...
              </span>
            )}
          </div>
        </div>
        <div className="mt-4 md:mt-0 flex flex-wrap gap-2 justify-end">
          <button onClick={handleExport} className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded border border-indigo-500 text-xs flex items-center gap-1 transition-colors">
            <Download className="w-3 h-3" /> Xuất Mã
          </button>
          <button onClick={handleImport} className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded border border-slate-600 text-xs flex items-center gap-1 transition-colors">
            <Upload className="w-3 h-3" /> Nạp Mã
          </button>
          <div className="w-px h-6 bg-slate-800 mx-1"></div>
          <button onClick={handleHardReset} className="px-3 py-1 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded border border-red-900/50 text-xs transition-colors">
            Reset All
          </button>
          <div className="px-3 py-1 bg-slate-900 rounded border border-slate-800 text-xs flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            <span>Pool: {processedData.length} Kỳ</span>
          </div>
          <div className="px-3 py-1 bg-slate-900 rounded border border-slate-800 text-xs flex items-center gap-2">
            <Calendar className="w-4 h-4 text-yellow-400" />
            <span>Timeline: {currentDay}/7</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">

        {/* LEFT PANEL: INPUT & CHART (4 Cols) */}
        <div className="xl:col-span-4 space-y-4">
          {/* INPUT AREA */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 flex flex-col h-[500px]">
            <div className="p-3 border-b border-slate-800 bg-slate-800/50 flex justify-between items-center">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" /> Dữ liệu Đầu vào
              </span>
              <span className="text-[10px] text-slate-500">Hỗ trợ Excel copy-paste</span>
            </div>

            <div className="flex flex-1 overflow-hidden relative">
              {/* Line Numbers */}
              <div ref={lineNumberRef} className="bg-slate-950 text-slate-600 text-[10px] font-mono p-3 text-right border-r border-slate-800 select-none overflow-hidden w-10">
                <pre className="leading-relaxed">{lineNumbers}</pre>
              </div>

              {/* Text Area */}
              <textarea
                ref={textareaRef}
                className="flex-1 bg-black text-[10px] font-mono p-3 focus:outline-none text-slate-300 whitespace-pre resize-none leading-relaxed"
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

            <div className="h-40 border-t border-slate-800 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tickFormatter={(val) => parseInt(val) < 10 ? `0${val}` : val}
                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                    interval={0}
                  />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '12px', color: '#fff' }}
                    cursor={{ fill: '#334155', opacity: 0.2 }}
                    formatter={(value: number) => [`${value} lần`, 'Xuất hiện']}
                    labelFormatter={(label) => `Số ${parseInt(label) < 10 ? '0' + label : label}`}
                  />
                  <Bar dataKey="freq" fill="#10b981" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="freq" position="top" fill="#fff" fontSize={10} formatter={(val: any) => Number(val) > 0 ? String(val) : ''} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: CORE LOGIC (8 Cols) */}
        <div className="xl:col-span-8 space-y-6">

          {/* POOL DISPLAY */}
          <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-lg">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-sm font-bold text-slate-300 uppercase">Pool 10 Số Tối Ưu</h3>
              <div className="flex gap-4 text-[10px] text-slate-500">
                <span className="flex items-center gap-1"><Flame className="w-3 h-3 text-red-500" /> HOT</span>
                <span className="flex items-center gap-1"><Activity className="w-3 h-3 text-amber-500" /> WARM</span>
                <span className="flex items-center gap-1"><Snowflake className="w-3 h-3 text-blue-500" /> COLD</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {selectedPool.map((item, idx) => (
                <div key={idx} className={`flex flex-col items-center justify-center w-12 h-14 rounded-lg border-b-4 shadow-lg transition-transform hover:scale-110 ${item.type === 'HOT' ? 'bg-gradient-to-br from-red-500 to-red-700 border-red-900' :
                  item.type === 'COLD' ? 'bg-gradient-to-br from-blue-500 to-blue-700 border-blue-900' :
                    'bg-gradient-to-br from-amber-500 to-amber-700 border-amber-900'
                  }`}>
                  <span className="text-lg font-bold text-white leading-none">
                    {item.num < 10 ? `0${item.num}` : item.num}
                  </span>
                  <span className="text-[10px] font-medium text-white/80 mt-1">
                    {item.count}L
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* CONTROLS */}
          <div className="flex gap-3">
            {!lockedMatrix ? (
              <button onClick={handleLock} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-lg font-bold shadow-lg shadow-emerald-900/20 transition-all flex justify-center items-center gap-2 border border-emerald-500/50">
                <Save className="w-5 h-5" /> KÍCH HOẠT CHIẾN DỊCH (NGÀY 1)
              </button>
            ) : (
              <>
                <button onClick={handleNextDay} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg font-bold transition-all flex justify-center items-center gap-2 border border-blue-500/50">
                  <Calendar className="w-5 h-5" /> HOÀN THÀNH KỲ {currentDay} {'->'} {currentDay + 1}
                </button>
                <button onClick={handleReset} title="Reset" className="px-6 bg-slate-800 hover:bg-slate-700 text-red-400 rounded-lg font-bold border border-slate-700 transition-colors">
                  <RotateCcw className="w-5 h-5" />
                </button>
              </>
            )}
          </div>

          {/* MATRICES COMPARISON */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* LOCKED MATRIX */}
            <div className={`rounded-xl border p-1 ${lockedMatrix ? 'bg-slate-900 border-emerald-500/50' : 'bg-slate-900/30 border-slate-800 dashed'}`}>
              <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 rounded-t-xl">
                <div>
                  <h3 className="font-bold text-white text-sm flex items-center gap-2">
                    <Check className={`w-4 h-4 ${lockedMatrix ? 'text-emerald-400' : 'text-slate-600'}`} />
                    Luồng Tĩnh (LOCKED)
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-0.5 ml-6">Cố định - Không đổi khi nhập mới</p>
                </div>
                {lockedMatrix && <span className="text-[10px] bg-emerald-900 text-emerald-400 px-2 py-0.5 rounded">ĐANG NUÔI</span>}
              </div>

              <div className="p-3 space-y-3 max-h-[600px] overflow-y-auto">
                {lockedMatrix ? (
                  lockedMatrix.map((stats, idx) => (
                    <TicketRowV4 key={idx} stats={stats} index={idx} isLocked={true} />
                  ))
                ) : (
                  <div className="text-center py-10 text-slate-600 text-xs italic">
                    Chưa chốt số. <br />Nhấn nút xanh ở trên để bắt đầu.
                  </div>
                )}
              </div>
            </div>

            {/* LIVE SUGGESTION */}
            <div className="rounded-xl border border-slate-800 bg-slate-900">
              <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-800/50 rounded-t-xl">
                <div>
                  <h3 className="font-bold text-slate-300 text-sm flex items-center gap-2">
                    <Activity className="w-4 h-4 text-yellow-500" />
                    Luồng Động (LIVE)
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-0.5 ml-6">Tự động tính lại theo dữ liệu mới</p>
                </div>
                <span className="text-[10px] text-yellow-500/80 bg-yellow-900/10 px-2 py-0.5 rounded border border-yellow-900/30">Auto-Update</span>
              </div>

              <div className="p-3 space-y-3 max-h-[600px] overflow-y-auto">
                {generatedMatrix.map((stats, idx) => (
                  <TicketRowV4 key={idx} stats={stats} index={idx} isLocked={false} lockedSet={lockedNumbersSet} />
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default Mega645AnalyzerV4;
