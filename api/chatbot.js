const { google } = require('googleapis');

// آیدی شیت
const SPREADSHEET_ID = '1Q4PqM8FCNYVItiSlvpbNFsemrNhUZu-guuNSTe5gpE8';
const RANGE = 'Sheet1!A:B'; // مطمئن شو نام Sheet درست باشد

// گرفتن کلیدها از Environment Variables
function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.CLIENT_EMAIL,
      private_key: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// گرفتن تمام سوالات و پاسخ‌ها
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

// افزودن سوال بی‌پاسخ به شیت
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

// هندلر API
module.exports = async (req, res) => {
  const userQuestion = (req.query.q || '').toLowerCase();
  if (!userQuestion) {
    return res.status(400).json({ error: "سوال ارسال نشده است" });
  }

  try {
    const data = await getSheetData();

    // جستجوی ساده (اگر بخشی از متن سوال شبیه باشد)
    let found = data.find(item => userQuestion.includes(item.سوال) || item.سوال.includes(userQuestion));

    if (!found) {
      // اگر سوال پیدا نشد، در شیت ذخیره کن
      await addUnansweredQuestion(userQuestion);
      return res.json({ answer: "متأسفم، پاسخ مناسب پیدا نشد. سوال شما ذخیره شد." });
    }

    return res.json({ answer: found.پاسخ });
  } catch (err) {
    console.error("ERROR:", err);
    return res.status(500).json({ error: "خطا در ارتباط با سیستم پاسخ‌گو" });
  }
};
