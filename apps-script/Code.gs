/**
 * AUTO_DATA_MEGA — Google Apps Script (gắn với file Google Sheets)
 * ---------------------------------------------------------------
 * 3 sheet:
 *   DATA_MEGA           : Kết quả các kỳ quay (bot tự cào mỗi giờ, mới nhất ở dòng 2)
 *   DU_DOAN_LOG         : Nhật ký phẳng — mỗi dòng = 1 vé dự đoán của 1 chiến lược cho kỳ kế tiếp
 *   DOI_SOAT_CUON_CHIEU : Báo cáo hiệu quả từng chiến lược (toàn bộ + 30 kỳ gần nhất + chi tiết từng kỳ)
 *
 * Cài đặt: xem apps-script/README.md. Chạy hàm setupMega() MỘT LẦN sau khi dán code.
 */

const CFG = {
  TZ: 'Asia/Ho_Chi_Minh',
  SHEET_DATA: 'DATA_MEGA',
  SHEET_LOG: 'DU_DOAN_LOG',
  SHEET_REPORT: 'DOI_SOAT_CUON_CHIEU',
  TICKET_PRICE: 10000,
  // Giải Mega 6/45: 3 số = Giải Ba, 4 = Giải Nhì, 5 = Giải Nhất, 6 = Jackpot (giá trị Jackpot thay đổi — dùng ước tính)
  PRIZES: { 3: 30000, 4: 300000, 5: 10000000, 6: 12000000000 },
  PRIZE_NAMES: { 3: 'Giải Ba', 4: 'Giải Nhì', 5: 'Giải Nhất', 6: 'Jackpot' },
  RECENT_WINDOW: 30,
  MAX_TICKETS_PER_STRATEGY: 60,
  SOURCE_GITHUB: 'https://raw.githubusercontent.com/vietvudanh/vietlott-data/master/data/power645.jsonl',
  SOURCE_VIETLOTT: 'https://vietlott.vn/vi/trung-thuong/ket-qua-trung-thuong/645',
  STRATEGIES: {
    COMBINATORIAL_10: '10 quy luật + bao thu gọn (30 vé)',
    BALANCED: 'Cân bằng đầu 4 / đuôi 3-8 (15 vé)',
    WHEEL: 'Bao 10 số khuôn 10 vé',
    REVERSE_WHEEL_8: 'Bao ngược 8 số (4 vé)',
    RANDOM_10: 'ĐỐI CHỨNG: ngẫu nhiên (10 vé)',
    LEGACY_30: 'Log cũ trước khi nâng cấp (30 vé)',
  },
};

const DATA_HEADERS = ['Ngày', 'Bóng 1', 'Bóng 2', 'Bóng 3', 'Bóng 4', 'Bóng 5', 'Bóng 6', 'Kỳ quay', 'Nguồn', 'Cập nhật lúc'];
const LOG_HEADERS = ['Thời gian ghi', 'Dựa trên kỳ', 'Chiến lược', 'STT', 'Số 1', 'Số 2', 'Số 3', 'Số 4', 'Số 5', 'Số 6',
  'Kỳ đối soát', 'Kết quả kỳ đối soát', 'Số trùng', 'Giải', 'Tiền thưởng', 'Trạng thái'];
const STATUS_PENDING = 'CHỜ KẾT QUẢ';
const STATUS_DONE = 'ĐÃ ĐỐI SOÁT';
const SOURCE_RANK = { MANUAL: 0, VIETLOTT: 1, GITHUB: 2 };

// ============================================================================
// MENU
// ============================================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🎯 Mega 6/45')
    .addItem('Cào kết quả + đối soát ngay', 'syncResults')
    .addItem('Chỉ đối soát & lập lại báo cáo', 'settleAndReport')
    .addSeparator()
    .addItem('Cài đặt lần đầu (setupMega)', 'setupMega')
    .addToUi();
}

