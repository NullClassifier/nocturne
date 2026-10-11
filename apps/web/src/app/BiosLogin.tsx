import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Spinner } from '@/components/ui/primitives';

/* ------------------------------------------------------------------ *
 * BIOS-style boot login. A POST sequence streams in line by line, an
 * animated ASCII duck bobs in the water, then the operator sign-in
 * panel reveals. Uses the Nocturne design tokens throughout so it reads
 * as one system with the rest of the console.
 * ------------------------------------------------------------------ */

// Animated ASCII duck. Each frame shifts the eye-blink and the water
// ripple so it reads as "alive" when cycled.
const DUCK_FRAMES = [
  String.raw`
        __
      >(o )___
       (  ._> )
   ~~~~~\_____/~~~~~
  ~~~~~~~~~~~~~~~~~~~`,
  String.raw`
        __
      >(o )___
       (  ._> )
  ~~~~~~\_____/~~~~
   ~~~~~~~~~~~~~~~~~`,
  String.raw`
        __
      >(- )___
       (  ._> )
   ~~~~~\_____/~~~~~
  ~~~~~~~~~~~~~~~~~~~`,
  String.raw`
        __
      >(o )___
       (  ._> )
  ~~~~~~\_____/~~~~
    ~~~~~~~~~~~~~~~~`,
];

type Line = { text: string; tone?: 'ok' | 'accent' | 'muted' | 'warn' };

const BOOT_LINES: Line[] = [
  { text: 'NOCTURNE BIOS v4.8 — Operator Firmware', tone: 'accent' },
  { text: '(c) team-netrunners · authorized use only', tone: 'muted' },
  { text: '' },
  { text: 'POST .................................. OK', tone: 'ok' },
  { text: 'CPU  : llm-orchestrator  x1 .......... OK', tone: 'ok' },
  { text: 'MEM  : context window 32768K ......... OK', tone: 'ok' },
  { text: 'MODEL: gemma-local @ remote api ...... OK', tone: 'ok' },
  { text: 'EXEC : docker / kali backend ......... OK', tone: 'ok' },
  { text: 'STORE: object store (s3) ............. OK', tone: 'ok' },
  { text: 'BUS  : redis pub/sub ................. OK', tone: 'ok' },
  { text: 'AGENT: plan/act graph ................ OK', tone: 'ok' },
  { text: '' },
  { text: 'POST complete. Authentication required.', tone: 'accent' },
];

const TONE: Record<NonNullable<Line['tone']>, string> = {
  ok: 'var(--color-live)',
  accent: 'var(--color-accent2)',
  muted: 'var(--color-faint)',
  warn: 'var(--color-high)',
};

const prefersReduced = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export type BiosLoginProps = {
  hint?: string;
  error?: string;
  busy: boolean;
  username: string;
  password: string;
  onUsername: (v: string) => void;
  onPassword: (v: string) => void;
  onSubmit: () => void;
};

