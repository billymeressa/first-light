# First Light

A quiet morning ritual. One affirmation, one scene to picture, a theta binaural
tone underneath, and a streak that doesn't nag you.

```bash
npm install
npm run dev      # http://localhost:5178
npm run build
```

## What it does

Each day it draws one paired **affirmation + visualization** from a library of 60,
across five themes (confidence, calm, health, relationships, growth). Or, practice
a **set** — a handful of affirmations you curate yourself, in whatever order you
like, walked through in one sitting instead of just the daily pick. The practice
runs as a guided sequence rather than a screen of controls:

1. **Settle** — a 4–2–6 breath, paced by an expanding orb (configurable, or off)
2. **Affirmation** — the line, said once or repeated (configurable), optionally read aloud
3. **Picture it** — the visualization as one compact paragraph, its closing feeling folded
   in as the final, emphasized beat — read aloud as a whole
4. **Complete** — the day is marked

There's also a **Journal**: write a reflection, tap Reflect, and — using your own
Claude or Gemini API key (your choice, in Settings) — it proposes 3 new affirmations
grounded in what you wrote, plus an update to an evolving **"person I want to be"**
portrait. Nothing is saved until you review it: keep, edit, or discard each suggestion,
and the portrait itself is editable before you commit. Every version of the portrait is kept, so it's a readable record of
how it's changed. Nothing about this is automatic — reflection only runs when you ask.

Everything is local by default — no account, no server, no network requests.
Your streak, settings, and anything you write live in this browser's
`localStorage`. The one exception is opt-in: **Journal → Reflect** calls the
Claude API directly using your own key, to generate new affirmations from
what you wrote. See below.

## Architecture

| Path | What it holds |
| --- | --- |
| `src/content/library.ts` | The 60 paired entries. Plain data — edit freely. |
| `src/audio/binaural.ts` | Two hard-panned oscillators offset by the beat frequency, a pink-noise bed with reverb and a drifting filter sweep, and a slow breathing tremolo on the whole mix. All gain changes ramped. |
| `src/audio/reverb.ts` | A procedural stereo reverb impulse (no fetch), shared by the binaural engine and the chime. |
| `src/audio/speech.ts` | On-device `SpeechSynthesis` wrapper — voice ranking (Eddy US preferred, graceful fallback) and hang backstops. |
| `src/audio/chime.ts` | Additive bell with a reverb tail, for transitions and the wake alarm. |
| `src/state/daily.ts` | Deterministic per-date draw that avoids the last 25 entries. |
| `src/state/streak.ts` | Forgiving streak math (a streak survives until midnight). |
| `src/components/Ritual.tsx` | The guided sequence — walks one entry, or a whole set in order. |
| `src/components/Library.tsx` | Entries tab (write/retire) and Sets tab (build/reorder/edit). |
| `src/ai/prompt.ts` | Shared system prompt + `ReflectionResult` types — every generation path builds on this. |
| `src/ai/anthropic.ts` | Browser-side Claude API call (`dangerouslyAllowBrowser`), structured JSON output. |
| `src/ai/gemini.ts` | Browser-side Gemini REST call (`generativelanguage.googleapis.com`), Google's uppercase-typed Schema for structured output. |
| `src/ai/local.ts` | Calls the local-only `/api/reflect` dev-server endpoint (see `vite.config.ts`) — no key, this machine only. |
| `src/components/Journal.tsx` | Write/reflect, the review-before-save screen, and the portrait + its version history. |

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
of mental-rehearsal practice — a clear first-person intention, a specific sensory
scene, an elevated feeling to close on — and deliberately avoids asserting
contested physiological mechanisms or anything that could read as a reason to
skip real medical care.

**No `StrictMode`.** Its double-invoked effects start two `AudioContext`s and
speak every line twice in development, which makes the pacing — the one thing
this app has to get right — impossible to judge while building. See
`src/main.tsx`.

**Journal reflection is the one thing that isn't local, and it's opt-in.**
There's no backend — `Journal → Reflect` calls the Claude API straight from the
browser using a key you supply, via the SDK's `dangerouslyAllowBrowser` option.
Anthropic's own docs are blunt about what that means: the key sits in
client-side code, readable from devtools by anyone with access to the browser.
It's stored in `localStorage`, unencrypted, same as everything else. Only the
journal entry being reflected on is sent, and only when you tap Reflect —
nothing runs automatically, and nothing else in the app makes a network call.
Settings explains this before you can add a key.

## Making it yours

- **Library → Write one** adds your own affirmation and scene.
- **Library → Retire** removes any built-in line from the daily draw.
- **Library → Sets → New set** builds a named, ordered group of affirmations —
  mix themes, mix your own lines with the library, reorder with ↑/↓.
- **Home → Your sets** starts a saved set as one sitting; the streak counts it
  the same as the daily pick, and "Recent" shows the set's name and length.
- **Settings → Practice** locks the daily draw to a single theme, or sets the pace.
- **Settings → Read aloud → Voice** overrides the automatic Eddy-first pick with any
  installed voice.
- **Settings → Background tone → Reverb / space** controls how much the tone washes
  and lingers versus sitting flat.
- **Settings → AI generation** picks a provider (Claude or Gemini) and takes your own key for
  it to enable Journal reflection — or "This machine" to use a locally logged-in `claude` CLI
  instead, no key needed (see the caveat above).
- **Journal → Entries** is where you write; **Reflect** turns an entry into suggested
  affirmations plus an updated "person I want to be," both reviewable before saving.