// ============================================================================
// WEB APP API (app React gọi tới)
// ============================================================================
function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    const action = p.action || 'draws';
    if (action === 'summary') {
      return json_({ status: 'SUCCESS', data: buildSummaryForApi_() });
    }
    const limit = Math.min(Math.max(parseInt(p.limit, 10) || 60, 1), 3000);
    const draws = readDraws_().slice(0, limit).map(function (d) {
      return { date: d.date, numbers: d.numbers, id: d.id };
    });
    return json_({ status: 'SUCCESS', data: draws });
  } catch (err) {
    return json_({ status: 'ERROR', message: String(err) });
  }
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ status: 'ERROR', message: 'JSON không hợp lệ' });
  }

  const expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (expected && body.token !== expected) {
    return json_({ status: 'ERROR', message: 'Sai token' });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (body.action === 'ADD_DRAW_RESULT') {
      return json_(addManualDraw_(body.date, body.numbers));
    }
    if (body.action === 'LOG_PREDICTIONS') {
      let basedOn = body.basedOnDate;
      let strategies = body.strategies;
      // Tương thích payload cũ: { targetDate: "Dự đoán sau kỳ 2026-11-18", tickets: [[...]] }
      if (!strategies && Array.isArray(body.tickets)) {
        basedOn = String(body.targetDate || '').replace(/^.*kỳ\s*/i, '');
        strategies = { COMBINATORIAL_10: body.tickets };
      }
      return json_(logPredictions_(basedOn, strategies));
    }
    return json_({ status: 'ERROR', message: 'Action không hỗ trợ' });
  } catch (err) {
    return json_({ status: 'ERROR', message: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ============================================================================
// TIỆN ÍCH NGÀY / SỐ
// ============================================================================
function normDate_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return null;
    return Utilities.formatDate(v, CFG.TZ, 'yyyy-MM-dd');
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return m[1] + '-' + pad2_(m[2]) + '-' + pad2_(m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return m[3] + '-' + pad2_(m[2]) + '-' + pad2_(m[1]);
  return null;
}

function pad2_(x) {
  return ('0' + x).slice(-2);
}

/** yyyy-MM-dd -> Date (12:00 giờ VN, tránh lệch ngày khi đổi múi giờ) */
function toDate_(s) {
  return new Date(s + 'T12:00:00+07:00');
}

function validTicket_(nums) {
  if (!Array.isArray(nums) || nums.length !== 6) return null;
  const t = nums.map(Number);
  if (t.some(function (n) { return !(n >= 1 && n <= 45 && Math.floor(n) === n); })) return null;
  if (uniq_(t).length !== 6) return null;
  return t.sort(function (a, b) { return a - b; });
}

function uniq_(arr) {
  return arr.filter(function (x, i) { return arr.indexOf(x) === i; });
}

function countMatches_(ticket, result) {
  let c = 0;
  for (let i = 0; i < ticket.length; i++) if (result.indexOf(ticket[i]) !== -1) c++;
  return c;
}

/** Đảm bảo sheet đủ số dòng trước khi ghi (Apps Script báo lỗi nếu ghi ra ngoài lưới) */
function ensureRows_(sh, lastRowNeeded) {
  const max = sh.getMaxRows();
  if (lastRowNeeded > max) sh.insertRowsAfter(max, lastRowNeeded - max + 200);
}

function fmtMoney_(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

// ============================================================================
// DATA_MEGA
// ============================================================================
/** Đọc toàn bộ kỳ quay, mới nhất trước */
function readDraws_() {
  const sh = getSheet_(CFG.SHEET_DATA);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const width = Math.max(7, Math.min(sh.getLastColumn(), DATA_HEADERS.length));
  const values = sh.getRange(2, 1, last - 1, width).getValues();
  const out = [];
  values.forEach(function (r) {
    const date = normDate_(r[0]);
    const nums = validTicket_(r.slice(1, 7));
    if (!date || !nums) return;
    out.push({
      date: date,
      numbers: nums,
      id: r[7] ? String(r[7]) : '',
      source: r[8] ? String(r[8]) : 'MANUAL',
      updated: r[9] || '',
    });
  });
  out.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  return out;
}

function writeDraws_(draws) {
  const sh = getSheet_(CFG.SHEET_DATA);
  sh.getRange(1, 1, 1, DATA_HEADERS.length).setValues([DATA_HEADERS]);
  const last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, DATA_HEADERS.length).clearContent();
  if (draws.length === 0) return;
  ensureRows_(sh, draws.length + 1);
  const rows = draws.map(function (d) {
    return [toDate_(d.date)].concat(d.numbers, [d.id || '', d.source || '', d.updated || '']);
  });
  sh.getRange(2, 1, rows.length, DATA_HEADERS.length).setValues(rows);
  sh.getRange(2, 1, rows.length, 1).setNumberFormat('yyyy-mm-dd');
  sh.getRange(2, 10, rows.length, 1).setNumberFormat('yyyy-mm-dd hh:mm');
}

/**
 * Gộp kết quả mới vào danh sách hiện có. Nguồn tự động ghi đè nguồn nhập tay;
 * GITHUB (dữ liệu sạch) ghi đè VIETLOTT (parse HTML) nếu khác nhau.
 */
function mergeDraws_(existing, incoming) {
  const byDate = {};
  existing.forEach(function (d) { byDate[d.date] = d; });
  let added = 0;
  let corrected = 0;
  const now = new Date();
  incoming.forEach(function (d) {
    const cur = byDate[d.date];
    if (!cur) {
      byDate[d.date] = { date: d.date, numbers: d.numbers, id: d.id, source: d.source, updated: now };
      added++;
      return;
    }
    const same = cur.numbers.join('-') === d.numbers.join('-');
    const curRank = SOURCE_RANK[cur.source] === undefined ? 0 : SOURCE_RANK[cur.source];
    const newRank = SOURCE_RANK[d.source] === undefined ? 0 : SOURCE_RANK[d.source];
    if (newRank > curRank || (!same && newRank >= curRank && newRank > 0)) {
      if (!same) corrected++;
      byDate[d.date] = { date: d.date, numbers: d.numbers, id: d.id || cur.id, source: d.source, updated: same ? cur.updated : now };
    } else if (!cur.id && d.id) {
      cur.id = d.id;
    }
  });
  const merged = Object.keys(byDate).map(function (k) { return byDate[k]; });
  merged.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  const changed = added > 0 || corrected > 0 || merged.length !== existing.length ||
    merged.some(function (d, i) { return !existing[i] || existing[i].source !== d.source || existing[i].id !== d.id; });
  return { draws: merged, added: added, corrected: corrected, changed: changed };
}

function addManualDraw_(date, numbers) {
  const d = normDate_(date);
  const nums = validTicket_(numbers);
  if (!d || !nums) return { status: 'ERROR', message: 'Ngày hoặc bộ số không hợp lệ' };
  const existing = readDraws_();
  if (existing.some(function (x) { return x.date === d; })) {
    return { status: 'SUCCESS', message: 'Kỳ đã tồn tại, giữ nguyên dữ liệu hiện có' };
  }
  const res = mergeDraws_(existing, [{ date: d, numbers: nums, id: '', source: 'MANUAL' }]);
  writeDraws_(res.draws);
  settleAndReport();
  return { status: 'SUCCESS', added: res.added };
}

// ============================================================================
// CÀO DỮ LIỆU
// ============================================================================
/** Nguồn 1: bộ dữ liệu JSONL cập nhật hằng ngày từ trang Vietlott (toàn bộ lịch sử) */
function fetchFromGithub_() {
  const res = UrlFetchApp.fetch(CFG.SOURCE_GITHUB, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('GitHub HTTP ' + res.getResponseCode());
  const out = [];
  res.getContentText().split('\n').forEach(function (line) {
    if (!line.trim()) return;
    try {
      const o = JSON.parse(line);
      const date = normDate_(o.date);
      const nums = validTicket_(o.result);
      if (date && nums) out.push({ date: date, numbers: nums, id: String(o.id || ''), source: 'GITHUB' });
    } catch (err) { /* bỏ dòng lỗi */ }
  });
  return out;
}

/** Nguồn 2 (dự phòng): trang kết quả Vietlott — chỉ lấy kỳ mới nhất, parse HTML best-effort */
function fetchFromVietlott_() {
  const res = UrlFetchApp.fetch(CFG.SOURCE_VIETLOTT, {
    muteHttpExceptions: true,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AutoDataMega/1.0)' },
  });
  if (res.getResponseCode() !== 200) throw new Error('Vietlott HTTP ' + res.getResponseCode());
  const html = res.getContentText();
  const idMatch = html.match(/#(\d{5})\b/);
  const dateMatch = html.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  const start = html.search(/day_so_ket_qua|bong_tron/);
  if (start < 0 || !dateMatch) return [];
  const balls = [];
  const re = /bong_tron[^>]*>\s*(\d{1,2})\s*</g;
  re.lastIndex = start;
  let m;
  while ((m = re.exec(html)) && balls.length < 6) balls.push(Number(m[1]));
  const nums = validTicket_(balls);
  const date = normDate_(dateMatch[1] + '/' + dateMatch[2] + '/' + dateMatch[3]);
  if (!nums || !date) return [];
  return [{ date: date, numbers: nums, id: idMatch ? pad5_(idMatch[1]) : '', source: 'VIETLOTT' }];
}

function pad5_(x) {
  return ('00000' + x).slice(-5);
}

/** Ngày quay gần nhất đã diễn ra (Mega 6/45 quay T4, T6, CN lúc ~18h, có kết quả sau ~18h40) */
function expectedLatestDrawDate_(now) {
  const n = now || new Date();
  for (let back = 0; back < 8; back++) {
    const d = new Date(n.getTime() - back * 86400000);
    const dow = Number(Utilities.formatDate(d, CFG.TZ, 'u')); // 1=T2 ... 7=CN
    if (dow !== 3 && dow !== 5 && dow !== 7) continue;
    if (back === 0 && Number(Utilities.formatDate(n, CFG.TZ, 'HHmm')) < 1840) continue;
    return Utilities.formatDate(d, CFG.TZ, 'yyyy-MM-dd');
  }
  return null;
}

/** Hàm chính — trigger chạy mỗi giờ. Cào kết quả, cập nhật DATA_MEGA, đối soát và lập báo cáo. */
function syncResults() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return 'Đang có tiến trình khác chạy';
  try {
    const existing = readDraws_();
    let incoming = [];
    const errors = [];
    try {
      incoming = fetchFromGithub_();
    } catch (err) {
      errors.push('GitHub: ' + err);
    }
    const latestKnown = [existing[0], incoming.length ? incoming[incoming.length - 1] : null]
      .filter(Boolean).map(function (d) { return d.date; }).sort().pop() || '';
    const expected = expectedLatestDrawDate_();
    if (expected && latestKnown < expected) {
      try {
        // Chỉ nhận kết quả parse từ HTML nếu đúng ngày quay đang chờ (chống parse nhầm ngày khác trên trang)
        incoming = incoming.concat(fetchFromVietlott_().filter(function (d) { return d.date === expected; }));
      } catch (err) {
        errors.push('Vietlott: ' + err);
      }
    }

    const res = mergeDraws_(existing, incoming);
    let settled = 0;
    // Chỉ đối soát + lập lại báo cáo khi có thay đổi (hoặc 1 lần/ngày lúc 6h) để tiết kiệm quota
    const hour = Number(Utilities.formatDate(new Date(), CFG.TZ, 'H'));
    if (res.changed) writeDraws_(res.draws);
    if (res.changed || hour === 6) settled = settleAndReport_(res.draws);
    const msg = 'Thêm ' + res.added + ' kỳ, sửa ' + res.corrected + ' kỳ, đối soát ' + settled + ' vé' +
      (errors.length ? ' | Lỗi: ' + errors.join('; ') : '');
    console.log(msg);
    return msg;
  } finally {
    lock.releaseLock();
  }
}

// ============================================================================
// DU_DOAN_LOG
// ============================================================================
function ensureLogHeader_(sh) {
  sh.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]);
  sh.setFrozenRows(1);
}

function logPredictions_(basedOnRaw, strategies) {
  const basedOn = normDate_(basedOnRaw);
  if (!basedOn) return { status: 'ERROR', message: 'basedOnDate không hợp lệ' };
  if (!strategies || typeof strategies !== 'object') return { status: 'ERROR', message: 'Thiếu strategies' };

  const draws = readDraws_();
  if (!draws.some(function (d) { return d.date === basedOn; })) {
    return { status: 'ERROR', message: 'Kỳ ' + basedOn + ' chưa có trong DATA_MEGA' };
  }

  const sh = getSheet_(CFG.SHEET_LOG);
  if (sh.getLastRow() < 1) ensureLogHeader_(sh);
  const existingKeys = {};
  const last = sh.getLastRow();
  if (last > 1) {
    sh.getRange(2, 2, last - 1, 2).getValues().forEach(function (r) {
      existingKeys[normDate_(r[0]) + '|' + r[1]] = true;
    });
  }

  const now = new Date();
  const rows = [];
  const accepted = [];
  const skipped = [];
  Object.keys(strategies).forEach(function (name) {
    if (!/^[A-Z0-9_]{2,32}$/.test(name)) return;
    if (existingKeys[basedOn + '|' + name]) { skipped.push(name); return; }
    const tickets = (strategies[name] || []).slice(0, CFG.MAX_TICKETS_PER_STRATEGY)
      .map(validTicket_).filter(Boolean);
    if (tickets.length === 0) return;
    tickets.forEach(function (t, i) {
      rows.push([now, toDate_(basedOn), name, i + 1].concat(t, ['', '', '', '', '', STATUS_PENDING]));
    });
    accepted.push(name);
  });

  if (rows.length > 0) {
    const start = sh.getLastRow() + 1;
    ensureRows_(sh, start + rows.length - 1);
    sh.getRange(start, 1, rows.length, LOG_HEADERS.length).setValues(rows);
    sh.getRange(start, 1, rows.length, 1).setNumberFormat('yyyy-mm-dd hh:mm');
    sh.getRange(start, 2, rows.length, 1).setNumberFormat('yyyy-mm-dd');
  }
  return { status: 'SUCCESS', logged: accepted, skipped: skipped, rows: rows.length };
}

/** Tìm kỳ quay đầu tiên SAU ngày basedOn (drawsAsc: tăng dần theo ngày) */
function nextDrawAfter_(drawsAsc, basedOn) {
  let lo = 0;
  let hi = drawsAsc.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (drawsAsc[mid].date <= basedOn) lo = mid + 1; else hi = mid;
  }
  return lo < drawsAsc.length ? drawsAsc[lo] : null;
}

