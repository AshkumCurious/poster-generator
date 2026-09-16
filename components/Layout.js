import Link from 'next/link';
import { useRouter } from 'next/router';

export default function Layout({ children, fluid = false }) {
  const router = useRouter();

  async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <div className={`app-shell${fluid ? ' fluid' : ''}`}>
      <header className="top-bar">
        <h1>
          <Link href="/dashboard">
            <span className="mark">Farewell</span> Notes
          </Link>
        </h1>
        <button type="button" onClick={logout}>Log out</button>
      </header>
      <div className="container">{children}</div>
    </div>
  );
}
