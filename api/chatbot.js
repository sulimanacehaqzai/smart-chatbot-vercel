const { WordTokenizer, JaroWinklerDistance } = require('natural');
const { google } = require('googleapis');
const fetch = require('node-fetch'); // اگر در پروژه نیست نصب کن: npm install node-fetch@2

const tokenizer = new WordTokenizer();

// متغیرهای محیطی - مطمئن شو در Vercel تعریف شده‌اند:
const {
  CLIENT_EMAIL,
  PRIVATE_KEY,
  SPREADSHEET_ID,
  HUGGINGFACE_API_TOKEN
} = process.env;

const SHEET_READ_RANGE = 'Sheet1!A:B';
const SHEET_WRITE_RANGE = 'Sheet1!A:B';

// ساخت آبجکت گوگل شیت
function getSheetsClient() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: CLIENT_EMAIL,
      private_key: PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// خواندن داده‌ها از شیت
async function getSheetData() {
  const auth = await getSheetsClient();
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: SHEET_READ_RANGE,
  });

  const rows = res.data.values || [];
  // حذف ردیف اول عنوان و ساخت آرایه اشیاء
  return rows.slice(1).map(row => ({
    سوال: row[0] || '',
    پاسخ: row[1] || '',
  }));
}

// اضافه کردن سوال و پاسخ جدید به شیت
async function appendToSheet(question, answer) {
  try {
    const auth = await getSheetsClient();
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: SHEET_WRITE_RANGE,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[question, answer]],
      },
    });
  } catch (e) {
    console.error('خطا در افزودن به Google Sheets:', e);
  }
}

// گرفتن پاسخ از مدل HuggingFace
async function getAnswerFromHuggingFace(question) {
  try {
    const response = await fetch('https://api-inference.huggingface.co/models/tiiuae/falcon-7b-instruct', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HUGGINGFACE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: question,
        parameters: { max_new_tokens: 100 },
      }),
    });
    if (!response.ok) {
      throw new Error(`HuggingFace API error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    if (Array.isArray(data) && data[0]?.generated_text) {
      return data[0].generated_text.trim();
    }
    return null;
  } catch (err) {
    console.error('خطا در ارتباط با HuggingFace:', err);
    return null;
  }
}

module.exports = async (req, res) => {
  try {
    const userQuestionRaw = req.query.q;
    if (!userQuestionRaw) {
      return res.status(400).json({ error: 'سوال ارسال نشده است' });
    }

    const userQuestion = userQuestionRaw.toLowerCase();

    // خواندن سوالات و پاسخ‌ها از گوگل شیت
    const data = await getSheetData();

    let bestMatch = '';
    let bestAnswer = '';
    let bestScore = 0;

    // جستجوی بهترین تطابق
    for (let row of data) {
      const sheetQuestion = (row['سوال'] || '').toLowerCase();
      const sheetAnswer = row['پاسخ'] || '';
      const score = JaroWinklerDistance(userQuestion, sheetQuestion);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = sheetQuestion;
        bestAnswer = sheetAnswer;
      }
    }

    // اگر پاسخ معتبر در شیت بود، برگردان
    if (bestScore >= 0.7 && bestAnswer) {
      return res.json({ answer: bestAnswer, match: bestMatch, score: bestScore });
    }

    // پاسخ از HuggingFace بگیر
    const hfAnswer = await getAnswerFromHuggingFace(userQuestionRaw);

    if (hfAnswer) {
      // سوال و پاسخ جدید را ذخیره کن
      await appendToSheet(userQuestionRaw, hfAnswer);

      return res.json({ answer: hfAnswer, match: null, score: null });
    } else {
      // حتی پاسخ از HF هم نبود، سوال رو ذخیره کن بدون پاسخ
      await appendToSheet(userQuestionRaw, 'پاسخ یافت نشد');

      return res.json({ answer: 'متأسفم، پاسخ مناسب پیدا نشد.' });
    }
  } catch (err) {
    console.error('خطای کلی API:', err);
    return res.status(500).json({ error: 'خطا در ارتباط با سیستم پاسخ‌گو' });
  }
};
