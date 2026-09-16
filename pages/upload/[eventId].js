import { useState } from 'react';
import db from '../../lib/db';

export async function getServerSideProps({ params }) {
  const event = db.prepare('SELECT id, person_name, message, status FROM events WHERE id = ?').get(params.eventId);
  if (!event) return { notFound: true };
  return { props: { event } };
}

export default function UploadPage({ event }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  if (event.status !== 'open') {
    return (
      <div className="upload-page">
        <h1>Submissions closed</h1>
        <p className="hint-text" style={{ textAlign: 'center', maxWidth: 420 }}>
          Thanks for wanting to contribute — the note collection for {event.person_name} has already closed.
        </p>
      </div>
    );
  }

  async function submit(e) {
    e.preventDefault();
    if (!file) {
      setError('Please attach a photo of your note first.');
      return;
    }
    setStatus('sending');
    setError('');

    const form = new FormData();
    form.append('image', file);
    form.append('name', name);
    form.append('email', email);

    const res = await fetch(`/api/upload/${event.id}`, { method: 'POST', body: form });
    if (res.ok) {
      setStatus('done');
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Something went wrong — please try again.');
      setStatus('error');
    }
  }

  if (status === 'done') {
    return (
      <div className="upload-page">
        <h1>Got it — thank you!</h1>
        <p className="hint-text" style={{ textAlign: 'center' }}>
          Your note has been added for {event.person_name}'s farewell card.
        </p>
      </div>
    );
  }

  return (
    <div className="upload-page">
      <h1>A note for {event.person_name}</h1>
      <p className="hint-text" style={{ whiteSpace: 'pre-wrap', textAlign: 'center', maxWidth: 440, marginBottom: 8 }}>
        {event.message}
      </p>
      <form onSubmit={submit} className="card">
        <div className="field">
          <label htmlFor="name">Your name (optional)</label>
          <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="email">Your email (optional)</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="image">Photo of your note</label>
          <input
            id="image"
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn" type="submit" disabled={status === 'sending'} style={{ width: '100%' }}>
          {status === 'sending' ? 'Uploading…' : 'Upload note'}
        </button>
      </form>
    </div>
  );
}
