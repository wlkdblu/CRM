import { adminTelegramIds } from './config.js';

export async function notifyAdmins(message: string) {
  const token = process.env.BOT_TOKEN;
  if (!token) return;

  await Promise.allSettled(
    adminTelegramIds().map((chatId) =>
      fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: message }),
      }),
    ),
  );
}
