const express = require('express');
const path = require('path');
const chatbot = require('./chatbot');

const app = express();
const PORT = 3000;

// سرو کردن فایل‌های استاتیک (index.html و ...)
app.use(express.static(path.join(__dirname)));

// مسیر API برای دریافت سوال و پاسخ
app.get('/api/chatbot', chatbot);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
