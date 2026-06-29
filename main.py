import json
import sqlite3
import time
import traceback
import urllib.parse
import urllib.request
from typing import Any

from config import ADMIN_IDS, BOT_TOKEN, DB_PATH

API_URL = f"https://api.telegram.org/bot{BOT_TOKEN}"
LEAD_STATUSES = ["new", "in_progress", "closed", "rejected"]
TRAFFIC_TYPES = ["fb", "tiktok", "google", "native", "push", "seo", "other"]
user_states: dict[int, dict[str, Any]] = {}


def db() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    with db() as con:
        con.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                telegram_id INTEGER NOT NULL UNIQUE,
                username TEXT,
                full_name TEXT NOT NULL,
                role TEXT,
                traffic_id TEXT UNIQUE,
                status TEXT NOT NULL DEFAULT 'pending',
                on_shift INTEGER NOT NULL DEFAULT 0,
                selected_handler_id INTEGER,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS leads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                contact TEXT NOT NULL,
                traffic_id TEXT NOT NULL,
                traffic_type TEXT NOT NULL,
                comment TEXT,
                status TEXT NOT NULL DEFAULT 'new',
                handler_user_id INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(handler_user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                actor_telegram_id INTEGER,
                action TEXT NOT NULL,
                details TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            """
        )


def api(method: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    data = urllib.parse.urlencode(payload or {}).encode()
    request = urllib.request.Request(f"{API_URL}/{method}", data=data, method="POST")
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode())


def send_message(chat_id: int, text: str, keyboard: list[list[dict[str, str]]] | None = None) -> None:
    payload: dict[str, Any] = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    if keyboard:
        payload["reply_markup"] = json.dumps({"inline_keyboard": keyboard})
    api("sendMessage", payload)


def answer_callback(callback_id: str, text: str = "") -> None:
    api("answerCallbackQuery", {"callback_query_id": callback_id, "text": text})


def button(text: str, data: str) -> dict[str, str]:
    return {"text": text, "callback_data": data}


def full_name(from_user: dict[str, Any]) -> str:
    parts = [from_user.get("first_name"), from_user.get("last_name")]
    return " ".join(part for part in parts if part) or from_user.get("username") or str(from_user["id"])


def audit(actor_telegram_id: int | None, action: str, details: dict[str, Any] | None = None) -> None:
    with db() as con:
        con.execute(
            "INSERT INTO audit_logs(actor_telegram_id, action, details) VALUES (?, ?, ?)",
            (actor_telegram_id, action, json.dumps(details or {}, ensure_ascii=False)),
        )


def get_user(telegram_id: int) -> sqlite3.Row | None:
    with db() as con:
        return con.execute("SELECT * FROM users WHERE telegram_id = ?", (telegram_id,)).fetchone()


def upsert_seen_user(from_user: dict[str, Any]) -> sqlite3.Row:
    telegram_id = int(from_user["id"])
    existing = get_user(telegram_id)
    role = "admin" if telegram_id in ADMIN_IDS else None
    status = "approved" if telegram_id in ADMIN_IDS else "pending"

    with db() as con:
        if existing:
            if telegram_id in ADMIN_IDS and existing["role"] != "admin":
                con.execute(
                    "UPDATE users SET username = ?, full_name = ?, role = 'admin', status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?",
                    (from_user.get("username"), full_name(from_user), telegram_id),
                )
            else:
                con.execute(
                    "UPDATE users SET username = ?, full_name = ?, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?",
                    (from_user.get("username"), full_name(from_user), telegram_id),
                )
        else:
            con.execute(
                "INSERT INTO users(telegram_id, username, full_name, role, status) VALUES (?, ?, ?, ?, ?)",
                (telegram_id, from_user.get("username"), full_name(from_user), role, status),
            )
    return get_user(telegram_id)  # type: ignore[return-value]


def require_approved(chat_id: int, user: sqlite3.Row | None) -> bool:
    if not user or user["status"] != "approved" or not user["role"]:
        send_message(chat_id, "Вы ещё не зарегистрированы или ждёте подтверждения администратора.")
        return False
    return True


def main_menu(chat_id: int, user: sqlite3.Row) -> None:
    if user["role"] == "admin":
        keyboard = [
            [button("📥 Заявки", "admin:requests"), button("📊 Статистика", "admin:stats")],
        ]
        send_message(chat_id, "Админ-панель", keyboard)
    elif user["role"] == "traffic":
        keyboard = [
            [button("👥 Обработчики на смене", "traffic:handlers")],
            [button("📊 Моя статистика", "traffic:stats")],
        ]
        send_message(chat_id, f"Панель траффера\ntraffic_id: <b>{user['traffic_id'] or 'не назначен'}</b>", keyboard)
    elif user["role"] == "handler":
        shift_text = "на смене" if user["on_shift"] else "не на смене"
        keyboard = [
            [button("🟢 Выйти на смену", "handler:shift_on"), button("🔴 Закончить смену", "handler:shift_off")],
            [button("➕ Добавить лида", "handler:add_lead"), button("📋 Мои лиды", "handler:leads")],
            [button("📊 Моя статистика", "handler:stats")],
        ]
        send_message(chat_id, f"Панель обработчика\nСтатус: <b>{shift_text}</b>", keyboard)


def handle_start(message: dict[str, Any]) -> None:
    chat_id = int(message["chat"]["id"])
    user = upsert_seen_user(message["from"])
    if user["status"] == "approved" and user["role"]:
        main_menu(chat_id, user)
        return
    keyboard = [[button("📝 Зарегистрироваться", "register")]]
    send_message(chat_id, "Вы не зарегистрированы в CRM. Нажмите кнопку ниже, чтобы подать заявку.", keyboard)


def handle_register(chat_id: int, from_user: dict[str, Any]) -> None:
    user = upsert_seen_user(from_user)
    with db() as con:
        con.execute("UPDATE users SET status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?", (from_user["id"],))
    audit(from_user["id"], "REGISTRATION_REQUESTED", {"user_id": user["id"]})
    send_message(chat_id, "Вы подали заявку на регистрацию. Подождите, с вами свяжутся.")
    for admin_id in ADMIN_IDS:
        send_message(
            admin_id,
            f"Новая заявка в CRM:\n{full_name(from_user)}\n@{from_user.get('username') or '-'}\ntelegram_id: {from_user['id']}",
            [[button("Открыть заявки", "admin:requests")]],
        )


def show_requests(chat_id: int) -> None:
    with db() as con:
        requests = con.execute("SELECT * FROM users WHERE status = 'pending' ORDER BY created_at DESC").fetchall()
    if not requests:
        send_message(chat_id, "Новых заявок нет.")
        return
    for request in requests:
        keyboard = [
            [button("Назначить handler", f"admin:approve:{request['id']}:handler")],
            [button("Назначить traffic", f"admin:approve:{request['id']}:traffic")],
        ]
        send_message(
            chat_id,
            f"Заявка #{request['id']}\n{request['full_name']}\n@{request['username'] or '-'}\ntelegram_id: {request['telegram_id']}",
            keyboard,
        )


def approve_user(chat_id: int, admin_id: int, user_id: int, role: str) -> None:
    if role == "traffic":
        user_states[chat_id] = {"action": "set_traffic_id", "user_id": user_id}
        send_message(chat_id, "Введите traffic_id для этого траффера одним сообщением.")
        return
    with db() as con:
        con.execute("UPDATE users SET role = ?, status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?", (role, user_id))
        approved = con.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    audit(admin_id, "USER_APPROVED", {"user_id": user_id, "role": role})
    send_message(chat_id, f"Пользователь назначен как {role}.")
    send_message(approved["telegram_id"], f"Ваша заявка одобрена. Роль: {role}. Отправьте /start.")


def set_traffic_id(chat_id: int, admin_id: int, text: str, state: dict[str, Any]) -> None:
    traffic_id = text.strip()
    with db() as con:
        con.execute(
            "UPDATE users SET role = 'traffic', traffic_id = ?, status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (traffic_id, state["user_id"]),
        )
        approved = con.execute("SELECT * FROM users WHERE id = ?", (state["user_id"],)).fetchone()
    user_states.pop(chat_id, None)
    audit(admin_id, "USER_APPROVED", {"user_id": state["user_id"], "role": "traffic", "traffic_id": traffic_id})
    audit(admin_id, "TRAFFIC_ID_ASSIGNED", {"user_id": state["user_id"], "traffic_id": traffic_id})
    send_message(chat_id, f"Траффер одобрен. traffic_id: {traffic_id}")
    send_message(approved["telegram_id"], f"Ваша заявка одобрена. Роль: traffic. traffic_id: {traffic_id}. Отправьте /start.")


def show_active_handlers(chat_id: int) -> None:
    with db() as con:
        handlers = con.execute("SELECT * FROM users WHERE role = 'handler' AND status = 'approved' AND on_shift = 1 ORDER BY full_name").fetchall()
    if not handlers:
        send_message(chat_id, "Сейчас нет обработчиков на смене.")
        return
    for handler in handlers:
        keyboard = [[button("Выбрать как цель", f"traffic:select:{handler['id']}")]]
        send_message(chat_id, f"{handler['full_name']}\n@{handler['username'] or '-'}", keyboard)


def select_handler(chat_id: int, traffic_user: sqlite3.Row, handler_id: int) -> None:
    with db() as con:
        handler = con.execute("SELECT * FROM users WHERE id = ? AND role = 'handler' AND on_shift = 1", (handler_id,)).fetchone()
        if not handler:
            send_message(chat_id, "Этот обработчик уже не на смене.")
            return
        con.execute("UPDATE users SET selected_handler_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (handler_id, traffic_user["id"]))
    audit(traffic_user["telegram_id"], "HANDLER_TARGET_SELECTED", {"handler_id": handler_id})
    send_message(chat_id, f"Выбрана цель трафика: {handler['full_name']} (@{handler['username'] or '-'})")


def traffic_stats(chat_id: int, user: sqlite3.Row) -> None:
    if not user["traffic_id"]:
        send_message(chat_id, "Админ ещё не назначил вам traffic_id.")
        return
    with db() as con:
        total = con.execute("SELECT COUNT(*) AS c FROM leads WHERE traffic_id = ?", (user["traffic_id"],)).fetchone()["c"]
        rows = con.execute(
            """
            SELECT users.full_name, COUNT(leads.id) AS count
            FROM leads
            JOIN users ON users.id = leads.handler_user_id
            WHERE leads.traffic_id = ?
            GROUP BY users.id
            ORDER BY count DESC
            """,
            (user["traffic_id"],),
        ).fetchall()
    lines = [f"Лидов по traffic_id <b>{user['traffic_id']}</b>: {total}"]
    lines += [f"{row['full_name']}: {row['count']}" for row in rows]
    send_message(chat_id, "\n".join(lines))


def handler_stats(chat_id: int, user: sqlite3.Row) -> None:
    with db() as con:
        total = con.execute("SELECT COUNT(*) AS c FROM leads WHERE handler_user_id = ?", (user["id"],)).fetchone()["c"]
        rows = con.execute(
            "SELECT traffic_id, COUNT(*) AS count FROM leads WHERE handler_user_id = ? GROUP BY traffic_id ORDER BY count DESC",
            (user["id"],),
        ).fetchall()
    lines = [f"Всего внесено лидов: {total}"]
    lines += [f"{row['traffic_id']}: {row['count']}" for row in rows]
    send_message(chat_id, "\n".join(lines))


def admin_stats(chat_id: int) -> None:
    with db() as con:
        users = con.execute("SELECT role, COUNT(*) AS count FROM users WHERE status = 'approved' GROUP BY role").fetchall()
        leads = con.execute("SELECT status, COUNT(*) AS count FROM leads GROUP BY status").fetchall()
    lines = ["Пользователи:"]
    lines += [f"{row['role']}: {row['count']}" for row in users]
    lines.append("\nЛиды:")
    lines += [f"{row['status']}: {row['count']}" for row in leads] or ["лидов нет"]
    send_message(chat_id, "\n".join(lines))


def set_shift(chat_id: int, user: sqlite3.Row, enabled: bool) -> None:
    with db() as con:
        con.execute("UPDATE users SET on_shift = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (1 if enabled else 0, user["id"]))
    audit(user["telegram_id"], "SHIFT_STARTED" if enabled else "SHIFT_ENDED")
    send_message(chat_id, "Вы вышли на смену." if enabled else "Вы завершили смену.")
    main_menu(chat_id, get_user(user["telegram_id"]))  # type: ignore[arg-type]


def start_add_lead(chat_id: int) -> None:
    user_states[chat_id] = {"action": "add_lead", "step": "name", "data": {}}
    send_message(chat_id, "Введите имя лида.")


def continue_add_lead(chat_id: int, user: sqlite3.Row, text: str, state: dict[str, Any]) -> None:
    step = state["step"]
    data = state["data"]
    if step == "name":
        data["name"] = text.strip()
        state["step"] = "contact"
        send_message(chat_id, "Введите контакт лида.")
    elif step == "contact":
        data["contact"] = text.strip()
        state["step"] = "traffic_id"
        send_message(chat_id, "Введите traffic_id. Это обязательное поле.")
    elif step == "traffic_id":
        data["traffic_id"] = text.strip()
        state["step"] = "traffic_type"
        keyboard = [[button(item, f"leadtype:{item}")] for item in TRAFFIC_TYPES]
        send_message(chat_id, "Выберите traffic_type.", keyboard)
    elif step == "comment":
        data["comment"] = "" if text.strip() == "-" else text.strip()
        save_lead(chat_id, user, data)


def set_lead_type(chat_id: int, traffic_type: str) -> None:
    state = user_states.get(chat_id)
    if not state or state.get("action") != "add_lead":
        return
    state["data"]["traffic_type"] = traffic_type
    state["step"] = "comment"
    send_message(chat_id, "Введите комментарий или '-' если комментария нет.")


def save_lead(chat_id: int, user: sqlite3.Row, data: dict[str, str]) -> None:
    with db() as con:
        cursor = con.execute(
            """
            INSERT INTO leads(name, contact, traffic_id, traffic_type, comment, handler_user_id)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (data["name"], data["contact"], data["traffic_id"], data["traffic_type"], data.get("comment"), user["id"]),
        )
    user_states.pop(chat_id, None)
    audit(user["telegram_id"], "LEAD_CREATED", {"lead_id": cursor.lastrowid, "traffic_id": data["traffic_id"]})
    send_message(chat_id, "Лид сохранён в CRM.")


