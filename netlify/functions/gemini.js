// File nội bộ: 2026-06-09_MG645_TECH_Ham serverless ket noi Gemini_v02.js
// Mục đích: Gọi API Gemini ẩn danh từ Server của Netlify (Netlify Functions v2)
import fetch from 'node-fetch';

export default async (req) => {
  // Lấy API Key từ biến môi trường của Netlify (Settings > Environment variables)
  const apiKey = process.env.GEMINI_API_KEY; 
  if (!apiKey) {
    return Response.json({ error: "Missing API Key" }, { status: 500 });
  }

  const baseUrl = (process.env.GOOGLE_GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/$/, "");

  // Parse dữ liệu 50 kỳ quá khứ từ Frontend gửi lên
  let body = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const historicalData = body.history || "";

  const prompt = `
    Vai trò: Chuyên gia thống kê xổ số.
    Phân tích chuỗi 50 kỳ Mega 6/45: ${historicalData}.
    Yêu cầu:
    1. Tìm 2 số có tần suất xuất hiện cao nhất (Hot).
    2. Tìm 2 số có tần suất thấp nhất (Cold).
    Trả về ĐÚNG 1 chuỗi JSON, không giải thích: {"hot": [x,y], "cold": [z,w]}
  `;

  try {
    const response = await fetch(`${baseUrl}/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    const data = await response.json();
    if (!data.candidates || data.candidates.length === 0) {
      throw new Error("Invalid response from Gemini API");
    }

    let jsonText = data.candidates[0].content.parts[0].text;
    jsonText = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();

    return Response.json(JSON.parse(jsonText));
  } catch (error) {
    return Response.json({ error: "AI Processing Failed", details: error.message }, { status: 500 });
  }
};