/**
 * Đối soát toàn bộ log với DATA_MEGA (tính lại mỗi lần => tự sửa nếu kết quả được đính chính).
 * Trả về danh sách vé đã đối soát để lập báo cáo.
 */
function settlePredictions_(drawsDesc) {
  const sh = getSheet_(CFG.SHEET_LOG);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const values = sh.getRange(2, 1, last - 1, LOG_HEADERS.length).getValues();
  const drawsAsc = drawsDesc.slice().reverse();
  const settled = [];

  const out = values.map(function (r) {
    const basedOn = normDate_(r[1]);
    const ticket = validTicket_(r.slice(4, 10));
    if (!basedOn || !ticket) return ['', '', '', '', '', 'LỖI DỮ LIỆU'];
    const target = nextDrawAfter_(drawsAsc, basedOn);
    if (!target) return ['', '', '', '', '', STATUS_PENDING];
    const k = countMatches_(ticket, target.numbers);
    const prize = CFG.PRIZES[k] || 0;
    settled.push({ strategy: String(r[2]), target: target.date, result: target.numbers, matches: k, prize: prize });
    return [toDate_(target.date), target.numbers.map(pad2_).join(' '), k, CFG.PRIZE_NAMES[k] || '-', prize, STATUS_DONE];
  });

  sh.getRange(2, 11, out.length, 6).setValues(out);
  sh.getRange(2, 11, out.length, 1).setNumberFormat('yyyy-mm-dd');
  sh.getRange(2, 15, out.length, 1).setNumberFormat('#,##0 "₫"');
  return settled;
}

