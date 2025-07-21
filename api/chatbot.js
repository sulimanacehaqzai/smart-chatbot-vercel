const { WordTokenizer, JaroWinklerDistance } = require('natural');
const { google } = require('googleapis');
const axios = require('axios');

const tokenizer = new WordTokenizer();

const SPREADSHEET_ID = '1Q4PqM8FCNYVItiSlvpbNFsemrNhUZu-guuNSTe5gpE8';
const RANGE = 'Sheet1!A:B';
const HUGGINGFACE_API_TOKEN = process.env.HUGGINGFACE_API_TOKEN; // توکن خودتو اینجا بذار

// گرفتن داده‌ها از Google Sheets
async function getSheetData() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.CLIENT_EMAIL,
      private_key: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
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

// ذخیره سوال و پاسخ جدید در گوگل شیت
async function appendToSheet(question, answer) {
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
    range: RANGE,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[question, answer]],
    },
  });
}

// تولید پاسخ با HuggingFace
async function getHuggingFaceAnswer(question) {
  try {
    const response = await axios.post(
      'https://api-inference.huggingface.co/models/pszemraj/long-t5-tglobal-base-16384-book-summary',
      { inputs: question },
      {
        headers: {
          Authorization: `Bearer ${HUGGINGFACE_API_TOKEN}`,
        },
      }
    );
    // پاسخ ممکن است در ساختار response.data باشد، مثلا response.data[0].summary_text
    if (response.data && Array.isArray(response.data) && response.data[0]?.summary_text) {
      return response.data[0].summary_text;
    }
    // اگر پاسخ درست نبود، متن کامل را برگردان
    if (typeof response.data === 'string') return response.data;
    return "متأسفانه نتوانستم پاسخ دقیقی بیابم.";
  } catch (e) {
    console.error("خطا در دریافت پاسخ از HuggingFace:", e.message);
    return "خطا در دریافت پاسخ از سیستم هوش مصنوعی.";
  }
}

// هندلر API
module.exports = async (req, res) => {
  const userQuestion = req.query.q?.trim().toLowerCase();
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

    // اگر امتیاز بالای 0.7 بود پاسخ را از گوگل شیت ارسال کن
    if (bestScore >= 0.7) {
      return res.json({ answer: bestAnswer, match: bestMatch, score: bestScore });
    }

    // اگر پاسخ مناسب نبود، از HuggingFace بخواه پاسخ تولید کند
    const hfAnswer = await getHuggingFaceAnswer(userQuestion);

    // پاسخ را در گوگل شیت ذخیره کن (سوال و پاسخ جدید)
    await appendToSheet(userQuestion, hfAnswer);

    return res.json({ answer: hfAnswer, match: null, score: 0 });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "خطا در ارتباط با سیستم پاسخ‌گو" });
  }
};
