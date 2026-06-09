// File nội bộ: 2026-06-09_MG645_TECH_Ham serverless ket noi Gemini_v01.js
// Mục đích: Gọi API Gemini ẩn danh từ Server của Netlify
const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  // Lấy API Key từ biến môi trường của Netlify (Settings > Environment variables)
  const apiKey = process.env.GEMINI_API_KEY; 
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "Missing API Key" }) };
  }

  // Parse dữ liệu 50 kỳ quá khứ từ Frontend gửi lên
  const body = JSON.parse(event.body);
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
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    const data = await response.json();
    let jsonText = data.candidates[0].content.parts[0].text;
    jsonText = jsonText.replace(/```json/g, '').replace(/
```/g, '').trim();

    return {
      statusCode: 200,
      body: JSON.stringify(JSON.parse(jsonText))
    };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: "AI Processing Failed" }) };
  }
};
