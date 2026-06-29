import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

type Role = 'ADMIN' | 'TRAFFIC' | 'HANDLER';
type User = { id: string; name: string; username?: string; telegramId?: string; role: Role; trafficId?: string };
type Lead = { id: string; name: string; contact: string; trafficId: string; trafficType: string; status: string; comment?: string };
type Handler = User & { shift?: { isOnShift: boolean } };

const api = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
const statuses = ['new', 'in_progress', 'closed', 'rejected'];
const trafficTypes = ['fb', 'tiktok', 'google', 'native', 'push', 'seo', 'other'];

function tokenFromUrl() {
  return new URLSearchParams(location.search).get('token') || localStorage.getItem('token') || '';
}

function App() {
  const [token, setToken] = useState(tokenFromUrl());
  const [user, setUser] = useState<User | null>(null);
  const [handlers, setHandlers] = useState<Handler[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<any>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [error, setError] = useState('');

  const headers = useMemo(() => ({ 'content-type': 'application/json', authorization: `Bearer ${token}` }), [token]);

  async function request(path: string, options: RequestInit = {}) {
    const response = await fetch(`${api}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async function refresh() {
    if (!token) return;
    localStorage.setItem('token', token);
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
  }

  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [token]);

  return (
    <main>
      <h1>Arbitrage CRM</h1>
      {!token && <input placeholder="JWT token" onChange={(e) => setToken(e.target.value)} />}
      {error && <p className="error">{error}</p>}
      {user && <p>{user.name} · {user.role}{user.trafficId ? ` · traffic_id ${user.trafficId}` : ''}</p>}
      {user?.role !== 'HANDLER' && <TrafficPanel handlers={handlers} selectedTarget={selectedTarget} stats={stats} request={request} refresh={refresh} />}
      {user?.role === 'HANDLER' && <HandlerPanel request={request} refresh={refresh} leads={leads} stats={stats} />}
    </main>
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
