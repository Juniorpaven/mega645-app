import { useState, useEffect, useMemo, useRef } from 'react';
import { db, authReady } from './firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { FileSpreadsheet, Calendar, Check, Activity, HeartPulse, Layers, Download, Upload, Trash2, PlusCircle, Copy, ClipboardPaste, Maximize2, Lock, Flame, Snowflake, Zap, RotateCcw, History, X, BarChart3 } from 'lucide-react';
import {
  analyze,
  poolHistoryOf,
  formatDrawLine,
  normalizeDate,
  parseDrawLine,
  type StrategyId,
  type TicketStats,
} from './strategies';
import { fetchDraws, addDrawResult, logPredictions } from './sheetsApi';
import { FrequencyHeatmap, HealthBadge, TicketRowV10, LineItem } from './components';

// --- KHOÁ LƯU TRỮ CỤC BỘ ---
const LS_RAW = 'mega645_rawData';
const LS_DAY = 'mega645_currentDay';
const LS_LOCKED = 'mega645_lockedMatrix';
const LS_LAST_PREDICTION_SYNC = 'mega645_lastPredictionSync';

const STATE_DOC = doc(db, 'mega645', 'data');

const safeGet = (key: string) => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const safeSet = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* bỏ qua khi trình duyệt chặn storage */ }
};

// Dữ liệu mẫu (chỉ dùng khi chưa tải được Google Sheets và chưa có cache)
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

type NumberInsight = {
  num: number;
  lastDate: string;
  totalFreq: number;
  currentGap: number;
  maxStreak: number;
  type: 'HOT' | 'WARM' | 'COLD';
};

type DataSource = 'SHEETS' | 'CACHE' | 'SAMPLE';