// ============================================================================
// DOI_SOAT_CUON_CHIEU — BÁO CÁO
// ============================================================================
function comb_(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = r * (n - k + i) / i;
  return r;
}

/** Xác suất trùng đúng k số của 1 vé ngẫu nhiên */
function pMatch_(k) {
  return comb_(6, k) * comb_(39, 6 - k) / comb_(45, 6);
}

function aggregate_(rows) {
  const by = {};
  rows.forEach(function (x) {
    const a = by[x.strategy] || (by[x.strategy] = { tickets: 0, prize: 0, sumMatch: 0, hits: { 3: 0, 4: 0, 5: 0, 6: 0 }, draws: {} });
    a.tickets++;
    a.prize += x.prize;
    a.sumMatch += x.matches;
    if (x.matches >= 3) a.hits[x.matches]++;
    const d = a.draws[x.target] || (a.draws[x.target] = { n: 0, sum: 0 });
    d.n++;
    d.sum += x.matches;
  });
  return by;
}

function strategyOrder_(names) {
  const order = Object.keys(CFG.STRATEGIES);
  return names.slice().sort(function (a, b) {
    const ia = order.indexOf(a) < 0 ? 99 : order.indexOf(a);
    const ib = order.indexOf(b) < 0 ? 99 : order.indexOf(b);
    return ia - ib || (a < b ? -1 : 1);
  });
}