def show_handler_leads(chat_id: int, user: sqlite3.Row) -> None:
    with db() as con:
        leads = con.execute("SELECT * FROM leads WHERE handler_user_id = ? ORDER BY created_at DESC LIMIT 20", (user["id"],)).fetchall()
    if not leads:
        send_message(chat_id, "У вас пока нет лидов.")
        return
    for lead in leads:
        keyboard = [[button(status, f"leadstatus:{lead['id']}:{status}")] for status in LEAD_STATUSES if status != lead["status"]]
        send_message(
            chat_id,
            f"Лид #{lead['id']}\n{lead['name']}\n{lead['contact']}\ntraffic_id: {lead['traffic_id']}\ntype: {lead['traffic_type']}\nstatus: {lead['status']}",
            keyboard,
        )


def change_lead_status(chat_id: int, user: sqlite3.Row, lead_id: int, status: str) -> None:
    with db() as con:
        lead = con.execute("SELECT * FROM leads WHERE id = ?", (lead_id,)).fetchone()
        if not lead or (user["role"] == "handler" and lead["handler_user_id"] != user["id"]):
            send_message(chat_id, "Лид не найден или нет доступа.")
            return
        con.execute("UPDATE leads SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (status, lead_id))
    audit(user["telegram_id"], "LEAD_STATUS_CHANGED", {"lead_id": lead_id, "from": lead["status"], "to": status})
    send_message(chat_id, f"Статус лида #{lead_id} изменён на {status}.")


def handle_text(message: dict[str, Any]) -> None:
    chat_id = int(message["chat"]["id"])
    text = message.get("text", "")
    if text == "/start":
        handle_start(message)
        return

    user = get_user(int(message["from"]["id"]))
    state = user_states.get(chat_id)
    if state and state.get("action") == "set_traffic_id":
        set_traffic_id(chat_id, int(message["from"]["id"]), text, state)
        return
    if state and state.get("action") == "add_lead" and user and user["role"] == "handler":
        continue_add_lead(chat_id, user, text, state)
        return

    if require_approved(chat_id, user):
        main_menu(chat_id, user)  # type: ignore[arg-type]


def handle_callback(callback: dict[str, Any]) -> None:
    callback_id = callback["id"]
    data = callback["data"]
    message = callback["message"]
    chat_id = int(message["chat"]["id"])
    from_user = callback["from"]
    telegram_id = int(from_user["id"])
    answer_callback(callback_id)

    if data == "register":
        handle_register(chat_id, from_user)
        return

    user = get_user(telegram_id)
    if not require_approved(chat_id, user):
        return

    if data == "admin:requests" and user["role"] == "admin":
        show_requests(chat_id)
    elif data == "admin:stats" and user["role"] == "admin":
        admin_stats(chat_id)
    elif data.startswith("admin:approve:") and user["role"] == "admin":
        _, _, user_id, role = data.split(":")
        approve_user(chat_id, telegram_id, int(user_id), role)
    elif data == "traffic:handlers" and user["role"] == "traffic":
        show_active_handlers(chat_id)
    elif data.startswith("traffic:select:") and user["role"] == "traffic":
        select_handler(chat_id, user, int(data.split(":")[2]))
    elif data == "traffic:stats" and user["role"] == "traffic":
        traffic_stats(chat_id, user)
    elif data == "handler:shift_on" and user["role"] == "handler":
        set_shift(chat_id, user, True)
    elif data == "handler:shift_off" and user["role"] == "handler":
        set_shift(chat_id, user, False)
    elif data == "handler:add_lead" and user["role"] == "handler":
        start_add_lead(chat_id)
    elif data == "handler:leads" and user["role"] == "handler":
        show_handler_leads(chat_id, user)
    elif data == "handler:stats" and user["role"] == "handler":
        handler_stats(chat_id, user)
    elif data.startswith("leadtype:") and user["role"] == "handler":
        set_lead_type(chat_id, data.split(":", 1)[1])
    elif data.startswith("leadstatus:") and user["role"] in {"handler", "admin"}:
        _, lead_id, status = data.split(":")
        change_lead_status(chat_id, user, int(lead_id), status)
    else:
        send_message(chat_id, "Команда недоступна для вашей роли.")


def poll() -> None:
    offset = 0
    print("Bot is running. Press Ctrl+C to stop.")
    while True:
        try:
            response = api("getUpdates", {"offset": offset, "timeout": 50})
            for update in response.get("result", []):
                offset = update["update_id"] + 1
                if "message" in update:
                    handle_text(update["message"])
                elif "callback_query" in update:
                    handle_callback(update["callback_query"])
        except KeyboardInterrupt:
            print("Stopped")
            break
        except Exception:
            traceback.print_exc()
            time.sleep(3)


if __name__ == "__main__":
    if not BOT_TOKEN or BOT_TOKEN == "PASTE_TELEGRAM_BOT_TOKEN_HERE":
        raise RuntimeError("Open config.py and put your Telegram bot token into BOT_TOKEN")
    init_db()
    poll()
