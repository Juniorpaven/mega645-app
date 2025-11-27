import { useState, useEffect, useMemo, useRef } from 'react';
import { BarChart, Bar, Tooltip, ResponsiveContainer } from 'recharts';
import { FileSpreadsheet, RotateCcw, Calendar, Check, Activity, HeartPulse, Layers, Download, Upload, Trash2, PlusCircle, Copy, ClipboardPaste, Maximize2, Unlock, Lock } from 'lucide-react';

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

const Mega645AnalyzerV10 = () => {
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

  const [newDayInput, setNewDayInput] = useState('');

  // --- PERSISTENCE ---
  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem('mega645_rawData', rawData);
      localStorage.setItem('mega645_currentDay', currentDay.toString());
      if (lockedMatrix) {
        localStorage.setItem('mega645_lockedMatrix', JSON.stringify(lockedMatrix));
      } else {
        localStorage.removeItem('mega645_lockedMatrix');
      }
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
    const newLines = [newDayInput.trim(), ...currentLines].slice(0, 30);

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
    const lines = rawData.trim().split('\n').slice(0, 30);
    const validDraws: { date: string, numbers: number[] }[] = [];
    const freqMap: Record<number, number> = {};
    for (let i = 1; i <= TOTAL_NUMBERS; i++) freqMap[i] = 0;

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

    setProcessedData(validDraws);
    setFrequency(freqMap);
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
  const HealthBadge = ({ score, status }: { score: number, status: string }) => {
    let color = 'bg-slate-500';
    if (status === 'EXCELLENT') color = 'bg-emerald-500';
    if (status === 'GOOD') color = 'bg-blue-500';
    if (status === 'WARNING') color = 'bg-amber-500';
    if (status === 'BAD') color = 'bg-red-500';

    return (
      <div className="flex items-center gap-2" title={`Score: ${score}`}>
        <div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div className={`h-full ${color}`} style={{ width: `${score}%` }}></div>
        </div>
        <span className={`text-[10px] font-bold ${color.replace('bg-', 'text-')}`}>
          {score}
        </span>
      </div>
    );
  };

  const TicketRowV10 = ({ stats, index, isLocked, lockedSet }: { stats: TicketStats, index: number, isLocked: boolean, lockedSet?: Set<number> }) => {
    const isBad = stats.status === 'BAD';

    return (
      <div className={`group relative flex flex-col gap-1 p-3 rounded-lg border backdrop-blur-sm transition-all duration-300
        ${isBad && !isLocked ? 'opacity-60 grayscale hover:opacity-100 hover:grayscale-0' : ''}
        ${isLocked
          ? 'bg-emerald-950/30 border-emerald-500/30 hover:bg-emerald-950/50'
          : 'bg-slate-900/40 border-slate-800 hover:border-amber-500/50 hover:bg-slate-800/60'
        }
      `}>
        <div className="flex justify-between items-center mb-1">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-mono font-bold ${isLocked ? 'text-emerald-500' : 'text-slate-500'}`}>#{index + 1}</span>
            <HealthBadge score={stats.score} status={stats.status} />
          </div>
          {stats.issues.length > 0 && (
            <span className="text-[9px] text-red-400 bg-red-900/20 px-1.5 py-0.5 rounded border border-red-900/30 truncate max-w-[120px]">
              {stats.issues[0]} {stats.issues.length > 1 && `+${stats.issues.length - 1}`}
            </span>
          )}
        </div>

        <div className="flex justify-between items-center gap-2">
          <div className="flex gap-1.5">
            {stats.numbers.map((n, i) => {
              const isDouble = DOUBLE_NUMBERS.includes(n);
              const isMatch = !isLocked && lockedSet?.has(n);
              return (
                <div key={i} className={`
                  w-8 h-8 flex items-center justify-center rounded-md font-mono font-bold text-sm relative overflow-hidden
                  ${isLocked
                    ? 'bg-emerald-900/40 text-emerald-100 border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.1)]'
                    : isMatch
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                      : 'bg-slate-800/80 text-slate-300 border border-slate-700'
                  }
                `}>
                  {n < 10 ? `0${n}` : n}
                  {isDouble && <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-purple-500 rounded-bl-md"></div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Micro Stats */}
        <div className="flex gap-2 mt-1 text-[9px] font-mono text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
          <span>∑:{stats.sum}</span>
          <span>{stats.evens}C/{stats.odds}L</span>
          <span>{stats.highs}T/{stats.lows}X</span>
        </div>
      </div>
    );
  };

  const chartData = useMemo(() => {
    return Object.keys(frequency)
      .map(k => ({ name: k, freq: frequency[parseInt(k)] }))
      .sort((a, b) => parseInt(a.name) - parseInt(b.name));
  }, [frequency]);

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

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-slate-200 font-sans overflow-hidden selection:bg-emerald-500/30">

      {/* --- HEADER --- */}
      <header className="h-14 flex-none bg-slate-900/80 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-6 z-50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-lg shadow-lg shadow-emerald-900/50">
            <HeartPulse className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-amber-400">
              Mega 6/45 Pro V10
            </h1>
            <p className="text-[10px] text-slate-500 font-mono tracking-wider">THE LUCKY PROFESSIONAL EDITION</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-full border border-slate-700">
            <Layers className="w-3 h-3 text-emerald-400" />
            <span className="text-xs font-mono text-emerald-400">{processedData.length} Kỳ</span>
            <span className="w-px h-3 bg-slate-700 mx-1"></span>
            <Calendar className="w-3 h-3 text-amber-400" />
            <span className="text-xs font-mono text-amber-400">Ngày {currentDay}/7</span>
          </div>

          <div className="flex gap-1">
            <button onClick={handleExport} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors" title="Xuất dữ liệu">
              <Download className="w-4 h-4" />
            </button>
            <button onClick={handleImport} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors" title="Nhập dữ liệu">
              <Upload className="w-4 h-4" />
            </button>
            <button onClick={handleHardReset} className="p-2 hover:bg-red-900/20 rounded-lg text-red-400 hover:text-red-300 transition-colors" title="Reset All">
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* --- MAIN CONTENT --- */}
      <main className="flex-1 flex overflow-hidden">

        {/* --- LEFT PANEL: INPUT KHỔNG LỒ --- */}
        <section className="w-[40%] flex flex-col border-r border-slate-800 bg-slate-900/20 backdrop-blur-sm relative">

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
                <div className="p-4 bg-emerald-900/10 border-b border-emerald-500/20 backdrop-blur-md">
                  <label className="text-xs font-bold text-emerald-400 uppercase flex items-center gap-2 mb-2">
                    <PlusCircle className="w-4 h-4" /> Cập nhật ngày mới (Auto-Trim)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newDayInput}
                      onChange={(e) => setNewDayInput(e.target.value)}
                      placeholder="VD: 29-11-2023 01 02 03 04 05 06"
                      className="flex-1 bg-slate-950/80 border border-emerald-500/30 rounded-lg px-4 py-3 text-sm text-emerald-100 font-mono focus:outline-none focus:border-emerald-500 shadow-inner"
                      onKeyDown={(e) => e.key === 'Enter' && handleUpdateNewDay()}
                    />
                    <button
                      onClick={handleUpdateNewDay}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg shadow-emerald-900/20 transition-all"
                    >
                      Thêm
                    </button>
                  </div>
                </div>

                {/* Read Only Content */}
                <div className="flex-1 flex overflow-hidden opacity-50 grayscale-[0.5] pointer-events-none">
                  <div className="bg-slate-950/50 text-slate-600 text-xs font-mono p-4 text-right border-r border-slate-800 select-none w-12">
                    <pre className="leading-loose">{Array.from({ length: 30 }, (_, i) => i + 1).join('\n')}</pre>
                  </div>
                  <textarea
                    className="flex-1 bg-transparent text-sm font-mono p-4 text-slate-300 resize-none leading-loose"
                    value={rawData}
                    readOnly
                  />
                </div>
              </div>
            ) : (
              <div className="flex-1 flex overflow-hidden">
                <div ref={lineNumberRef} className="bg-slate-950/50 text-slate-600 text-xs font-mono p-4 text-right border-r border-slate-800 select-none overflow-hidden w-12">
                  <pre className="leading-loose">{lineNumbers}</pre>
                </div>
                <textarea
                  ref={textareaRef}
                  className="flex-1 bg-transparent text-sm font-mono p-4 focus:outline-none text-slate-300 whitespace-pre resize-none leading-loose selection:bg-emerald-500/30"
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

          {/* Mini Chart (Bottom of Left Panel) */}
          <div className="h-32 border-t border-slate-800 bg-slate-900/30 p-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <Bar dataKey="freq" fill="#10b981" radius={[2, 2, 0, 0]} />
                <Tooltip
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '10px' }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* --- RIGHT PANEL: MATRIX RỘNG MỞ --- */}
        <section className="flex-1 flex flex-col bg-slate-950 relative">

          {/* Top Control Bar */}
          <div className="flex-none p-4 border-b border-slate-800 flex justify-between items-start bg-slate-900/20">
            {/* Pool Display */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {selectedPool.map((item, idx) => (
                <div key={idx} className={`
                    flex flex-col items-center justify-center w-10 h-12 rounded border-b-2 shadow-lg flex-shrink-0
                    ${item.type === 'HOT' ? 'bg-red-900/20 border-red-500 text-red-400' :
                    item.type === 'COLD' ? 'bg-blue-900/20 border-blue-500 text-blue-400' :
                      'bg-amber-900/20 border-amber-500 text-amber-400'
                  }
                  `}>
                  <span className="text-sm font-bold">{item.num < 10 ? `0${item.num}` : item.num}</span>
                  <span className="text-[8px] opacity-70">{item.count}</span>
                </div>
              ))}
            </div>

            {/* Main Action Buttons */}
            <div className="flex gap-2 ml-4">
              {!lockedMatrix ? (
                <button
                  onClick={handleLock}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-lg font-bold shadow-lg shadow-emerald-900/30 transition-all border border-emerald-500/50"
                >
                  <Lock className="w-4 h-4" /> KHÓA & NUÔI
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <button
                    onClick={handleNextDay}
                    className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white px-6 py-2 rounded-lg font-bold shadow-lg shadow-amber-900/30 transition-all border border-amber-500/50"
                  >
                    <Calendar className="w-4 h-4" /> HOÀN THÀNH KỲ {currentDay}
                  </button>
                  <button
                    onClick={handleUnlock}
                    className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-6 py-1.5 rounded-lg text-xs font-bold border border-slate-700 transition-all"
                  >
                    <Unlock className="w-3 h-3" /> MỞ KHÓA (SỬA GỐC)
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Matrix Content - Full Height */}
          <div className="flex-1 grid grid-cols-2 divide-x divide-slate-800 overflow-hidden">

            {/* LEFT: LOCKED MATRIX */}
            <div className="flex flex-col overflow-hidden bg-slate-900/10">
              <div className="p-3 border-b border-slate-800 bg-slate-900/50 sticky top-0 z-10 flex justify-between items-center">
                <h3 className="text-xs font-bold text-emerald-500 flex items-center gap-2">
                  <Check className="w-4 h-4" /> LUỒNG TĨNH (LOCKED)
                </h3>
                {lockedMatrix && <span className="text-[9px] bg-emerald-900/50 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800">ĐANG NUÔI</span>}
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin scrollbar-thumb-slate-700">
                {lockedMatrix ? (
                  lockedMatrix.map((stats, idx) => (
                    <TicketRowV10 key={idx} stats={stats} index={idx} isLocked={true} />
                  ))
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-2">
                    <Lock className="w-8 h-8 opacity-20" />
                    <span className="text-xs">Chưa khóa dữ liệu</span>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT: LIVE MATRIX */}
            <div className="flex flex-col overflow-hidden bg-slate-900/10">
              <div className="p-3 border-b border-slate-800 bg-slate-900/50 sticky top-0 z-10 flex justify-between items-center">
                <h3 className="text-xs font-bold text-amber-500 flex items-center gap-2">
                  <Activity className="w-4 h-4" /> LUỒNG ĐỘNG (LIVE)
                </h3>
                <span className="text-[9px] bg-amber-900/50 text-amber-300 px-2 py-0.5 rounded border border-amber-800">AUTO-UPDATE</span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin scrollbar-thumb-slate-700">
                {generatedMatrix.map((stats, idx) => (
                  <TicketRowV10 key={idx} stats={stats} index={idx} isLocked={false} lockedSet={lockedNumbersSet} />
                ))}
              </div>
            </div>

          </div>
        </section>

      </main>
    </div>
  );
};

export default Mega645AnalyzerV10;
