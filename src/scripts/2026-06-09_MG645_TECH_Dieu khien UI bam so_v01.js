// File nội bộ: 2026-06-09_MG645_TECH_Dieu khien UI bam so_v01.js
// Mục đích: Kiểm soát luồng nhấn nút, xử lý bộ nhớ đệm Cache LocalStorage ngăn chặn cạn kiệt Quota API.

import { processAItoMatrix } from './2026-06-09_MG645_TECH_Logic ma tran 8 so_v01.js';

/**
 * Hàm điều khiển chính khi người dùng nhấn nút "Tạo số" hoặc "Quét thuật toán"
 * @param {Array} historicalDataArray - Mảng chứa chuỗi kết quả các kỳ quay quá khứ
 */
export async function handleGenerateV2(historicalDataArray) {
  const CACHE_KEY = 'MEGA645_AI_STORAGE';
  const ONE_HOUR_IN_MS = 60 * 60 * 1000; // Định nghĩa thời gian đóng băng dữ liệu (1 tiếng)
  const currentTime = Date.now();

  // BƯỚC 1: KIỂM TRA BỘ NHỚ ĐỆM TĨNH (LOCALSTORAGE CACHE)
  const cachedPayload = localStorage.getItem(CACHE_KEY);
  
  if (cachedPayload) {
    try {
      const { timestamp, aiData } = JSON.parse(cachedPayload);
      
      // Kiểm tra xem thời gian lưu trữ đã vượt quá 1 tiếng chưa
      if (currentTime - timestamp < ONE_HOUR_IN_MS) {
        console.log("Hệ thống phát hiện Cache hợp lệ. Tiến hành bóc tách dữ liệu cũ để tái cấu trúc ma trận.");
        
        // Gọi hàm xử lý ma trận từ dữ liệu cũ thu được từ AI trước đó
        const finalTickets = processAItoMatrix(aiData);
        
        // Render trực tiếp lên màn hình hiển thị kết quả (Thay thế bằng hàm hiển thị của app bạn)
        if (typeof renderUI === "function") {
          renderUI(finalTickets);
        } else {
          console.log("Kết quả ma trận từ Cache:", finalTickets);
        }
        return; // Ngắt luồng xử lý, không chạy xuống phần gọi API phía dưới
      }
    } catch (cacheError) {
      console.error("Lỗi cấu trúc dữ liệu Cache, tiến hành dọn sạch và gọi API mới:", cacheError);
      localStorage.removeItem(CACHE_KEY);
    }
  }

  // BƯỚC 2: NẾU KHÔNG CÓ CACHE HOẶC CACHE HẾT HẠN -> TIẾN HÀNH GỌI NETLIFY SERVERLESS FUNCTION
  if (typeof showLoadingScreen === "function") {
    showLoadingScreen("Hệ thống AI đang phân tích dữ liệu chuỗi...");
  }

  try {
    // Gọi lệnh đến đường dẫn Serverless ngầm của Netlify
    const response = await fetch('/.netlify/functions/gemini', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        history: historicalDataArray.join(", ") 
      })
    });
    
    if (!response.ok) {
      throw new Error(`Phản hồi từ Serverless Function không hợp lệ: ${response.status}`);
    }
    
    const aiData = await response.json();

    // BƯỚC 3: GHI DỮ LIỆU MỚI VÀO BỘ NHỚ ĐỆM ĐỂ KHÓA TRONG KỲ TIẾP THEO
    const newCachePayload = {
      timestamp: currentTime,
      aiData: aiData
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(newCachePayload));

    // BƯỚC 4: CHUYỂN ĐỔI DỮ LIỆU THÀNH MA TRẬN VÀ IN RA GIAO DIỆN
    const finalTickets = processAItoMatrix(aiData);
    
    if (typeof hideLoadingScreen === "function") {
      hideLoadingScreen();
    }
    
    if (typeof renderUI === "function") {
      renderUI(finalTickets);
    } else {
      console.log("Kết quả ma trận từ API mới:", finalTickets);
    }

  } catch (error) {
    console.error("Lỗi nghiêm trọng trong tiến trình thực thi luồng điều khiển:", error);
    if (typeof hideLoadingScreen === "function") {
      hideLoadingScreen();
    }
    alert("Hệ thống xử lý AI đang bận hoặc gặp lỗi cấu hình kết nối. Vui lòng thử lại sau.");
  }
}
