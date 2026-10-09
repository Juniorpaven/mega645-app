// File nội bộ: 2026-06-09_MG645_TECH_Ham serverless ket noi Gemini_v01.js
// Mục đích: Gọi API Gemini ẩn danh từ Server của Netlify
// Dùng cú pháp Netlify Functions v2 để nhận thông tin xác thực từ Netlify AI Gateway

export default async (req) => {
  // GEMINI_API_KEY / GOOGLE_GEMINI_BASE_URL được Netlify AI Gateway tự động cung cấp
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
    const response = await fetch(`${baseUrl}/v1beta/models/gemini-2.5-flash:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    const data = await response.json();
    let jsonText = data.candidates[0].content.parts[0].text;
    jsonText = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();

    return Response.json(JSON.parse(jsonText));
  } catch (error) {
    return Response.json({ error: "AI Processing Failed" }, { status: 500 });
  }
};
