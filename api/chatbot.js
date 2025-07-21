const { WordTokenizer, JaroWinklerDistance } = require('natural');
const { google } = require('googleapis');

const tokenizer = new WordTokenizer();

// آیدی شیت شما
const SPREADSHEET_ID = '1Q4PqM8FCNYVItiSlvpbNFsemrNhUZu-guuNSTe5gpE8';
const RANGE = 'Sheet1!A:B';

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.CLIENT_EMAIL,
      private_key: process.env.PRIVATE_KEY.replace(/\\n/g, '\n')
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
}

// گرفتن داده‌ها از Google Sheets
async function getSheetData() {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });

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

// تابع محاسبه شباهت
function calculateSimilarity(q1, q2) {
  const score1 = JaroWinklerDistance(q1, q2);

  const tokens1 = tokenizer.tokenize(q1);
  const tokens2 = tokenizer.tokenize(q2);

  const common = tokens1.filter(word => tokens2.includes(word)).length;
  const tokenScore = common / Math.max(tokens1.length, tokens2.length);

  // میانگین وزنی: 70% JaroWinkler + 30% بر اساس کلمات مشترک
  return 0.7 * score1 + 0.3 * tokenScore;
}

// اضافه کردن سوالات بی‌پاسخ به Google Sheet
async function addUnansweredQuestion(question) {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Sheet1!A:A',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[question]],
    },
  });

  console.log(`سوال بی‌پاسخ به شیت اضافه شد: ${question}`);
}

// هندلر API
module.exports = async (req, res) => {
  const userQuestion = req.query.q?.toLowerCase();
  if (!userQuestion) {
    return res.status(400).json({ error: "سوال ارسال نشده است" });
  }

  try {
    const data = await getSheetData();

    let bestAnswer = "";
    let bestScore = 0;

    for (let row of data) {
      const sheetQuestion = (row["سوال"] || "").toLowerCase();
      const sheetAnswer = row["پاسخ"] || "";
      const score = calculateSimilarity(userQuestion, sheetQuestion);

      if (score > bestScore) {
        bestScore = score;
        bestAnswer = sheetAnswer;
      }
    }

    if (bestScore < 0.5 || !bestAnswer) {  // آستانه کمی پایین‌تر گذاشته شد
      await addUnansweredQuestion(userQuestion);
      return res.json({ answer: "متأسفم، پاسخ مناسب پیدا نشد." });
    }

    return res.json({ answer: bestAnswer, score: bestScore });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "خطا در ارتباط با سیستم پاسخ‌گو" });
  }
};