/**
 * Hệ số z so với ngẫu nhiên: dùng trung bình số trùng THEO TỪNG KỲ (các kỳ độc lập với nhau),
 * vì các vé trong cùng 1 bộ bao có tương quan mạnh.
 */
function zScore_(a) {
  const means = Object.keys(a.draws).map(function (k) { return a.draws[k].sum / a.draws[k].n; });
  const D = means.length;
  if (D < 5) return '';
  const mu = means.reduce(function (s, x) { return s + x; }, 0) / D;
  const v = means.reduce(function (s, x) { return s + (x - mu) * (x - mu); }, 0) / (D - 1);
  if (v <= 0) return '';
  return (mu - 0.8) / Math.sqrt(v / D);
}

function verdict_(z) {
  if (z === '') return 'Chưa đủ dữ liệu (cần ≥ 5 kỳ)';
  if (z >= 2) return 'Tốt hơn ngẫu nhiên (cần theo dõi thêm)';
  if (z <= -2) return 'Kém hơn ngẫu nhiên';
  return 'Không khác ngẫu nhiên';
}

function summaryRows_(rows) {
  const agg = aggregate_(rows);
  const out = strategyOrder_(Object.keys(agg)).map(function (name) {
    const a = agg[name];
    const cost = a.tickets * CFG.TICKET_PRICE;
    const avg = a.sumMatch / a.tickets;
    const z = zScore_(a);
    const winRate = (a.hits[3] + a.hits[4] + a.hits[5] + a.hits[6]) / a.tickets;
    return [name, CFG.STRATEGIES[name] || '', Object.keys(a.draws).length, a.tickets, cost, a.prize, a.prize - cost,
      cost ? (a.prize - cost) / cost : 0, avg, avg / 0.8, z === '' ? '' : Math.round(z * 100) / 100, verdict_(z), winRate,
      a.hits[3], a.hits[4], a.hits[5], a.hits[6]];
  });
  // Dòng lý thuyết cho 1 vé ngẫu nhiên (không tính Jackpot vì giá trị thay đổi)
  const ev = pMatch_(3) * CFG.PRIZES[3] + pMatch_(4) * CFG.PRIZES[4] + pMatch_(5) * CFG.PRIZES[5];
  out.push(['LÝ THUYẾT', 'Vé ngẫu nhiên — kỳ vọng toán học (chưa tính Jackpot)', '', 1, CFG.TICKET_PRICE, ev, ev - CFG.TICKET_PRICE,
    (ev - CFG.TICKET_PRICE) / CFG.TICKET_PRICE, 0.8, 1, 0, 'Mốc so sánh', pMatch_(3) + pMatch_(4) + pMatch_(5) + pMatch_(6),
    pMatch_(3), pMatch_(4), pMatch_(5), pMatch_(6)]);
  return out;
}

