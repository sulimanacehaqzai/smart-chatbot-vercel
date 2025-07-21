const { WordTokenizer, JaroWinklerDistance } = require('natural');
const { google } = require('googleapis');
const fetch = require('node-fetch');

// ---- CONFIG ----
const SPREADSHEET_ID = '1Q4PqM8FCNYVItiSlvpbNFsemrNhUZu-guuNSTe5gpE8';
const RANGE = 'Sheet1!A:B';
const HF_MODEL = 'bigscience/bloomz-560m'; // مدل سبک HuggingFace

// ---- توابع ----
const tokenizer = new WordTokenizer();

async function getSheetData() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.CLIENT_EMAIL,
      private_key: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });

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

async function saveUnansweredQuestion(question) {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.CLIENT_EMAIL,
        private_key: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:A',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[question]],
      },
    });
  } catch (error) {
    console.error('خطا در ذخیره سوال بی‌پاسخ:', error);
  }
}

async function askHuggingFace(question) {
  try {
    const response = await fetch(`https://api-inference.huggingface.co/models/${HF_MODEL}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HF_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: question }),
    });

    const result = await response.json();
    if (result.error) {
      console.error('HuggingFace Error:', result.error);
      return "پاسخ مناسبی پیدا نشد.";
    }
    return result[0]?.generated_text || "پاسخ مناسبی پیدا نشد.";
  } catch (err) {
    console.error('HuggingFace API Error:', err);
    return "خطا در تولید پاسخ.";
  }
}

// ---- هندلر API ----
module.exports = async (req, res) => {
  const userQuestion = req.query.q?.toLowerCase();
  if (!userQuestion) {
    return res.status(400).json({ error: "سوال ارسال نشده است" });
  }

  try {
    const data = await getSheetData();

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
      // ذخیره سوال و پرسش از HuggingFace
      await saveUnansweredQuestion(userQuestion);
      const hfAnswer = await askHuggingFace(userQuestion);
      return res.json({ answer: hfAnswer, match: "AI Response", score: 0 });
    }

    return res.json({ answer: bestAnswer, match: bestMatch, score: bestScore });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "خطا در ارتباط با سیستم پاسخ‌گو" });
  }
};
