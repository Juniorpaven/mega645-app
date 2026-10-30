import fetch from 'node-fetch';

export default async (req) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Missing API Key" }, { status: 500 });
  }
  
  const baseUrl = (process.env.GOOGLE_GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/$/, "");

  let body = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const historicalData = body.history || "";

  const prompt = `Phân tích dữ liệu lịch sử Vietlott Mega 6/45: ${historicalData}`;

  try {
    const response = await fetch(`${baseUrl}/v1beta/models/gemini-1.5-flash:generateContent`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'x-goog-api-key': apiKey 
      },
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