const SUMMARY_HEADERS = ['Chiến lược', 'Mô tả', 'Số kỳ', 'Số vé', 'Chi phí', 'Tiền thưởng', 'Lãi / Lỗ', 'ROI',
  'TB số trùng/vé', 'Hệ số so ngẫu nhiên', 'Độ lệch z', 'Đánh giá', 'Tỷ lệ vé có giải', 'G.Ba (3)', 'G.Nhì (4)', 'G.Nhất (5)', 'Jackpot (6)'];
const DETAIL_HEADERS = ['Kỳ quay', 'Kết quả', 'Chiến lược', 'Số vé', 'Trùng cao nhất', 'TB trùng', 'G.Ba', 'G.Nhì', 'G.Nhất', 'Jackpot',
  'Chi phí', 'Tiền thưởng', 'Lãi / Lỗ'];

function rebuildReport_(settled) {
  const sh = getSheet_(CFG.SHEET_REPORT);
  sh.clear();
  sh.setFrozenRows(0);
  const W = SUMMARY_HEADERS.length;
  let row = 1;

  const put = function (values, fmt) {
    if (!values.length) return;
    const width = values[0].length;
    ensureRows_(sh, row + values.length - 1);
    const range = sh.getRange(row, 1, values.length, width);
    range.setValues(values);
    if (fmt) fmt(range, row, values.length);
    row += values.length;
  };
  const title = function (text, bg) {
    ensureRows_(sh, row);
    sh.getRange(row, 1, 1, W).setBackground(bg || '#0f172a').setFontColor('#ffffff').setFontWeight('bold');
    put([[text].concat(new Array(W - 1).fill(''))]);
  };
  const header = function (cols) {
    ensureRows_(sh, row);
    sh.getRange(row, 1, 1, cols.length).setBackground('#e2e8f0').setFontWeight('bold').setWrap(true);
    put([cols]);
  };
  const fmtSummary = function (range, r0, n) {
    sh.getRange(r0, 5, n, 3).setNumberFormat('#,##0 "₫"');
    sh.getRange(r0, 8, n, 1).setNumberFormat('0.0%');
    sh.getRange(r0, 9, n, 2).setNumberFormat('0.000');
    sh.getRange(r0, 13, n, 1).setNumberFormat('0.00%');
    sh.getRange(r0 + n - 1, 1, 1, W).setFontStyle('italic').setBackground('#f8fafc');
  };

  const targets = uniq_(settled.map(function (x) { return x.target; })).sort().reverse();
  const recentSet = {};
  targets.slice(0, CFG.RECENT_WINDOW).forEach(function (t) { recentSet[t] = true; });
  const recent = settled.filter(function (x) { return recentSet[x.target]; });

  title('BÁO CÁO ĐỐI SOÁT CHIẾN LƯỢC MEGA 6/45 — cập nhật ' + Utilities.formatDate(new Date(), CFG.TZ, 'dd/MM/yyyy HH:mm'));
  put([['Giá vé ' + fmtMoney_(CFG.TICKET_PRICE) + 'đ · Jackpot tính ước ' + (CFG.PRIZES[6] / 1e9) + ' tỷ · ' +
    'Hệ số so ngẫu nhiên = TB số trùng / 0,8 (một vé ngẫu nhiên trung bình trùng 0,8 số). |z| < 2 nghĩa là KHÔNG khác biệt có ý nghĩa so với mua ngẫu nhiên.']
    .concat(new Array(W - 1).fill(''))]);
  row++;

  title('A. TỔNG HỢP ' + CFG.RECENT_WINDOW + ' KỲ GẦN NHẤT', '#1e3a8a');
  header(SUMMARY_HEADERS);
  put(summaryRows_(recent), fmtSummary);
  row++;

  title('B. TỔNG HỢP TOÀN BỘ LỊCH SỬ (' + targets.length + ' kỳ có dự đoán)', '#1e3a8a');
  header(SUMMARY_HEADERS);
  put(summaryRows_(settled), fmtSummary);
  row++;

  title('C. CHI TIẾT TỪNG KỲ', '#1e3a8a');
  header(DETAIL_HEADERS);
  const groups = {};
  settled.forEach(function (x) {
    const key = x.target + '|' + x.strategy;
    const g = groups[key] || (groups[key] = { target: x.target, result: x.result, strategy: x.strategy, n: 0, max: 0, sum: 0, h: { 3: 0, 4: 0, 5: 0, 6: 0 }, prize: 0 });
    g.n++;
    g.sum += x.matches;
    g.max = Math.max(g.max, x.matches);
    if (x.matches >= 3) g.h[x.matches]++;
    g.prize += x.prize;
  });
  const order = Object.keys(CFG.STRATEGIES);
  const detail = Object.keys(groups).map(function (k) { return groups[k]; }).sort(function (a, b) {
    if (a.target !== b.target) return a.target < b.target ? 1 : -1;
    return order.indexOf(a.strategy) - order.indexOf(b.strategy);
  }).map(function (g) {
    const cost = g.n * CFG.TICKET_PRICE;
    return [toDate_(g.target), g.result.map(pad2_).join(' '), g.strategy, g.n, g.max, g.sum / g.n,
      g.h[3], g.h[4], g.h[5], g.h[6], cost, g.prize, g.prize - cost];
  });
  if (detail.length) {
    put(detail, function (range, r0, n) {
      sh.getRange(r0, 1, n, 1).setNumberFormat('yyyy-mm-dd');
      sh.getRange(r0, 6, n, 1).setNumberFormat('0.00');
      sh.getRange(r0, 11, n, 3).setNumberFormat('#,##0 "₫"');
    });
  } else {
    put([['Chưa có vé nào được đối soát.'].concat(new Array(DETAIL_HEADERS.length - 1).fill(''))]);
  }

  // Tô màu: lãi/lỗ âm đỏ, dương xanh; vé trúng (trùng ≥ 3) nổi bật
  const lastRow = Math.max(row - 1, 1);
  const rules = [
    SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0).setFontColor('#dc2626')
      .setRanges([sh.getRange(1, 7, lastRow, 2), sh.getRange(1, 13, lastRow, 1)]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0).setFontColor('#16a34a')
      .setRanges([sh.getRange(1, 7, lastRow, 2)]).build(),
  ];
  sh.setConditionalFormatRules(rules);
  sh.setColumnWidth(1, 150);
  sh.setColumnWidth(2, 260);
  sh.setColumnWidth(12, 230);
}

