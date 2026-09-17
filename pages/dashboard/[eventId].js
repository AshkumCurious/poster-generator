import { useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import { isSessionValid } from '../../lib/auth';
import { getEvent, listContributors } from '../../lib/db';

export async function getServerSideProps({ req, params }) {
  if (!isSessionValid(req.headers.cookie)) {
    return { redirect: { destination: '/login', permanent: false } };
  }
  const event = await getEvent(params.eventId);
  if (!event) return { notFound: true };

  const contributors = await listContributors(params.eventId);

  return { props: { event, contributors } };
}

export default function EventDetail({ event, contributors: initialContributors }) {
  const router = useRouter();
  const [contributors, setContributors] = useState(initialContributors);
  const [status, setStatus] = useState(event.status);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);
  const [addingEmails, setAddingEmails] = useState(false);
  const [newEmails, setNewEmails] = useState('');

  const uploadUrl = typeof window !== 'undefined' ? `${window.location.origin}/upload/${event.id}` : '';

  async function sendInvites() {
    setBusy(true);
    setNote('');
    const res = await fetch(`/api/events/${event.id}/send-invites`, { method: 'POST' });
    const data = await res.json();
    setBusy(false);
    if (res.ok) {
      const failedDetail = (data.failed || [])
        .map((f) => `${f.email}: ${f.error?.message || 'failed'}`)
        .join(' · ');
      const from = event.owner_email ? ` from ${event.owner_email}` : '';
      setNote(
        `Sent ${data.sent} of ${contributors.length}${from}. Check Sent and the recipient's Spam.` +
          (failedDetail ? ` ${failedDetail}` : '')
      );
      const refreshed = await fetch(`/api/events/${event.id}`).then((r) => r.json());
      setContributors(refreshed.contributors);
    } else {
      setNote(data.error || 'Could not send invites.');
    }
  }

  async function closeSubmissions() {
    if (!confirm('Close submissions? The upload link will stop accepting new photos.')) return;
    setBusy(true);
    const res = await fetch(`/api/events/${event.id}/close`, { method: 'POST' });
    setBusy(false);
    if (res.ok) setStatus('closed');
    else setNote('Could not close submissions.');
  }

  async function deleteEvent() {
    if (
      !confirm(
        `Delete the farewell for ${event.person_name}? Photos in Drive will be moved to trash.`
      )
    ) {
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/events/${event.id}`, { method: 'DELETE' });
    if (res.ok) {
      router.push('/dashboard');
      return;
    }
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    setNote(data.error || 'Could not delete this farewell.');
  }

  async function addEmails(e) {
    e.preventDefault();
    setBusy(true);
    setNote('');
    const emails = newEmails
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const res = await fetch(`/api/events/${event.id}/contributors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emails }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (data.contributors) setContributors(data.contributors);

    if (!res.ok) {
      setNote(data.error || 'Could not add emails.');
      return;
    }
    setNewEmails('');
    setAddingEmails(false);

    const parts = [];
    if (data.added) parts.push(`Added ${data.added}`);
    if (data.sent) parts.push(`sent ${data.sent} invite${data.sent === 1 ? '' : 's'}${data.from ? ` from ${data.from}` : ''}`);
    if (data.skipped) parts.push(`${data.skipped} already on the list`);
    const failedDetail = (data.failed || [])
      .map((f) => `${f.email}: ${f.error?.message || 'failed'}`)
      .join(' · ');
    setNote((parts.join(' · ') || 'No new emails.') + (failedDetail ? `. ${failedDetail}` : ''));
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(uploadUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setNote('Could not copy — select the link and copy it yourself.');
    }
  }

  return (
    <Layout>
      <button className="btn secondary" onClick={() => router.push('/dashboard')} style={{ marginBottom: 22 }}>
        ← All farewells
      </button>

      <div className="page-head">
        <div>
          <h2>{event.person_name}</h2>
          <p className="hint-text">{event.title}</p>
        </div>
        <div className="event-actions">
          <span className={`pill ${status}`}>{status}</span>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="event-actions" style={{ marginBottom: 16 }}>
          <button className="btn" onClick={sendInvites} disabled={busy || status !== 'open'}>
            Send invites
          </button>
          <button className="btn danger" onClick={closeSubmissions} disabled={busy || status !== 'open'}>
            Close submissions
          </button>
          <button className="btn secondary" onClick={() => router.push(`/poster/${event.id}`)}>
            Open poster builder
          </button>
          <button className="btn danger-outline" onClick={deleteEvent} disabled={busy}>
            Delete farewell
          </button>
        </div>
        {note && <p className="hint-text" style={{ marginBottom: 14 }}>{note}</p>}
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Upload link</label>
          <div className="copy-row">
            <input type="text" readOnly value={uploadUrl} onFocus={(e) => e.target.select()} />
            <button className="btn secondary" type="button" onClick={copyLink}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="page-head" style={{ marginBottom: 12 }}>
          <h3 style={{ fontSize: '1.05rem', margin: 0 }}>Contributors</h3>
          {status === 'open' && (
            <button
              className="btn secondary"
              type="button"
              disabled={busy}
              onClick={() => {
                setAddingEmails((open) => !open);
                setNote('');
              }}
            >
              {addingEmails ? 'Cancel' : 'Add emails'}
            </button>
          )}
        </div>
        {addingEmails && (
          <form onSubmit={addEmails} style={{ marginBottom: 16 }}>
            <div className="field">
              <label htmlFor="more-emails">People you forgot</label>
              <textarea
                id="more-emails"
                value={newEmails}
                onChange={(e) => setNewEmails(e.target.value)}
                placeholder="one per line, or comma-separated"
                required
              />
            </div>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Adding…' : 'Add and send invite'}
            </button>
          </form>
        )}
        {note && (
          <p className="hint-text" style={{ marginBottom: 14 }}>{note}</p>
        )}
        <ul className="contributor-list">
          {contributors.map((c) => (
            <li key={c.email}>
              <span>{c.email}</span>
              <span className="hint-text">
                {c.uploaded_at ? 'Uploaded' : c.invited_at ? 'Invited' : 'Not invited'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Layout>
  );
}
