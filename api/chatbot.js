const { WordTokenizer, JaroWinklerDistance } = require('natural');
const { google } = require('googleapis');
const fetch = require('node-fetch');

const tokenizer = new WordTokenizer();
const SPREADSHEET_ID = '1Q4PqM8FCNYVItiSlvpbNFsemrNhUZu-guuNSTe5gpE8';
const RANGE = 'Sheet1!A:B';

// گرفتن داده‌ها از Google Sheets
async function getSheetData(auth) {
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: RANGE,
  });
  const rows = res.data.values || [];
  return rows.slice(1).map(row => ({
    سوال: row[0] || '',
    پاسخ: row[1] || '',
  }));
}

// ذخیره سوال و پاسخ در Google Sheets
async function appendToSheet(auth, question, answer) {
  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: RANGE,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[question, answer]],
    },
  });
}

// تولید پاسخ از HuggingFace
async function getAIResponse(question) {
  const HF_API_TOKEN = process.env.HF_API_TOKEN; // توکن HuggingFace
  const response = await fetch("https://api-inference.huggingface.co/models/google/flan-t5-base", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${HF_API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ inputs: question })
  });
  const result = await response.json();
  return result[0]?.generated_text || "پاسخی پیدا نشد.";
}

// هندلر API
module.exports = async (req, res) => {
  const userQuestion = req.query.q?.toLowerCase();
  if (!userQuestion) return res.status(400).json({ error: "سوال ارسال نشده است" });

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.CLIENT_EMAIL,
        private_key: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const data = await getSheetData(auth);

    let bestMatch = "";
    let bestAnswer = "";
    let bestScore = 0;

    for (let row of data) {
      const sheetQuestion = (row["سوال"] || "").toLowerCase();
      const sheetAnswer = row["پاسخ"] || "";
      const score = JaroWinklerDistance(userQuestion, sheetQuestion);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = sheetQuestion;
        bestAnswer = sheetAnswer;
      }
    }

    if (bestScore < 0.7) {
      // پاسخ از HuggingFace
      const aiAnswer = await getAIResponse(userQuestion);

      // ذخیره سوال و پاسخ در Google Sheets
      await appendToSheet(auth, userQuestion, aiAnswer);

      return res.json({ answer: aiAnswer, match: "AI Response", score: 1 });
    }

    return res.json({ answer: bestAnswer, match: bestMatch, score: bestScore });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "خطا در ارتباط با سیستم پاسخ‌گو" });
  }
};
