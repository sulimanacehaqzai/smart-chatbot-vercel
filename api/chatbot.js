const { google } = require('googleapis');
const natural = require('natural');

const SPREADSHEET_ID = '1Q4PqM8FCNYVItiSlvpbNFsemrNhUZu-guuNSTe5gpE8';
const RANGE = 'Sheet1!A:B';

// احراز هویت گوگل
function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.CLIENT_EMAIL,
      private_key: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// گرفتن داده‌ها
async function getSheetData() {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: RANGE,
  });

  const rows = res.data.values || [];
  return rows.slice(1).map(row => ({
    سوال: (row[0] || '').toLowerCase(),
    پاسخ: row[1] || '',
  }));
}

// ذخیره سوال بی‌پاسخ
async function addUnansweredQuestion(question) {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: RANGE,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[question, '']],
    },
  });
}

module.exports = async (req, res) => {
  const userQuestion = (req.query.q || '').toLowerCase();
  if (!userQuestion) {
    return res.status(400).json({ error: "سوال ارسال نشده است" });
  }

  try {
    const data = await getSheetData();

    let bestScore = 0;
    let bestAnswer = '';

    data.forEach(item => {
      const score = natural.JaroWinklerDistance(userQuestion, item.سوال);
      if (score > bestScore) {
        bestScore = score;
        bestAnswer = item.پاسخ;
      }
    });

    if (bestScore < 0.7) {
      await addUnansweredQuestion(userQuestion);
      return res.json({ answer: "متأسفم، پاسخ مناسب پیدا نشد. سوال شما ذخیره شد.", score: bestScore });
    }

    return res.json({ answer: bestAnswer, score: bestScore });
  } catch (err) {
    console.error("ERROR:", err);
    return res.status(500).json({ error: "خطا در ارتباط با سیستم پاسخ‌گو" });
  }
};
