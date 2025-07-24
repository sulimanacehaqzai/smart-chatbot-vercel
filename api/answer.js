// pages/api/answer.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'فقط POST مجاز است' });
  }

  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'پیام ارسال نشده است' });
  }

  // اینجا می‌توانی به هوش مصنوعی وصل شوی یا جواب بسازی
  // برای نمونه یک جواب ثابت می‌دهیم:
  const reply = `پیام شما دریافت شد: "${message}" - این پاسخ آزمایشی است.`;

  return res.status(200).json({ reply });
}
