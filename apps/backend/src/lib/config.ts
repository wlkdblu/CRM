export function adminTelegramIds() {
  return (process.env.ADMIN_TELEGRAM_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

export function isBootstrapAdmin(telegramId: string) {
  return adminTelegramIds().includes(telegramId);
}
