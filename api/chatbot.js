const { WordTokenizer, JaroWinklerDistance } = require('natural');
const { google } = require('googleapis');
const path = require('path');

const tokenizer = new WordTokenizer();

// مسیر فایل credentials.json
const KEYFILEPATH = path.join(__dirname, 'credentials.json');
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// آیدی شیت خود
const SPREADSHEET_ID = '1Q4PqM8FCNYVItiSlvpbNFsemrNhUZu-guuNSTe5gpE8';

// محدوده سوال و پاسخ (ستون A و B در Sheet1)
const RANGE = 'Sheet1!A:B';

// گرفتن داده‌ها از شیت
async function getSheetData() {
  const auth = new google.auth.GoogleAuth({
    keyFile: KEYFILEPATH,
    scopes: SCOPES,
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

// ذخیره سوال بی‌پاسخ در شیت Unanswered
async function saveUnansweredQuestion(question) {
  const auth = new google.auth.GoogleAuth({
    keyFile: KEYFILEPATH,
    scopes: SCOPES,
  });

  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Unanswered!A:A',  // شیت جدید به نام Unanswered
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[question]],
    },
  });
}

// هندلر API
module.exports = async function handler(req, res) {
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

    // اگر پاسخ مناسب نبود، سوال را در شیت ذخیره کن
    if (bestScore < 0.7) {
      await saveUnansweredQuestion(userQuestion);
      return res.json({ 
        answer: "متأسفم، پاسخ مناسب پیدا نشد. سوال شما ذخیره شد تا در آینده پاسخ داده شود." 
      });
    }

    return res.json({ answer: bestAnswer, match: bestMatch, score: bestScore });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "خطا در ارتباط با سیستم پاسخ‌گو" });
  }
};
