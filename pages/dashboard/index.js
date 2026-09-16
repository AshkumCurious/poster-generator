import { useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import { isSessionValid } from '../../lib/auth';
import db from '../../lib/db';

export async function getServerSideProps({ req }) {
  if (!isSessionValid(req.headers.cookie)) {
    return { redirect: { destination: '/login', permanent: false } };
  }
  const events = db.prepare('SELECT * FROM events ORDER BY created_at DESC').all();
  return { props: { events } };
}

export default function Dashboard({ events: initialEvents }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState(initialEvents);
  const [deletingId, setDeletingId] = useState('');

  async function deleteEvent(ev) {
    if (
      !confirm(
        `Delete the farewell for ${ev.person_name}? Photos in Drive will be moved to trash.`
      )
    ) {
      return;
    }
    setDeletingId(ev.id);
    const res = await fetch(`/api/events/${ev.id}`, { method: 'DELETE' });
    setDeletingId('');
    if (res.ok) {
      setEvents((list) => list.filter((item) => item.id !== ev.id));
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Could not delete this farewell.');
    }
  }

  return (
    <Layout>
      <div className="page-head">
        <div>
          <h2>Farewells</h2>
          <p className="hint-text">Create an event, collect notes, then build the poster.</p>
        </div>
        <button className="btn" onClick={() => setOpen(true)}>New farewell</button>
      </div>

      <div className="card">
        {events.length === 0 && <p className="hint-text">No farewells yet — create the first one.</p>}
        <ul className="event-list">
          {events.map((ev) => (
            <li key={ev.id} className="event-row">
              <div>
                <h3>{ev.person_name}</h3>
                <span className="hint-text">{ev.title}</span>
              </div>
              <div className="event-actions">
                <span className={`pill ${ev.status}`}>{ev.status}</span>
                <button className="btn secondary" onClick={() => router.push(`/dashboard/${ev.id}`)}>
                  Open
                </button>
                <button
                  className="btn danger-outline"
                  disabled={deletingId === ev.id}
                  onClick={() => deleteEvent(ev)}
                >
                  {deletingId === ev.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {open && <NewEventModal onClose={() => setOpen(false)} />}
    </Layout>
  );
}

function NewEventModal({ onClose }) {
  const router = useRouter();
  const [personName, setPersonName] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [emails, setEmails] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const contributorEmails = emails
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personName, title, message, contributorEmails }),
    });
    setLoading(false);

    if (res.ok) {
      const data = await res.json();
      router.push(`/dashboard/${data.eventId}`);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Something went wrong.');
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card" style={{ maxWidth: 520, width: '100%' }} onClick={(e) => e.stopPropagation()}>
        <h2>New farewell</h2>
        <p className="hint-text" style={{ marginBottom: 18 }}>Invite the team, then arrange notes into a poster.</p>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="personName">Who's leaving</label>
            <input id="personName" type="text" value={personName} onChange={(e) => setPersonName(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="title">Internal title</label>
            <input id="title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Priya's last week" required />
          </div>
          <div className="field">
            <label htmlFor="message">Invite message</label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Priya's last day is coming up — add a short note or memory for her farewell card."
              required
            />
          </div>
          <div className="field">
            <label htmlFor="emails">Contributor emails</label>
            <textarea
              id="emails"
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              placeholder="ashish@company.com&#10;sara@company.com"
              required
            />
          </div>
          {error && <p className="error-text">{error}</p>}
          <div className="event-actions" style={{ marginTop: 8 }}>
            <button className="btn" type="submit" disabled={loading}>
              {loading ? 'Creating…' : 'Create farewell'}
            </button>
            <button className="btn secondary" type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
