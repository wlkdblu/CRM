import 'dotenv/config';
import { Markup, Telegraf } from 'telegraf';

const token = process.env.BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN is required. Put it into .env as BOT_TOKEN=...');

const apiBase = process.env.API_BASE_URL || 'http://localhost:4000';
const webAppUrl = process.env.WEB_APP_URL || 'http://localhost:5173';
const bot = new Telegraf(token);

type AuthResponse = { registered: boolean; token?: string; status?: string; user?: { role?: string } };

function telegramPayload(ctx: any) {
  const from = ctx.from;
  return {
    telegramId: String(from.id),
    username: from.username,
    name: [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || String(from.id),
  };
}

async function login(ctx: any) {
  const response = await fetch(`${apiBase}/auth/telegram`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(telegramPayload(ctx)),
  });
  return response.json() as Promise<AuthResponse>;
}

bot.start(async (ctx) => {
  const session = await login(ctx);
  const url = session.registered && session.token ? `${webAppUrl}?token=${session.token}` : webAppUrl;

  await ctx.reply(
    'CRM арбитражной команды. Откройте Mini App: он проверит регистрацию и покажет нужный дашборд.',
    Markup.inlineKeyboard([[Markup.button.webApp('Открыть CRM Mini App', url)]]),
  );
});

bot.action('shift_start', async (ctx) => {
  const session = await login(ctx);
  if (!session.registered || !session.token) {
    await ctx.answerCbQuery('Сначала подайте заявку и дождитесь назначения роли');
    return;
  }
  await fetch(`${apiBase}/handler/shift/start`, { method: 'PATCH', headers: { authorization: `Bearer ${session.token}` } });
  await ctx.answerCbQuery('Смена начата');
  await ctx.reply('Вы на смене и видимы трафферам.');
});

bot.action('shift_end', async (ctx) => {
  const session = await login(ctx);
  if (!session.registered || !session.token) {
    await ctx.answerCbQuery('Сначала подайте заявку и дождитесь назначения роли');
    return;
  }
  await fetch(`${apiBase}/handler/shift/end`, { method: 'PATCH', headers: { authorization: `Bearer ${session.token}` } });
  await ctx.answerCbQuery('Смена завершена');
  await ctx.reply('Вы сняты со смены.');
});

bot.launch(() => console.log('Bot started'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
