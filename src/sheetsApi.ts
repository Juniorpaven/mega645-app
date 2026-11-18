// File: src/sheetsApi.ts
// Client gọi Google Apps Script Web App (file AUTO_DATA_MEGA). Mã nguồn server: apps-script/Code.gs

import { normalizeDate, type Draw } from './strategies';

const DEFAULT_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbz_NjoyhIJ9Jjm60jGUsgUxrrbFVo9DtMMM7qPS6ckBKuHGNEPAbL3iPhePvhdvANJCiQ/exec';

export const GOOGLE_SCRIPT_URL: string = import.meta.env.VITE_GOOGLE_SCRIPT_URL || DEFAULT_SCRIPT_URL;

// Lưu ý: token nằm trong bundle JS nên KHÔNG phải bí mật thật sự — chỉ để chặn spam/bot quét.
const API_TOKEN: string = import.meta.env.VITE_SHEETS_TOKEN || '';

/** Lấy N kỳ mới nhất từ sheet DATA_MEGA (mới nhất đứng đầu). */
export const fetchDraws = async (limit = 60): Promise<Draw[]> => {
  const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=draws&limit=${limit}`);
  const json = await res.json();
  if (json.status !== 'SUCCESS' || !Array.isArray(json.data)) {
    throw new Error(json.message || 'Phản hồi không hợp lệ từ Google Sheets');
  }
  return (json.data as { date: string; numbers: number[] }[])
    .map(item => ({ date: normalizeDate(String(item.date)) ?? String(item.date), numbers: item.numbers.map(Number) }))
    .filter(d => d.numbers.length === 6);
};

// Apps Script không trả header CORS cho POST => dùng no-cors + text/plain (không đọc được phản hồi).
const post = async (payload: Record<string, unknown>) => {
  await fetch(GOOGLE_SCRIPT_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...payload, token: API_TOKEN }),
  });
};

/** Ghi kết quả kỳ quay nhập tay (bot cào tự động sẽ ghi đè bằng số chính thức nếu khác). */
export const addDrawResult = (date: string, numbers: number[]) =>
  post({ action: 'ADD_DRAW_RESULT', date, numbers });

/**
 * Ghi các bộ vé dự đoán cho kỳ KẾ TIẾP sau `basedOnDate`.
 * Server tự chống trùng theo (basedOnDate, chiến lược) nên gọi lại nhiều lần / nhiều thiết bị vẫn an toàn.
 */
export const logPredictions = (basedOnDate: string, strategies: Record<string, number[][]>) =>
  post({ action: 'LOG_PREDICTIONS', basedOnDate, strategies });
