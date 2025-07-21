const { google } = require('googleapis');
const natural = require('natural');
const TfIdf = natural.TfIdf;

// توقف‌واژه‌های فارسی
const stopWords = ['از', 'که', 'را', 'با', 'در', 'به', 'برای', 'و', 'یا', 'اما', 'یک', 'این', 'آن', 'چه', 'می'];

// آیدی شیت
const SPREADSHEET_ID = '1Q4PqM8FCNYVItiSlvpbNFsemrNhUZu-guuNSTe5gpE8';
const RANGE = 'Sheet1!A:B';

// احراز هویت گوگل
function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.CLIENT_EMAIL,
      private_key: process.env.PRIVATE_KEY.replace(/\\n/g, '\n')
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
}

// گرفتن داده از شیت
async function getSheetData() {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });

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

// ذخیره سوال بی پاسخ
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
}

// پاک‌سازی متن از توقف‌واژه‌ها
function cleanText(text) {
  return text
    .split(/\s+/)
    .filter(word => !stopWords.includes(word))
    .join(' ');
}

// محاسبه شباهت Cosine
function cosineSimilarity(str1, str2) {
  const tfidf = new TfIdf();
  tfidf.addDocument(cleanText(str1));
  tfidf.addDocument(cleanText(str2));

  const vector1 = [];
  const vector2 = [];

  tfidf.listTerms(0).forEach(term => {
    vector1.push(term.tfidf);
    vector2.push(tfidf.tfidf(term.term, 1));
  });

  let dotProduct = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < vector1.length; i++) {
    dotProduct += vector1[i] * vector2[i];
    magA += Math.pow(vector1[i], 2);
    magB += Math.pow(vector2[i], 2);
  }
  return dotProduct / (Math.sqrt(magA) * Math.sqrt(magB));
}

// هندلر API
module.exports = async (req, res) => {
  const userQuestion = (req.query.q || '').toLowerCase();
  if (!userQuestion) return res.status(400).json({ error: "سوال ارسال نشده است" });

  try {
    const data = await getSheetData();
    let bestAnswer = "";
    let bestScore = 0;

    for (let row of data) {
      const score = cosineSimilarity(userQuestion, row.سوال);
      if (score > bestScore) {
        bestScore = score;
        bestAnswer = row.پاسخ;
      }
    }

    if (bestScore < 0.3 || !bestAnswer) {
      await addUnansweredQuestion(userQuestion);
      return res.json({ answer: "متأسفم، پاسخ مناسب پیدا نشد.", score: bestScore });
    }

    return res.json({ answer: bestAnswer, score: bestScore });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "خطا در ارتباط با سیستم پاسخ‌گو" });
  }
};