const Mega645AnalyzerV10 = () => {
  // --- STATE ---
  const [rawData, setRawData] = useState(() => safeGet(LS_RAW) || INITIAL_EXCEL_DATA);
  const [dataSource, setDataSource] = useState<DataSource>(() => (safeGet(LS_RAW) ? 'CACHE' : 'SAMPLE'));
  const [activeHeatmap, setActiveHeatmap] = useState<'CURRENT' | 'PREVIOUS' | null>(null);
  const [insightNumber, setInsightNumber] = useState<NumberInsight | null>(null);
  const [strategyMode, setStrategyMode] = useState<Exclude<StrategyId, 'RANDOM_10'>>('COMBINATORIAL_10');
  const [currentDay, setCurrentDay] = useState(() => parseInt(safeGet(LS_DAY) || '1', 10) || 1);
  const [lockedMatrix, setLockedMatrix] = useState<TicketStats[] | null>(() => {
    try {
      const saved = safeGet(LS_LOCKED);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [newDayInput, setNewDayInput] = useState('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumberRef = useRef<HTMLDivElement>(null);
  // Giá trị cuối cùng đã đồng bộ với Firestore — tránh ghi lại chính dữ liệu vừa nhận về
  const lastRemoteStateRef = useRef<string>('');

  // --- NGUỒN DỮ LIỆU DUY NHẤT: Google Sheets (DATA_MEGA) ---
  // localStorage chỉ là cache để mở app nhanh/offline. Firestore KHÔNG còn lưu rawData
  // (tránh việc 3 nguồn ghi đè lẫn nhau).
  useEffect(() => {
    let cancelled = false;
    fetchDraws(60)
      .then(draws => {
        if (cancelled || draws.length === 0) return;
        setRawData(draws.map(formatDrawLine).join('\n'));
        setDataSource('SHEETS');
      })
      .catch(err => console.warn('Không tải được Google Sheets, dùng dữ liệu cache/mẫu:', err));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => safeSet(LS_RAW, rawData), 500);
    return () => clearTimeout(timer);
  }, [rawData]);

  // --- FIRESTORE: chỉ đồng bộ trạng thái "nuôi vé" (lockedMatrix, currentDay) giữa các thiết bị ---
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    authReady.then(() => {
      if (cancelled) return;
      unsubscribe = onSnapshot(STATE_DOC, snap => {
      if (!snap.exists()) return;
      const data = snap.data();
      const remoteDay = typeof data.currentDay === 'number' ? data.currentDay : 1;
      const remoteLocked = (data.lockedMatrix ?? null) as TicketStats[] | null;
      lastRemoteStateRef.current = JSON.stringify({ currentDay: remoteDay, lockedMatrix: remoteLocked });
      setCurrentDay(prev => (prev !== remoteDay ? remoteDay : prev));
      setLockedMatrix(prev => (JSON.stringify(prev) !== JSON.stringify(remoteLocked) ? remoteLocked : prev));
      }, err => console.error('Firestore listen error:', err));
    }).catch(() => { /* đã log trong firebase.ts — app vẫn chạy với localStorage */ });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    safeSet(LS_DAY, String(currentDay));
    safeSet(LS_LOCKED, lockedMatrix ? JSON.stringify(lockedMatrix) : null);

    const state = JSON.stringify({ currentDay, lockedMatrix: lockedMatrix || null });
    if (state === lastRemoteStateRef.current) return;
    const timer = setTimeout(() => {
      lastRemoteStateRef.current = state;
      authReady
        .then(() => setDoc(STATE_DOC, { currentDay, lockedMatrix: lockedMatrix || null }, { merge: true }))
        .catch(err => console.error('Firebase save error:', err));
    }, 1000);
    return () => clearTimeout(timer);
  }, [currentDay, lockedMatrix]);

  // --- PHÂN TÍCH (dữ liệu suy ra => useMemo, không lưu state) ---
  const allLines = useMemo(() => rawData.trim().split('\n'), [rawData]);
  const analysis = useMemo(() => analyze(allLines), [allLines]);
  const poolHistory = useMemo(() => poolHistoryOf(allLines), [allLines]);

  const processedData = analysis.draws;
  const frequency = analysis.frequency;
  const prevFrequency = analysis.prevFrequency;
  const selectedPool = analysis.pool;
  const calculateTicketHealth = analysis.health;
  const generatedMatrix = analysis.strategies.WHEEL;
  const balancedMatrix = analysis.strategies.BALANCED;
  const reverseWheelMatrix = analysis.strategies.REVERSE_WHEEL_8;
  const combinatorialMatrix = analysis.strategies.COMBINATORIAL_10;

  const latestResultStats = useMemo(
    () => (processedData.length > 0 ? calculateTicketHealth(processedData[0].numbers) : null),
    [processedData, calculateTicketHealth],
  );

  // --- TỰ ĐỘNG GHI DỰ ĐOÁN CỦA TẤT CẢ CHIẾN LƯỢC LÊN DU_DOAN_LOG ---
  // Chỉ chạy khi dữ liệu đến từ Google Sheets (không đẩy dự đoán dựa trên dữ liệu mẫu/cache),
  // mỗi kỳ chỉ đẩy 1 lần / thiết bị; server chống trùng thêm 1 lớp nữa.
  useEffect(() => {
    if (dataSource !== 'SHEETS') return;
    const basedOn = normalizeDate(processedData[0]?.date ?? '');
    if (!basedOn || safeGet(LS_LAST_PREDICTION_SYNC) === basedOn) return;

    const payload: Record<string, number[][]> = {};
    (Object.keys(analysis.strategies) as StrategyId[]).forEach(id => {
      const tickets = analysis.strategies[id].map(t => t.numbers);
      if (tickets.length > 0) payload[id] = tickets;
    });
    if (Object.keys(payload).length === 0) return;

    safeSet(LS_LAST_PREDICTION_SYNC, basedOn);
    logPredictions(basedOn, payload)
      .then(() => console.log(`✅ Đã ghi dự đoán (${Object.keys(payload).join(', ')}) cho kỳ sau ${basedOn}`))
      .catch(err => {
        safeSet(LS_LAST_PREDICTION_SYNC, null);
        console.error('Lỗi ghi dự đoán:', err);
      });
  }, [dataSource, processedData, analysis]);

  const handleHardReset = async () => {
    if (!window.confirm('Xóa cache trên máy này và bỏ trạng thái nuôi vé? (Dữ liệu kỳ quay sẽ tải lại từ Google Sheets)')) return;
    [LS_RAW, LS_DAY, LS_LOCKED].forEach(k => safeSet(k, null));
    try {
      lastRemoteStateRef.current = JSON.stringify({ currentDay: 1, lockedMatrix: null });
      await authReady;
      await setDoc(STATE_DOC, { currentDay: 1, lockedMatrix: null }, { merge: true });
    } catch (err) {
      console.error('Không reset được Firestore:', err);
    }
    window.location.reload();
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
    } catch {
      alert("Không thể dán tự động. Vui lòng dùng Ctrl+V.");
    }
  };

  const handleSelectAll = () => {
    if (textareaRef.current) {
      textareaRef.current.select();
    }
  };

  const handleUpdateNewDay = async () => {
    if (!newDayInput.trim()) return;
    const parsed = parseDrawLine(newDayInput);
    const dateStr = parsed ? normalizeDate(parsed.date) : null;
    if (!parsed || !dateStr || new Set(parsed.numbers).size !== 6) {
      alert('Vui lòng nhập đúng định dạng: Ngày (dd-mm-yyyy hoặc yyyy-mm-dd) và 6 số khác nhau (1-45)!');
      return;
    }
    const draw = { date: dateStr, numbers: [...parsed.numbers].sort((a, b) => a - b) };

    setRawData(prev => [formatDrawLine(draw), ...prev.trim().split('\n')].join('\n'));
    setNewDayInput('');
    if (currentDay < 7) setCurrentDay(currentDay + 1);

    // Ghi lên DATA_MEGA; các chiến lược mới sẽ tự được ghi vào DU_DOAN_LOG bởi effect phía trên
    await addDrawResult(draw.date, draw.numbers);
    alert(`✅ Đã thêm kỳ ${draw.date}.\n- Đã cập nhật phân tích 30 kỳ trên web.\n- Đã gửi sang Google Sheets (bot cào tự động sẽ đối chiếu với kết quả chính thức).`);
  };

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
  const handleLock = () => {
    const activeMatrix =
      strategyMode === 'COMBINATORIAL_10'
        ? combinatorialMatrix
        : strategyMode === 'REVERSE_WHEEL_8'
        ? reverseWheelMatrix
        : strategyMode === 'WHEEL'
        ? generatedMatrix
        : balancedMatrix;
    setLockedMatrix(activeMatrix);
    setCurrentDay(1);
  };
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
      } catch {
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
    } catch {
      alert("❌ Mã lỗi.");
    }
  };  const lineNumbers = useMemo(() => {
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
            <h1 className="text-lg font-bold text-emerald-500 hidden sm:block">
              Mega 6/45 Pro
            </h1>
            <h1 className="text-base font-bold text-emerald-500 sm:hidden">
              Mega 6/45 Pro
            </h1>
            <p className="text-[10px] text-slate-500 font-mono hidden sm:block">Full Screen & Mobile Optimized</p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-4">

          {/* --- NEW CONTROLS AREA --- */}
          <div className="flex items-center gap-2">
            {lockedMatrix ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleNextDay}
                  className="flex items-center gap-2 px-2 md:px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded shadow-lg border border-blue-500 transition-all font-bold text-xs uppercase animate-pulse"
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
                className="flex items-center gap-2 px-2 md:px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded shadow-lg border border-emerald-500 transition-all font-bold text-xs uppercase"
              >
                <Lock className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Khóa & Tạo Chiến Dịch</span>
                <span className="sm:hidden">Khóa</span>
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

              {latestResultStats && (
                <div className="mb-2 p-3 bg-indigo-900/20 border border-indigo-500/30 rounded-lg flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-indigo-400 uppercase flex items-center gap-2">
                      <Check className="w-3 h-3" /> Kết quả kỳ mới nhất ({processedData[0]?.date})
                    </span>
                    <HealthBadge score={latestResultStats.score} status={latestResultStats.status} />
                  </div>
                  <div className="flex gap-1.5 justify-center">
                    {latestResultStats.numbers.map(n => (
                      <span key={n} className="w-6 h-6 flex items-center justify-center bg-indigo-600 text-white text-xs font-bold rounded-full shadow border border-indigo-400">{n < 10 ? `0${n}` : n}</span>
                    ))}
                  </div>
                  <div className="flex gap-2 text-[10px] font-mono font-medium flex-wrap justify-center opacity-90">
                    <span className={`px-1.5 py-0.5 rounded border ${latestResultStats.sum >= 95 && latestResultStats.sum <= 181 ? 'border-indigo-500/30 bg-indigo-900/30 text-indigo-200' : 'border-red-500 bg-red-900/50 text-red-200'}`}>
                      ∑{latestResultStats.sum}
                    </span>

                    <span className={`px-1.5 py-0.5 rounded border ${latestResultStats.evens >= 2 && latestResultStats.evens <= 4 ? 'border-indigo-500/30 bg-indigo-900/30 text-indigo-200' : 'border-red-500 bg-red-900/50 text-red-200'}`}>
                      {latestResultStats.evens}C/{latestResultStats.odds}L
                    </span>

                    <span className={`px-1.5 py-0.5 rounded border ${latestResultStats.highs >= 2 && latestResultStats.highs <= 4 ? 'border-indigo-500/30 bg-indigo-900/30 text-indigo-200' : 'border-red-500 bg-red-900/50 text-red-200'}`}>
                      {latestResultStats.highs}T/{latestResultStats.lows}X
                    </span>

                    {latestResultStats.consecutive && <span className="px-1.5 py-0.5 rounded bg-emerald-900/30 text-emerald-400 border border-emerald-800">LiênKề</span>}
                  </div>
                </div>
              )}
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
                    <TicketRowV10 key={idx} stats={stats} index={idx} isLocked={true} onClickNumber={handleNumberClick} latestResult={processedData[0]?.numbers} />
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

              {/* STRATEGY TOGGLE */}
              <div className="flex bg-slate-900 border-b border-slate-800 p-1 gap-1">
                <button
                  onClick={() => setStrategyMode('WHEEL')}
                  className={`flex-1 py-1 text-[9px] uppercase font-bold rounded transition-all ${strategyMode === 'WHEEL' ? 'bg-amber-600 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  Wheel Cơ Bản
                </button>
                <button
                  onClick={() => setStrategyMode('BALANCED')}
                  className={`flex-1 py-1 text-[9px] uppercase font-bold rounded transition-all ${strategyMode === 'BALANCED' ? 'bg-purple-600 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  M.Trận Cân Bằng
                </button>
                <button
                  onClick={() => setStrategyMode('REVERSE_WHEEL_8')}
                  className={`flex-1 py-1 text-[9px] uppercase font-bold rounded transition-all flex items-center justify-center gap-1 ${strategyMode === 'REVERSE_WHEEL_8' ? 'bg-rose-600 text-white shadow ring-1 ring-rose-400' : 'text-slate-500 hover:text-slate-300'}`}
                  title="Đánh Ngược X-1/X+1 + Tách Cặp Neo + Bẫy Mật Độ (Loại 50% Hot)"
                >
                  <Flame className="w-3 h-3" /> Đánh Ngược
                </button>
                <button
                  onClick={() => setStrategyMode('COMBINATORIAL_10')}
                  className={`flex-1 py-1 text-[9px] uppercase font-bold rounded transition-all flex items-center justify-center gap-1 ${
                    strategyMode === 'COMBINATORIAL_10'
                      ? 'bg-emerald-600 text-white shadow ring-1 ring-emerald-400'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                  title="Lọc Tổ Hợp 10 Quy Luật + Bao Thu Gọn 30 Vé Phủ Hamming"
                >
                  <Zap className="w-3 h-3" /> 10 Quy Luật (30 Vé)
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin scrollbar-thumb-slate-700 relative">
                {strategyMode === 'REVERSE_WHEEL_8' && (
                  <div className="absolute top-2 left-0 right-0 text-center pointer-events-none opacity-[0.03] text-[60px] font-black italic tracking-tighter text-rose-500 z-0">
                    WHEEL 8
                  </div>
                )}
                
                <div className="relative z-10 space-y-3">
                  {(strategyMode === 'COMBINATORIAL_10'
                    ? combinatorialMatrix
                    : strategyMode === 'REVERSE_WHEEL_8'
                    ? reverseWheelMatrix
                    : strategyMode === 'WHEEL'
                    ? generatedMatrix
                    : balancedMatrix
                  ).map((stats, idx) => (
                    <TicketRowV10
                      key={idx}
                      stats={stats}
                      index={idx}
                      isLocked={false}
                      lockedSet={lockedNumbersSet}
                      onClickNumber={handleNumberClick}
                      latestResult={processedData[0]?.numbers}
                    />
                  ))}
                </div>
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
