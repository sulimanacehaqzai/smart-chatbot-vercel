const { WordTokenizer, JaroWinklerDistance, PorterStemmerFa } = require('natural');
const { google } = require('googleapis');
const tokenizer = new WordTokenizer();

// آیدی شیت
const SPREADSHEET_ID = '1Q4PqM8FCNYVItiSlvpbNFsemrNhUZu-guuNSTe5gpE8';
const RANGE = 'Sheet1!A:B';

// لیست Stop Words برای فارسی
const STOP_WORDS = ["از", "برای", "که", "به", "در", "یک", "با", "های", "را", "هم", "و", "یا", "این", "آن", "تا", "چه"];

// ---- احراز هویت ----
function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.CLIENT_EMAIL,
      private_key: process.env.PRIVATE_KEY.replace(/\\n/g, '\n')
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
}

// ---- گرفتن داده‌ها از Google Sheets ----
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

// ---- اضافه کردن سوالات بی‌پاسخ به Google Sheet ----
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

// ---- پیش‌پردازش متن ----
function preprocess(text) {
  return tokenizer
    .tokenize(text.toLowerCase().replace(/[^\u0600-\u06FFa-z0-9\s]/g, ''))
    .filter(word => !STOP_WORDS.includes(word))
    .map(word => PorterStemmerFa.stem(word)); // ریشه‌یابی کلمات فارسی
}

// ---- محاسبه شباهت بین دو جمله ----
function calculateSimilarity(question1, question2) {
  const tokens1 = preprocess(question1);
  const tokens2 = preprocess(question2);

  const joined1 = tokens1.join(" ");
  const joined2 = tokens2.join(" ");

  const jaro = JaroWinklerDistance(joined1, joined2);
  const overlap = tokens1.filter(t => tokens2.includes(t)).length / Math.max(tokens1.length, tokens2.length);

  return (jaro * 0.7) + (overlap * 0.3); // ترکیب Jaro-Winkler و Overlap
}

// ---- هندلر API ----
module.exports = async (req, res) => {
  const userQuestion = req.query.q?.trim();
  if (!userQuestion) {
    return res.status(400).json({ error: "سوال ارسال نشده است" });
  }

  try {
    const data = await getSheetData();

    let bestAnswer = "";
    let bestScore = 0;

    for (let row of data) {
      const sheetQuestion = row["سوال"] || "";
      const sheetAnswer = row["پاسخ"] || "";

      const score = calculateSimilarity(userQuestion, sheetQuestion);
      if (score > bestScore) {
        bestScore = score;
        bestAnswer = sheetAnswer;
      }
    }

    if (bestScore < 0.6 || !bestAnswer) {
      await addUnansweredQuestion(userQuestion);
      return res.json({ answer: "متأسفم، پاسخ مناسب پیدا نشد." });
    }

    return res.json({ answer: bestAnswer, score: bestScore });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "خطا در ارتباط با سیستم پاسخ‌گو" });
  }
};
