# Mega 6/45 Pro

Ứng dụng web (React + Vite + PWA) dùng để thống kê và sinh bộ vé Mega 6/45 theo nhiều chiến lược. App kết nối với file Google Sheets `AUTO_DATA_MEGA` để lấy kết quả, ghi dự đoán và đối soát hiệu quả.

> ⚠️ Xổ số là ngẫu nhiên. Các bộ lọc (tần suất, nóng/lạnh, tổng, AC, …) **không làm tăng xác suất trúng**, chúng chỉ quyết định bạn mua *những bộ số nào*. Sheet `DOI_SOAT_CUON_CHIEU` có nhóm đối chứng ngẫu nhiên để bạn tự kiểm chứng điều này bằng dữ liệu thật.

## Kiến trúc

```
Vietlott ──(Apps Script cào mỗi giờ)──► Google Sheets AUTO_DATA_MEGA
                                         ├─ DATA_MEGA            (nguồn dữ liệu DUY NHẤT)
                                         ├─ DU_DOAN_LOG          (vé dự đoán của mọi chiến lược)
                                         └─ DOI_SOAT_CUON_CHIEU  (báo cáo hiệu quả)
                                                 ▲   │ GET 60 kỳ
                                    POST dự đoán │   ▼
                                     React app (Firebase Hosting)
                                         └─ Firestore: chỉ lưu trạng thái "nuôi vé" (lockedMatrix, currentDay)
```

| Thư mục / file | Vai trò |
|---|---|
| `src/strategies.ts` | Toàn bộ chiến lược sinh vé, viết dạng hàm thuần. Dùng RNG có seed nên cùng dữ liệu luôn cho cùng bộ vé. |
| `src/Mega645FilterEngine.ts` | Bộ lọc 10 quy luật và thuật toán bao thu gọn. |
| `src/sheetsApi.ts` | Client gọi Apps Script. |
| `src/components.tsx` | Các component hiển thị. |
| `apps-script/` | Mã nguồn Apps Script cho file Sheets. Xem [hướng dẫn cài](apps-script/README.md). |

Các chiến lược được ghi vào sheet:

| Mã | Nội dung |
|---|---|
| `COMBINATORIAL_10` | 10 quy luật + bao thu gọn, 30 vé |
| `BALANCED` | Cân bằng, 15 vé |
| `WHEEL` | Bao 10 số, 10 vé |
| `REVERSE_WHEEL_8` | Bao ngược 8 số, 4 vé |
| `RANDOM_10` | Đối chứng ngẫu nhiên, 10 vé |

## Chạy ở máy

```bash
npm ci
npm run dev      # http://localhost:5173
npm test         # unit test (vitest)
npm run lint
npm run build
```

Có thể khai báo các biến tuỳ chọn sau trong file `.env.local`:

```
VITE_GOOGLE_SCRIPT_URL=https://script.google.com/macros/s/.../exec
VITE_SHEETS_TOKEN=<trùng với API_TOKEN trong Apps Script>
```

## Triển khai

- **Web app:** push lên `main`, GitHub Actions sẽ chạy lint, test, build rồi deploy lên Firebase Hosting.
  - Có thể thêm các secret `VITE_GOOGLE_SCRIPT_URL` và `VITE_SHEETS_TOKEN` nếu dùng.
- **Firestore rules:** workflow không deploy rules, cần chạy tay bằng lệnh `firebase deploy --only firestore:rules`.
- **Apps Script:** xem [apps-script/README.md](apps-script/README.md).
