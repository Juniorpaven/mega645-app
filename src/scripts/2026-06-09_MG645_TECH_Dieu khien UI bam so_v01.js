// File nội bộ: 2026-06-09_MG645_TECH_Dieu khien UI bam so_v01.js
import { processAItoMatrix } from './2026-06-09_MG645_TECH_Logic ma tran 8 so_v01.js';

export async function handleGenerateV2(historicalDataArray) {
  // Bật trạng thái Loading trên UI
  showLoadingScreen("Đang kết nối Gemini AI...");

  try {
    // 1. Gửi lịch sử lên Netlify Function ẩn
    const response = await fetch('/.netlify/functions/gemini', {
      method: 'POST',
      body: JSON.stringify({ history: historicalDataArray.join(", ") })
    });
    
    if (!response.ok) throw new Error("Lỗi máy chủ AI");
    
    const aiData = await response.json();

    // 2. Ép vào ma trận 8 số
    const finalTickets = processAItoMatrix(aiData);

    // 3. Render ra UI (Giả định hàm renderUI() đã có sẵn ở repo cũ)
    hideLoadingScreen();
    renderUI(finalTickets);

  } catch (error) {
    console.error("Lỗi:", error);
    alert("Không thể tạo số từ AI. Vui lòng thử lại.");
    hideLoadingScreen();
  }
}
