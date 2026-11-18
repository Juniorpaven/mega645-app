# Apps Script cho file Google Sheets `AUTO_DATA_MEGA`

Script này được gắn với file Sheets. Nó làm 4 việc:

1. **Tự cào kết quả** Mega 6/45 mỗi giờ.
   - Nguồn chính: bộ dữ liệu JSONL đối chiếu từ Vietlott ([vietvudanh/vietlott-data](https://github.com/vietvudanh/vietlott-data)), có lịch sử từ kỳ 00198 (25/10/2017).
   - Nguồn dự phòng: trang kết quả của vietlott.vn.
2. **Nhận dự đoán** của tất cả chiến lược từ app. Mỗi cặp (kỳ, chiến lược) chỉ được ghi một lần, nên không còn ghi trùng.
3. **Đối soát** từng vé với **kỳ quay kế tiếp** sau kỳ dùng để dự đoán.
4. **Lập báo cáo** hiệu quả theo chiến lược. Có nhóm đối chứng ngẫu nhiên và mốc lý thuyết để biết chiến lược nào thật sự khác so với mua ngẫu nhiên.

## Cấu trúc 3 sheet sau khi cài

| Sheet | Nội dung |
|---|---|
| `DATA_MEGA` | Cột Ngày, Bóng 1 → 6, Kỳ quay, Nguồn (`GITHUB` / `VIETLOTT` / `MANUAL`), Cập nhật lúc. Kỳ mới nhất ở dòng 2. |
| `DU_DOAN_LOG` | Bảng phẳng, mỗi dòng là 1 vé, với các cột: Thời gian ghi, Dựa trên kỳ, Chiến lược, STT, 6 số, Kỳ đối soát, Kết quả, Số trùng, Giải, Tiền thưởng, Trạng thái. Có sẵn bộ lọc, nên chỉ cần lọc theo `Chiến lược` hoặc `Trạng thái`. |
| `DOI_SOAT_CUON_CHIEU` | Phần A là tổng hợp 30 kỳ gần nhất, phần B là toàn bộ lịch sử, phần C là chi tiết từng kỳ theo từng chiến lược. |

## Cài đặt (khoảng 5 phút)

1. Mở file Sheets, chọn **Tiện ích mở rộng → Apps Script**.
2. Xoá toàn bộ code cũ trong `Code.gs` rồi dán nội dung file [`Code.gs`](./Code.gs) vào.
   - Nếu muốn dùng manifest: vào ⚙️ *Cài đặt dự án*, bật **Hiển thị tệp kê khai "appsscript.json"** rồi dán nội dung [`appsscript.json`](./appsscript.json).
3. Chọn hàm `setupMega` trên thanh công cụ, bấm **Chạy** và cấp quyền. Hàm này sẽ:
   - sao lưu 3 sheet cũ thành các sheet ẩn `BK_*_<thời gian>`;
   - nạp toàn bộ lịch sử kỳ quay vào `DATA_MEGA`;
   - chuyển `DU_DOAN_LOG` cũ (dạng khối) sang bảng phẳng, gắn nhãn chiến lược `LEGACY_30`;
   - đối soát và dựng lại báo cáo;
   - xoá các trigger cũ, tạo trigger `syncResults` chạy mỗi giờ.
4. **Triển khai lại Web App, giữ nguyên URL.** Vào **Triển khai → Quản lý các lần triển khai**, bấm ✏️ ở bản đang dùng, chọn *Phiên bản: Phiên bản mới*, rồi bấm **Triển khai**.
   - Đừng chọn "Triển khai mới", vì sẽ ra URL khác và app sẽ không gọi được.
   - Phần *Thực thi với tư cách* để là **Tôi**, *Người có quyền truy cập* để là **Bất kỳ ai**.
5. (Tuỳ chọn, nên làm) **Chống spam**:
   - Vào ⚙️ *Cài đặt dự án → Thuộc tính tập lệnh* và thêm `API_TOKEN = <chuỗi bất kỳ>`.
   - Đặt cùng chuỗi đó vào biến `VITE_SHEETS_TOKEN` khi build app: tạo GitHub Secret tên `VITE_SHEETS_TOKEN`, hoặc dùng file `.env.local` khi chạy ở máy.
   - Lưu ý: token nằm trong bundle JS nên chỉ chặn được bot và spam thông thường, không phải bảo mật tuyệt đối.
   - Khi đã đặt `API_TOKEN`, bản app cũ chưa có token sẽ bị từ chối ghi.

Sau khi cài, menu **🎯 Mega 6/45** xuất hiện trong Sheets với 3 mục: cào và đối soát ngay, chỉ lập lại báo cáo, và chạy lại setup.

## API (app React dùng)

- `GET ?action=draws&limit=60`: trả về `{status:"SUCCESS", data:[{date:"yyyy-mm-dd", numbers:[..6], id}]}`, mới nhất đứng đầu.
- `GET ?action=summary`: trả về tóm tắt hiệu quả 30 kỳ theo chiến lược, dạng JSON.
- `POST {action:"LOG_PREDICTIONS", basedOnDate, strategies:{TEN_CHIEN_LUOC:[[6 số], ...]}, token}`
- `POST {action:"ADD_DRAW_RESULT", date, numbers, token}`: dùng cho kỳ nhập tay. Nguồn tự động sẽ ghi đè nếu số chính thức khác.
- Script vẫn nhận payload cũ `{action:"LOG_PREDICTIONS", targetDate:"Dự đoán sau kỳ X", tickets}`, nên bản app cũ vẫn chạy được.

## Cách đọc báo cáo

- **TB số trùng/vé**: một vé ngẫu nhiên trung bình trùng **0,8 số**.
- **Hệ số so ngẫu nhiên** = TB số trùng / 0,8. Giá trị 1,00 nghĩa là ngang với mua ngẫu nhiên.
- **Độ lệch z**: tính trên trung bình từng kỳ, vì các kỳ độc lập với nhau, còn các vé trong cùng một bộ bao thì tương quan với nhau.
  - |z| < 2 nghĩa là chưa có bằng chứng chiến lược khác ngẫu nhiên.
  - Cần ít nhất 5 kỳ mới tính được; càng nhiều kỳ thì kết luận càng đáng tin.
- **Dòng LÝ THUYẾT**: kỳ vọng toán học của 1 vé 10.000đ là khoảng 1.370đ tiền thưởng, chưa tính Jackpot (ROI khoảng −86%).
- **RANDOM_10** là nhóm đối chứng do app sinh ngẫu nhiên mỗi kỳ, dùng để so sánh trên cùng các kỳ quay.
