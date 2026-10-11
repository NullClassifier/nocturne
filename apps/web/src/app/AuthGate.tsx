import { useEffect, useState, type ReactNode } from 'react';
import { useApi } from '@/lib/api';
import { useSession } from '@/store/session';
import { Spinner } from '@/components/ui/primitives';
import { BiosLogin } from './BiosLogin';

export function AuthGate({ children }: { children: ReactNode }) {
  const api = useApi();
  const authed = useSession((s) => s.authed);
  const markAuthed = useSession((s) => s.signIn);
  const signOut = useSession((s) => s.signOut);

  const [hint, setHint] = useState<string | undefined>();
  const [checking, setChecking] = useState(true);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.auth
      .firstRun()
      .then((r) => setHint(r.adminPasswordHint))
      .catch(() => undefined);
  }, [api]);

  // Server cookie is the source of truth: clear a stale client flag so login
  // shows instead of a dashboard that 401s. ?demo=1 skips this for demos.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('demo') === '1') {
      markAuthed();
      setChecking(false);
      return;
    }
    if (!useSession.getState().authed) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    api.auth
      .me()
      .then(() => !cancelled && markAuthed())
      .catch(() => !cancelled && signOut())
      .finally(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
  }, [api, markAuthed, signOut]);

  const signIn = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await api.auth.login(username, password);
      markAuthed();
    } catch {
      setError('Invalid credentials.');
    } finally {
      setBusy(false);
    }
  };

  if (checking) {
    return (
      <div
        className="grid h-screen w-screen place-items-center"
        style={{ background: 'var(--color-bg)' }}
      >
        <div className="flex items-center gap-3 font-mono text-[12px] text-accent2">
          <Spinner />
          <span className="tracking-[0.18em]">NOCTURNE POST…</span>
        </div>
      </div>
    );
  }

  if (authed) return <>{children}</>;

  return (
    <BiosLogin
      hint={hint}
      error={error}
      busy={busy}
      username={username}
      password={password}
      onUsername={setUsername}
      onPassword={setPassword}
      onSubmit={() => void signIn()}
    />
  );
}
