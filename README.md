# First Light

A quiet morning ritual. One affirmation, a theta binaural tone underneath, and
a streak that doesn't nag you.

```bash
npm install
npm run dev      # http://localhost:5178
npm run build
```

## What it does

Each day it draws a small, shuffled **set** of affirmations — never just one,
since a single line reads as too short on its own — from a library of 60
across five themes (confidence, calm, health, relationships, growth); the
shuffle cycles through the whole library before repeating anything. Or,
practice a **set** you curate yourself — a handful of affirmations, in
whatever order you like, walked through in one sitting instead of the daily
pick. The practice runs as a guided sequence rather than a screen of controls:

1. **Settle** — a 4–2–6 breath, paced by an expanding orb (configurable, or off)
2. **Affirmation** — the line, said once or repeated (configurable), optionally read aloud
3. **Complete** — the day is marked

There's also a **Journal**: write a reflection, tap Reflect, and the app's own
built-in AI (Claude, falling back to Gemini) proposes 3 new affirmations
grounded in what you wrote, plus an update to an evolving **"person I want to be"**
portrait. Nothing is saved until you review it: keep, edit, or discard each suggestion,
and the portrait itself is editable before you commit. Every version of the portrait is kept, so it's a readable record of
how it's changed. Nothing about this is automatic — reflection only runs when you ask,
and only while signed in (see below — every reflection costs the app owner money,
so it's tied to a real account rather than open to anyone).

An account is required to use the app at all — sign in or create one on
first launch, before anything else is reachable. Your streak, settings, and
anything you write sync (via Supabase) to that account and follow you to any
device you sign into.

## Architecture

| Path | What it holds |
| --- | --- |
| `src/content/library.ts` | The 60 affirmations. Plain data — edit freely. |
| `src/audio/binaural.ts` | Two hard-panned oscillators offset by the beat frequency, a pink-noise bed with reverb and a drifting filter sweep, and a slow breathing tremolo on the whole mix. All gain changes ramped. |
| `src/audio/reverb.ts` | A procedural stereo reverb impulse (no fetch), shared by the binaural engine and the chime. |
| `src/audio/speech.ts` | On-device `SpeechSynthesis` wrapper — voice ranking (Eddy US preferred, graceful fallback) and hang backstops. |
| `src/audio/chime.ts` | Additive bell with a reverb tail, for transitions and the wake alarm. |
| `src/state/daily.ts` | Deterministic per-date seeded shuffle that cycles the whole library before repeating, sized to `Settings → Practice → Daily set size`. |
| `src/state/streak.ts` | Forgiving streak math (a streak survives until midnight). |
| `src/components/Ritual.tsx` | The guided sequence — walks one entry, or a whole set in order. |
| `src/components/Library.tsx` | Entries tab (write/retire) and Sets tab (build/reorder/edit). |
| `src/ai/prompt.ts` | Shared system prompt + `ReflectionResult` types — both the client and the server handler build on this. |
| `src/ai/reflect.ts` | Client-side: sends the journal text and the user's Supabase access token to `/api/reflect`. No key here — there's nothing to steal from the browser. |
| `api/_lib/reflect.ts` | The actual generation logic: verifies the caller is signed in, then tries Claude, falling back to Gemini. Shared verbatim between `api/reflect.ts` (Vercel) and the dev middleware in `vite.config.ts`, so behavior never drifts between `npm run dev` and production. |
| `api/reflect.ts` | Vercel serverless function — `POST /api/reflect`, auto-deployed from this file, nothing else to configure. |
| `src/components/Journal.tsx` | Write/reflect, the review-before-save screen, and the portrait + its version history. |
| `src/audio/recordings.ts` | IndexedDB store for your own recorded voice per affirmation, plus playback — blobs are too big for `localStorage`. |
| `src/components/VoiceRecorder.tsx` | Record/play/re-record/remove a voice take for one entry, used from `Library → Voice`. |
| `src/lib/supabase.ts` | Supabase client, built from `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`. `cloudSupported` is `false` (and everything below no-ops) if they're unset. |
| `src/state/cloud.ts` | Auth (sign up/in/out) and sync: pulls your cloud state on sign-in, pushes local changes (debounced) while signed in. |
| `src/components/Account.tsx` | Sign in/up form, or account + sign-out once signed in. |
| `supabase/schema.sql` | Run once in your Supabase project's SQL editor — creates the `app_state` table and its row-level-security policies. |

## Notes on the design

**The binaural tone needs headphones.** A binaural beat is the *difference*
between two tones, one per ear — on speakers the channels mix in the air and you
just hear a hum. The app says so in Settings. Treat it as atmosphere for the
practice, not as a treatment for anything.

**The reverb and filter sweep never touch the two carrier tones.** Only the
noise bed is routed through the convolver and the drifting lowpass filter —
running the actual binaural pair through a reverb would smear the precise
per-ear frequency difference the whole effect depends on. The "hypnotic" wash,
the breathing tremolo, and the drifting stereo reverb all live in the layers
*around* the tones, never in them. Verified by inspecting the live audio graph:
the tones connect straight to the master bus with no path through the
convolver, while the reverb send only ever receives the noise bed.

**Read-aloud gets no effects at all.** The Web Speech API doesn't expose
synthesized speech as an audio node — there's no supported way to route it
through a `ConvolverNode` or any other Web Audio effect, on any browser. Voice
character is limited to what `SpeechSynthesisUtterance` exposes: voice choice,
rate, pitch, volume. Eddy (US) is preferred as the default voice where the
device has it installed, ranked ahead of everything else in `speech.ts`.

**The wake alarm is in-app.** A browser can't reliably wake a sleeping phone, so
the alarm rings when First Light is open on screen — fine on a bedside tablet or
laptop. On a phone, keep using the system alarm and open this straight after.
This is stated in the UI rather than quietly under-delivered.

**The content makes no medical or scientific claims.** It's written in the spirit
of mental-rehearsal practice — a clear, first-person intention — and deliberately
avoids asserting contested physiological mechanisms or anything that could read
as a reason to skip real medical care.

**No `StrictMode`.** Its double-invoked effects start two `AudioContext`s and
speak every line twice in development, which makes the pacing — the one thing
this app has to get right — impossible to judge while building. See
`src/main.tsx`.

**Journal reflection is the one thing that isn't local, and it's opt-in.**
`Journal → Reflect` calls `/api/reflect`, a small serverless function that holds
the app's own Claude and Gemini keys — never shipped to the browser, unlike the
early version of this feature which asked each user for their own key. Because
every call now costs the app owner rather than the person using it, the
endpoint checks the caller's Supabase session before doing anything, so it
can't be hit anonymously and run up an unbounded bill. Only the journal entry
being reflected on is sent, and only when you tap Reflect — nothing runs
automatically, and nothing else in the app makes a network call.

## Cloud sync + Journal reflection

Both features share one piece of setup — Supabase accounts, which are **required** to run this
app at all, not optional — and Journal reflection needs one more step on top (a Claude and/or
Gemini key, held server-side). Without the steps below configured, the app has nothing to show
beyond the sign-in screen.

**Accounts + sync:**

1. Create a free project at [supabase.com](https://supabase.com).
2. In its SQL editor, run [`supabase/schema.sql`](supabase/schema.sql) — this creates one
   `app_state` table (one row per user, holding the synced data as JSON) with row-level
   security so each account can only ever read or write its own row.
3. In Project Settings → API, copy the **Project URL** and the **publishable** key (Supabase's
   newer key format is `sb_publishable_...`, replacing the old `anon` JWT key — either works
   with this app, but never use the **secret**/`service_role` key here; that one must never end
   up in client code).
4. Create a `.env` file in the project root (already gitignored):
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-publishable-key
   ```
5. Restart `npm run dev` (or add the same two variables to your Vercel project's Environment
   Variables and redeploy, for the live site).

Once configured, the sign-in screen appears on launch. Email/password only, no magic links
or OAuth — signing up sends a confirmation email via Supabase's default mailer. Everything in
`AppState` syncs: settings, the affirmation library (custom + retired), sets, practice history,
journal entries, and the portrait history. Recorded voice takes don't (`src/audio/recordings.ts`
— audio blobs aren't part of the JSON state at all, and stay on-device).

**Journal reflection**, on top of the above, needs its own server-side keys — these are
deliberately **not** `VITE_`-prefixed, since that prefix means "safe to ship to the browser,"
and these aren't:
```
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIza... or AQ....
```
Add both to the same `.env` for local dev, and to Vercel's Environment Variables for the
deployed site (Vercel serverless functions read env vars regardless of prefix — only the
client bundle cares about `VITE_`). Either key alone is enough (`api/_lib/reflect.ts` tries
Claude first, then Gemini); set both for resilience if one provider is down or rate-limited.
Reflection is gated on being signed in — see the design note above for why.

## Making it yours

- **Library → Write one** adds your own affirmation.
- **Library → Retire** removes any built-in line from the daily draw.
- **Library → Sets → New set** builds a named, ordered group of affirmations —
  mix themes, mix your own lines with the library, reorder with ↑/↓.
- **Home → Your sets** starts a saved set as one sitting; the streak counts it
  the same as the daily pick, and "Recent" shows the set's name and length.
- **Settings → Practice** locks the daily draw to a single theme, sets how many
  affirmations make up today's set, or sets the pace.
- **Settings → Read aloud → Voice** overrides the automatic Eddy-first pick with any
  installed voice.
- **Settings → Background tone → Reverb / space** controls how much the tone washes
  and lingers versus sitting flat.
- **Journal → Entries** is where you write; **Reflect** turns an entry into suggested
  affirmations plus an updated "person I want to be," both reviewable before saving — requires
  being signed in (see Cloud sync above).
- **Library → Voice** records your own voice for any affirmation — it plays back during
  practice instead of the synthesized voice, if "Speak the affirmation" is on.
- **Settings → account row** shows who you're signed in as and lets you sign out.