/** Dữ liệu tóm tắt cho app (GET ?action=summary) */
function buildSummaryForApi_() {
  const draws = readDraws_();
  const settled = settlePredictionsReadOnly_(draws);
  const targets = uniq_(settled.map(function (x) { return x.target; })).sort().reverse().slice(0, CFG.RECENT_WINDOW);
  const recent = settled.filter(function (x) { return targets.indexOf(x.target) !== -1; });
  return summaryRows_(recent).map(function (r) {
    return { strategy: r[0], draws: r[2], tickets: r[3], cost: r[4], prize: r[5], roi: r[7], avgMatches: r[8], lift: r[9], z: r[10], verdict: r[11] };
  });
}

function settlePredictionsReadOnly_(drawsDesc) {
  const sh = getSheet_(CFG.SHEET_LOG);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const drawsAsc = drawsDesc.slice().reverse();
  const out = [];
  sh.getRange(2, 1, last - 1, 10).getValues().forEach(function (r) {
    const basedOn = normDate_(r[1]);
    const ticket = validTicket_(r.slice(4, 10));
    if (!basedOn || !ticket) return;
    const t = nextDrawAfter_(drawsAsc, basedOn);
    if (!t) return;
    const k = countMatches_(ticket, t.numbers);
    out.push({ strategy: String(r[2]), target: t.date, result: t.numbers, matches: k, prize: CFG.PRIZES[k] || 0 });
  });
  return out;
}

function settleAndReport_(draws) {
  const settled = settlePredictions_(draws);
  rebuildReport_(settled);
  return settled.length;
}

function settleAndReport() {
  return settleAndReport_(readDraws_());
}

