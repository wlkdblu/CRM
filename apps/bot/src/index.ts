import 'dotenv/config';
import { Markup, Telegraf } from 'telegraf';

const token = process.env.BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN is required');

const apiBase = process.env.API_BASE_URL || 'http://localhost:4000';
const webAppUrl = process.env.WEB_APP_URL || 'http://localhost:5173';
const bot = new Telegraf(token);

async function login(ctx: any) {
  const from = ctx.from;
  const response = await fetch(`${apiBase}/auth/telegram`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ telegramId: String(from.id), username: from.username, name: [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || String(from.id) }) });
  return response.json() as Promise<{ token: string; user: { role: string } }>;
}

bot.start(async (ctx) => {
  const session = await login(ctx);
  await ctx.reply('CRM арбитражной команды. Лиды создаются только вручную обработчиком.', Markup.inlineKeyboard([
    [Markup.button.webApp('Открыть Mini App', `${webAppUrl}?token=${session.token}`)],
    [Markup.button.callback('Выйти на смену', 'shift_start'), Markup.button.callback('Закончить смену', 'shift_end')],
  ]));
});

bot.action('shift_start', async (ctx) => {
  const session = await login(ctx);
  await fetch(`${apiBase}/handler/shift/start`, { method: 'PATCH', headers: { authorization: `Bearer ${session.token}` } });
  await ctx.answerCbQuery('Смена начата');
  await ctx.reply('Вы на смене и видимы трафферам.');
});

bot.action('shift_end', async (ctx) => {
  const session = await login(ctx);
  await fetch(`${apiBase}/handler/shift/end`, { method: 'PATCH', headers: { authorization: `Bearer ${session.token}` } });
  await ctx.answerCbQuery('Смена завершена');
  await ctx.reply('Вы сняты со смены.');
});

bot.launch(() => console.log('Bot started'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