export function BiosLogin(props: BiosLoginProps) {
  const { hint, error, busy, username, password, onUsername, onPassword, onSubmit } = props;

  const reduced = useMemo(prefersReduced, []);
  const [revealed, setRevealed] = useState(reduced ? BOOT_LINES.length : 0);
  const [frame, setFrame] = useState(0);
  const booted = revealed >= BOOT_LINES.length;

  // Stream the POST lines in.
  useEffect(() => {
    if (booted) return;
    const t = setTimeout(() => setRevealed((n) => n + 1), revealed === 0 ? 220 : 130);
    return () => clearTimeout(t);
  }, [revealed, booted]);

  // Cycle the duck frames.
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % DUCK_FRAMES.length), 240);
    return () => clearInterval(id);
  }, [reduced]);

  // Any key fast-forwards the boot.
  useEffect(() => {
    if (booted) return;
    const skip = () => setRevealed(BOOT_LINES.length);
    window.addEventListener('keydown', skip, { once: true });
    return () => window.removeEventListener('keydown', skip);
  }, [booted]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !busy) onSubmit();
  };

  return (
    <div
      className="bios-root grid h-screen w-screen place-items-center overflow-hidden p-4"
      style={{
        background:
          'radial-gradient(60% 55% at 50% 0%, color-mix(in srgb, var(--color-accent) 16%, transparent), transparent 70%),' +
          'radial-gradient(45% 40% at 85% 100%, color-mix(in srgb, var(--color-accent2) 12%, transparent), transparent 70%),' +
          'var(--color-bg)',
      }}
    >
      <div className="bios-scan pointer-events-none fixed inset-0" aria-hidden />

      <div
        className="relative grid w-full max-w-[860px] gap-0 overflow-hidden rounded-[var(--radius)] border bg-panel md:grid-cols-[1fr_360px]"
        style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow)' }}
      >
        {/* Left: BIOS console + duck */}
        <div
          className="flex flex-col gap-3 border-b p-6 md:border-b-0 md:border-r"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}
        >
          <pre
            aria-hidden
            className="select-none font-mono text-[11px] leading-[1.15] text-accent2"
            style={{ textShadow: '0 0 14px color-mix(in srgb, var(--color-accent2) 45%, transparent)' }}
          >
            {DUCK_FRAMES[frame]}
          </pre>

          <div className="font-mono text-[12px] leading-[1.5]">
            {BOOT_LINES.slice(0, revealed).map((l, i) => (
              <div key={i} style={{ color: l.tone ? TONE[l.tone] : 'var(--color-muted)' }}>
                {l.text || ' '}
              </div>
            ))}
            {!booted ? <span className="rc-caret" style={{ color: 'var(--color-accent)' }}>█</span> : null}
          </div>
        </div>

        {/* Right: sign-in */}
        <div className="flex flex-col gap-4 p-6" style={{ background: 'var(--color-panel)' }}>
          <div className="flex items-center gap-3">
            {/* Real Nocturne crescent mark (matches favicon / docs logo). The
                cutout circle is filled with the panel color so the crescent
                reads correctly in both light and dark themes. */}
            <svg
              viewBox="0 0 32 32"
              className="h-9 w-9 flex-none"
              role="img"
              aria-label="Nocturne"
              style={{ filter: 'drop-shadow(0 0 10px color-mix(in srgb, var(--color-accent) 45%, transparent))' }}
            >
              <defs>
                <linearGradient id="noc-mark-g" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#8b5cf6" />
                  <stop offset="0.5" stopColor="#a855f7" />
                  <stop offset="1" stopColor="#22d3ee" />
                </linearGradient>
              </defs>
              <rect x="2" y="2" width="28" height="28" rx="8" fill="url(#noc-mark-g)" />
              <circle cx="21" cy="12" r="9" fill="var(--color-panel)" />
            </svg>
            <div>
              <div
                className="font-sans text-[17px] font-bold tracking-[0.18em]"
                style={{
                  background: 'var(--grad)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                NOCTURNE
              </div>
              <div className="font-mono text-[10px] tracking-[0.18em] text-faint">OPERATOR CONSOLE</div>
            </div>
          </div>

          {hint ? (
            <div
              className="rounded-[var(--radius)] border p-3 text-[11px] text-muted"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}
            >
              <span
                className="mr-2 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider"
                style={{
                  color: 'var(--color-live)',
                  background: 'color-mix(in srgb, var(--color-live) 16%, transparent)',
                }}
              >
                DEFAULT LOGIN
              </span>
              Sign in with{' '}
              <code className="rounded px-1 py-0.5 font-mono text-accent-ink" style={{ background: 'var(--color-accent-dim)' }}>
                {hint}
              </code>
              . Change in production.
            </div>
          ) : null}

          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">Username</span>
            <input
              value={username}
              onChange={(e) => onUsername(e.target.value)}
              onKeyDown={onKeyDown}
              spellCheck={false}
              autoFocus
              className="h-10 rounded-[var(--radius)] border bg-bg px-3 font-mono text-[13px] text-text outline-none focus:border-accent"
              style={{ borderColor: 'var(--color-border)' }}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => onPassword(e.target.value)}
              onKeyDown={onKeyDown}
              className="h-10 rounded-[var(--radius)] border bg-bg px-3 font-mono text-[13px] text-text outline-none focus:border-accent"
              style={{ borderColor: 'var(--color-border)' }}
            />
          </label>

          {error ? <span className="font-mono text-[11px]" style={{ color: 'var(--color-crit)' }}>{error}</span> : null}

          <Button variant="primary" className="h-10 justify-center" disabled={busy} onClick={onSubmit}>
            {busy ? <Spinner /> : <span className="font-mono tracking-[0.12em]">AUTHENTICATE</span>}
          </Button>

          <div className="mt-auto font-mono text-[9.5px] leading-relaxed text-faint2">
            Authorized security testing only. Use only against systems you own or are
            explicitly permitted to test.
          </div>
        </div>
      </div>
    </div>
  );
}