// ============================================================================
// CÀI ĐẶT LẦN ĐẦU + CHUYỂN ĐỔI DỮ LIỆU CŨ
// ============================================================================
function setupMega() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const stamp = Utilities.formatDate(new Date(), CFG.TZ, 'yyyyMMdd_HHmm');

  // 1. Sao lưu 3 sheet cũ
  [CFG.SHEET_DATA, CFG.SHEET_LOG, CFG.SHEET_REPORT].forEach(function (name) {
    const sh = ss.getSheetByName(name);
    if (sh) sh.copyTo(ss).setName('BK_' + name + '_' + stamp).hideSheet();
  });

  // 2. Cào toàn bộ lịch sử vào DATA_MEGA
  const existing = readDraws_();
  let incoming = [];
  try { incoming = fetchFromGithub_(); } catch (err) { console.warn('GitHub lỗi: ' + err); }
  const merged = mergeDraws_(existing, incoming);
  writeDraws_(merged.draws);
  formatDataSheet_();

  // 3. Chuyển DU_DOAN_LOG cũ (dạng khối) sang dạng bảng phẳng
  const migrated = migrateLegacyLog_(merged.draws);

  // 4. Đối soát + báo cáo
  const settled = settleAndReport_(merged.draws);
  formatLogSheet_();

  // 5. Trigger: cào mỗi giờ
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('syncResults').timeBased().everyHours(1).create();

  const msg = 'Hoàn tất!\n- DATA_MEGA: ' + merged.draws.length + ' kỳ (thêm ' + merged.added + ', sửa ' + merged.corrected + ')' +
    '\n- DU_DOAN_LOG: chuyển ' + migrated + ' vé từ log cũ' +
    '\n- Đã đối soát ' + settled + ' vé' +
    '\n- Trigger cào dữ liệu mỗi giờ đã bật' +
    '\n- Bản sao lưu: các sheet BK_*_' + stamp + ' (đang ẩn)';
  console.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (err) { /* chạy từ editor không có UI */ }
  return msg;
}

/**
 * Log cũ: B="Dự đoán sau kỳ X" (khối hiện tại) hoặc "Kỳ T" (kho lưu, T = kỳ đối soát), C=STT, D..I=6 số.
 * Trả số vé đã chuyển. Nếu sheet đã ở định dạng mới thì không làm gì.
 */
function migrateLegacyLog_(drawsDesc) {
  const sh = getSheet_(CFG.SHEET_LOG);
  const last = sh.getLastRow();
  if (last >= 1 && String(sh.getRange(1, 1).getValue()) === LOG_HEADERS[0]) return 0;

  const values = last > 0 ? sh.getRange(1, 1, last, Math.max(12, sh.getLastColumn())).getValues() : [];
  const drawsAsc = drawsDesc.slice().reverse();
  const prevDraw = function (target) {
    let prev = null;
    for (let i = 0; i < drawsAsc.length && drawsAsc[i].date < target; i++) prev = drawsAsc[i].date;
    return prev;
  };

  const seen = {};
  const rows = [];
  values.forEach(function (r) {
    const label = String(r[1] || '').trim();
    let basedOn = null;
    let m = label.match(/^Dự đoán sau kỳ\s+(.+)$/i);
    if (m) basedOn = normDate_(m[1]);
    else if ((m = label.match(/^Kỳ\s+(\d.+)$/i))) {
      const target = normDate_(m[1]);
      basedOn = target ? prevDraw(target) : null;
    }
    const ticket = validTicket_(r.slice(3, 9));
    if (!basedOn || !ticket) return;
    const key = basedOn + '|' + ticket.join('-');
    if (seen[key]) return;
    seen[key] = true;
    rows.push(['(log cũ)', toDate_(basedOn), 'LEGACY_30', Number(r[2]) || '']
      .concat(ticket, ['', '', '', '', '', STATUS_PENDING]));
  });

  // Cũ nhất trước, mới nhất cuối (giống cách ghi mới)
  rows.sort(function (a, b) { return a[1] - b[1] || a[3] - b[3]; });

  sh.clear();
  ensureLogHeader_(sh);
  if (rows.length) {
    ensureRows_(sh, rows.length + 1);
    sh.getRange(2, 1, rows.length, LOG_HEADERS.length).setValues(rows);
    sh.getRange(2, 2, rows.length, 1).setNumberFormat('yyyy-mm-dd');
  }
  return rows.length;
}

function formatDataSheet_() {
  const sh = getSheet_(CFG.SHEET_DATA);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, DATA_HEADERS.length).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
  sh.setColumnWidth(1, 110);
}

function formatLogSheet_() {
  const sh = getSheet_(CFG.SHEET_LOG);
  ensureLogHeader_(sh);
  sh.getRange(1, 1, 1, LOG_HEADERS.length).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff').setWrap(true);
  const maxRows = Math.max(sh.getMaxRows() - 1, 1);
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThanOrEqualTo(3)
      .setBackground('#fde68a').setBold(true).setRanges([sh.getRange(2, 13, maxRows, 1)]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(STATUS_PENDING)
      .setFontColor('#2563eb').setRanges([sh.getRange(2, 16, maxRows, 1)]).build(),
  ]);
  if (sh.getFilter()) sh.getFilter().remove();
  sh.getRange(1, 1, sh.getMaxRows(), LOG_HEADERS.length).createFilter();
}
