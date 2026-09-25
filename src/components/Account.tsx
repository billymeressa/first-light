import { useState, type FormEvent } from 'react';
import { cloudSupported, signIn, signOut, signUp, useSession } from '../state/cloud';

type Mode = 'signin' | 'signup';

export function Account() {
  const { session, loaded } = useSession();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  if (!cloudSupported) {
    return (
      <div className="rise">
        <h1 className="affirmation" style={{ fontSize: '1.5rem' }}>
          Account
        </h1>
        <p className="note">
          Cloud sync isn't configured for this deployment, and an account is required to use
          the app at all. See <code>README.md</code> for how to turn it on.
        </p>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="rise">
        <h1 className="affirmation" style={{ fontSize: '1.5rem' }}>
          Account
        </h1>
        <p className="faint">Checking your session…</p>
      </div>
    );
  }

  if (session) {
    return (
      <div className="rise">
        <h1 className="affirmation" style={{ fontSize: '1.5rem' }}>
          Account
        </h1>
        <p className="note" style={{ marginBottom: '1.5rem' }}>
          Signed in as <b>{session.user.email}</b>. Your streak, settings, and everything
          you've written sync to this account — sign in from any device to pick up where you
          left off.
        </p>
        <button
          className="btn-quiet"
          onClick={() => void signOut()}
        >
          Sign out
        </button>
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signup') {
        await signUp(email.trim(), password);
        setCheckEmail(true);
      } else {
        await signIn(email.trim(), password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (checkEmail) {
    return (
      <div className="rise">
        <h1 className="affirmation" style={{ fontSize: '1.5rem' }}>
          Almost there
        </h1>
        <p className="note">
          Check <b>{email}</b> for a confirmation link, then come back and sign in.
        </p>
        <button className="btn-quiet" style={{ marginTop: '1rem' }} onClick={() => setCheckEmail(false)}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="rise">
      <h1 className="affirmation" style={{ fontSize: '1.5rem' }}>
        {mode === 'signin' ? 'Sign in' : 'Create an account'}
      </h1>
      <p className="faint" style={{ fontSize: '0.85rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
        Your streak, settings, and everything you write sync to your account and follow you to
        any device you sign into.
      </p>

      <form className="editor" onSubmit={(e) => void submit(e)}>
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </label>

        {error && <p className="note">{error}</p>}

        <div className="row-control" style={{ justifyContent: 'flex-start' }}>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
          <button
            type="button"
            className="btn-quiet"
            onClick={() => {
              setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
              setError(null);
            }}
          >
            {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
          </button>
        </div>
      </form>
    </div>
  );
}
