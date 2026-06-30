# ВСТАВЬТЕ СЮДА ТОКЕН БОТА И TELEGRAM ID АДМИНОВ
# BOT_TOKEN берётся у @BotFather
BOT_TOKEN = "PASTE_TELEGRAM_BOT_TOKEN_HERE"

# Узнать свой numeric Telegram ID можно через @userinfobot
ADMIN_IDS = [123456789]

DB_PATH = "crm.sqlite3"

# Мини-приложение запускается встроенным web-сервером из main.py.
# Для локального теста откройте http://localhost:8080 в браузере.
# Для Telegram WebApp нужен HTTPS-туннель; укажите его здесь.
WEB_APP_URL = "http://localhost:8080"
WEB_PORT = 8080

# Пул офферов: key -> название и выплата с оффера.
OFFERS = {
    "crypto_basic": {"title": "Crypto Basic", "payout": 120.0},
    "dating_trial": {"title": "Dating Trial", "payout": 45.0},
    "nutra_health": {"title": "Nutra Health", "payout": 80.0},
}
