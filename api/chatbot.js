const { WordTokenizer, JaroWinklerDistance } = require('natural');
const { google } = require('googleapis');

const tokenizer = new WordTokenizer();

// مشخصات Google Sheets
const SPREADSHEET_ID = '1Q4PqM8FCNYVItiSlvpbNFsemrNhUZu-guuNSTe5gpE8';
const RANGE = 'Sheet1!A:B';
const UNANSWERED_RANGE = 'Unanswered!A:A'; // شیت مخصوص سوالات بی‌پاسخ

// ایجاد احراز هویت
function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.CLIENT_EMAIL,
      private_key: process.env.PRIVATE_KEY.replace(/\\n/g, '\n')
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
}

// دریافت داده‌ها از Google Sheets
async function getSheetData() {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: RANGE,
  });

  const rows = res.data.values || [];
  return rows.map(row => ({
    سوال: row[0] || '',
    پاسخ: row[1] || '',
  }));
}

// ذخیره سوال بی‌پاسخ در Google Sheets
async function addUnansweredQuestion(question) {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: UNANSWERED_RANGE,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[question]]
      }
    });

    console.log(`سوال بی‌پاسخ ذخیره شد: ${question}`);
  } catch (err) {
    console.error("خطا در ذخیره سوال بی‌پاسخ:", err);
  }
}

// محاسبه شباهت بهتر بین سوال‌ها
function calculateSimilarity(q1, q2) {
  if (!q1 || !q2) return 0;

  const tokens1 = tokenizer.tokenize(q1);
  const tokens2 = tokenizer.tokenize(q2);

  // درصد کلمات مشترک
  const common = tokens1.filter(word => tokens2.includes(word)).length;
  const tokenScore = common / Math.max(tokens1.length, tokens2.length);

  // میانگین JaroWinkler و TokenScore
  const jwScore = JaroWinklerDistance(q1, q2);
  return (jwScore + tokenScore) / 2;
}

// هندلر API
module.exports = async (req, res) => {
  const userQuestion = req.query.q?.toLowerCase();
  if (!userQuestion) {
    return res.status(400).json({ error: "سوال ارسال نشده است" });
  }

  try {
    const data = await getSheetData();
    console.log("داده‌های شیت:", data);

    let bestMatch = "";
    let bestAnswer = "";
    let bestScore = 0;

    for (let row of data) {
      const sheetQuestion = (row["سوال"] || "").toLowerCase();
      const sheetAnswer = row["پاسخ"] || "";
      const score = calculateSimilarity(userQuestion, sheetQuestion);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = sheetQuestion;
        bestAnswer = sheetAnswer;
      }
    }

    // اگر پاسخ پیدا نشود
    if (bestScore < 0.5 || !bestAnswer) {
      await addUnansweredQuestion(userQuestion);
      return res.json({ answer: "متأسفم، پاسخ مناسب پیدا نشد." });
    }

    return res.json({ answer: bestAnswer, match: bestMatch, score: bestScore });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "خطا در ارتباط با سیستم پاسخ‌گو" });
  }
};
