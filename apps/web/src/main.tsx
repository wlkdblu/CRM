import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

declare global {
  interface Window { Telegram?: { WebApp?: { ready: () => void; initDataUnsafe?: { user?: TelegramUser } } } }
}

type Role = 'ADMIN' | 'TRAFFIC' | 'HANDLER';
type TelegramUser = { id: number; username?: string; first_name?: string; last_name?: string };
type User = { id: string; name: string; username?: string; telegramId?: string; role?: Role; trafficId?: string; registrationStatus?: string };
type Lead = { id: string; name: string; contact: string; trafficId: string; trafficType: string; status: string; comment?: string };
type Handler = User & { shift?: { isOnShift: boolean } };

const api = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
const statuses = ['new', 'in_progress', 'closed', 'rejected'];
const trafficTypes = ['fb', 'tiktok', 'google', 'native', 'push', 'seo', 'other'];
const roles: Role[] = ['HANDLER', 'TRAFFIC', 'ADMIN'];

function getTelegramUser(): TelegramUser | null {
  return window.Telegram?.WebApp?.initDataUnsafe?.user || null;
}

function telegramPayload() {
  const tgUser = getTelegramUser();
  if (tgUser) {
    return {
      telegramId: String(tgUser.id),
      username: tgUser.username,
      name: [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || tgUser.username || String(tgUser.id),
    };
  }

  return {
    telegramId: localStorage.getItem('devTelegramId') || '1001',
    username: localStorage.getItem('devUsername') || 'local_user',
    name: localStorage.getItem('devName') || 'Local User',
  };
}

function tokenFromUrl() {
  return new URLSearchParams(location.search).get('token') || localStorage.getItem('token') || '';
}

function App() {
  const [token, setToken] = useState(tokenFromUrl());
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [handlers, setHandlers] = useState<Handler[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<any>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const headers = useMemo(() => ({ 'content-type': 'application/json', authorization: `Bearer ${token}` }), [token]);

  async function anonymousRequest(path: string, body: unknown) {
    const response = await fetch(`${api}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async function request(path: string, options: RequestInit = {}) {
    const response = await fetch(`${api}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async function checkAuth() {
    setError('');
    const auth = await anonymousRequest('/auth/telegram', telegramPayload());
    if (!auth.registered) {
      setToken('');
      localStorage.removeItem('token');
      setUser(auth.user);
      setAuthChecked(true);
      return;
    }

    localStorage.setItem('token', auth.token);
    setToken(auth.token);
    setUser(auth.user);
    setAuthChecked(true);
  }

  async function submitRegistration() {
    const response = await anonymousRequest('/auth/register-request', telegramPayload());
    setMessage(response.message);
    setUser(response.user);
  }

  async function refresh() {
    if (!token) return;
    const me = await request('/me');
    setUser(me);

    if (me.role !== 'HANDLER') setHandlers(await request('/handlers/active'));
    if (me.role === 'TRAFFIC') {
      setStats(await request('/traffic/stats'));
      setSelectedTarget(await request('/traffic/target'));
    }
    if (me.role === 'HANDLER') {
      setLeads(await request('/handler/leads'));
      setStats(await request('/handler/stats'));
    }
    if (me.role === 'ADMIN') {
      setPendingUsers(await request('/admin/users?status=PENDING'));
    }
  }

  useEffect(() => {
    window.Telegram?.WebApp?.ready();
    checkAuth().catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [token]);

  if (!authChecked) return <main><h1>Arbitrage CRM</h1><p>Проверяем регистрацию...</p></main>;

  if (!token) {
    return (
      <main>
        <h1>Arbitrage CRM</h1>
        {error && <p className="error">{error}</p>}
        {message ? <p className="success">{message}</p> : <button onClick={submitRegistration}>Зарегистрироваться</button>}
        <p>После назначения роли администратором снова откройте Mini App из бота.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Arbitrage CRM</h1>
      {error && <p className="error">{error}</p>}
      {user && <p>{user.name} · {user.role}{user.trafficId ? ` · traffic_id ${user.trafficId}` : ''}</p>}
      {user?.role === 'ADMIN' && <AdminPanel pendingUsers={pendingUsers} request={request} refresh={refresh} />}
      {user?.role !== 'HANDLER' && <TrafficPanel handlers={handlers} selectedTarget={selectedTarget} stats={stats} request={request} refresh={refresh} />}
      {user?.role === 'HANDLER' && <HandlerPanel request={request} refresh={refresh} leads={leads} stats={stats} />}
    </main>
  );
}

function AdminPanel({ pendingUsers, request, refresh }: any) {
  const [forms, setForms] = useState<Record<string, { role: Role; trafficId: string }>>({});

  async function approve(userId: string) {
    const form = forms[userId] || { role: 'HANDLER', trafficId: '' };
    await request(`/admin/users/${userId}/approve`, {
      method: 'PATCH',
      body: JSON.stringify({ role: form.role, trafficId: form.trafficId || undefined }),
    });
    await refresh();
  }

  return (
    <section>
      <h2>Заявки на регистрацию</h2>
      {pendingUsers.length === 0 && <p>Новых заявок нет.</p>}
      {pendingUsers.map((pending: User) => {
        const form = forms[pending.id] || { role: 'HANDLER', trafficId: '' };
        return (
          <article key={pending.id}>
            <b>{pending.name}</b>
            <p>@{pending.username || '-'} · telegram_id {pending.telegramId}</p>
            <select value={form.role} onChange={(e) => setForms({ ...forms, [pending.id]: { ...form, role: e.target.value as Role } })}>
              {roles.map((role) => <option key={role}>{role}</option>)}
            </select>
            <input placeholder="traffic_id для TRAFFIC" value={form.trafficId} onChange={(e) => setForms({ ...forms, [pending.id]: { ...form, trafficId: e.target.value } })} />
            <button onClick={() => approve(pending.id)}>Назначить роль</button>
          </article>
        );
      })}
    </section>
  );
}

function TrafficPanel({ handlers, selectedTarget, stats, request, refresh }: any) {
  async function selectHandler(handlerId: string) {
    await request('/traffic/target', { method: 'PATCH', body: JSON.stringify({ handlerId }) });
    await refresh();
  }

  return (
    <section>
      <h2>Активные обработчики</h2>
      <p>Выберите одного обработчика как цель трафика. Лиды всё равно вносит только обработчик вручную.</p>
      <div className="grid">
        {handlers.map((handler: Handler) => (
          <article key={handler.id}>
            <b>{handler.name}</b>
            <p>@{handler.username || handler.telegramId}</p>
            <button onClick={() => selectHandler(handler.id)}>Выбрать цель</button>
            {selectedTarget?.handlerId === handler.id && <span className="badge">текущая цель</span>}
            {handler.username && <a href={`https://t.me/${handler.username}`} target="_blank">Открыть Telegram</a>}
          </article>
        ))}
      </div>
      <h2>Моя статистика</h2>
      <pre>{JSON.stringify(stats, null, 2)}</pre>
    </section>
  );
}

function HandlerPanel({ request, refresh, leads, stats }: any) {
  const [form, setForm] = useState({ name: '', contact: '', trafficId: '', trafficType: 'fb', comment: '' });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await request('/lead/manual', { method: 'POST', body: JSON.stringify(form) });
    setForm({ ...form, name: '', contact: '', comment: '' });
    await refresh();
  }

  return (
    <section>
      <div className="actions">
        <button onClick={() => request('/handler/shift/start', { method: 'PATCH' }).then(refresh)}>Выйти на смену</button>
        <button onClick={() => request('/handler/shift/end', { method: 'PATCH' }).then(refresh)}>Закончить смену</button>
      </div>
      <h2>Добавить лида вручную</h2>
      <form onSubmit={submit}>
        {['name', 'contact', 'trafficId', 'comment'].map((key) => (
          <input key={key} required={key !== 'comment'} placeholder={key} value={(form as any)[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
        ))}
        <select value={form.trafficType} onChange={(e) => setForm({ ...form, trafficType: e.target.value })}>
          {trafficTypes.map((type) => <option key={type}>{type}</option>)}
        </select>
        <button>Сохранить лида</button>
      </form>
      <h2>Мои лиды</h2>
      <table>
        <tbody>
          {leads.map((lead: Lead) => (
            <tr key={lead.id}>
              <td>{lead.name}</td>
              <td>{lead.contact}</td>
              <td>{lead.trafficId}</td>
              <td>{lead.trafficType}</td>
              <td>
                <select value={lead.status} onChange={(e) => request(`/lead/${lead.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: e.target.value }) }).then(refresh)}>
                  {statuses.map((status) => <option key={status}>{status}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Статистика</h2>
      <pre>{JSON.stringify(stats, null, 2)}</pre>
    </section>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
