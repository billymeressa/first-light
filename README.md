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
across five themes (confidence, calm, health, relationships, growth). The practice
runs as a guided sequence rather than a screen of controls:

1. **Settle** — a 4–2–6 breath, paced by an expanding orb (configurable, or off)
2. **Affirmation** — the line, said once or repeated (configurable), optionally read aloud
3. **Picture it** — the visualization as one compact paragraph, its closing feeling folded
   in as the final, emphasized beat — read aloud as a whole
4. **Complete** — the day is marked

Everything is local. No account, no server, no network requests — your streak,
settings, and anything you write live in this browser's `localStorage`.

## Architecture

| Path | What it holds |
| --- | --- |
| `src/content/library.ts` | The 60 paired entries. Plain data — edit freely. |
| `src/audio/binaural.ts` | Two hard-panned oscillators offset by the beat frequency, plus a pink-noise bed. All gain changes ramped. |
| `src/audio/speech.ts` | On-device `SpeechSynthesis` wrapper with voice ranking and hang backstops. |
| `src/audio/chime.ts` | Additive bell for transitions and the wake alarm. |
| `src/state/daily.ts` | Deterministic per-date draw that avoids the last 25 entries. |
| `src/state/streak.ts` | Forgiving streak math (a streak survives until midnight). |
| `src/components/Ritual.tsx` | The guided sequence. |

## Notes on the design

**The binaural tone needs headphones.** A binaural beat is the *difference*
between two tones, one per ear — on speakers the channels mix in the air and you
just hear a hum. The app says so in Settings. Treat it as atmosphere for the
practice, not as a treatment for anything.

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

## Making it yours

- **Library → Write one** adds your own affirmation and scene.
- **Library → Retire** removes any built-in line from the daily draw.
- **Settings → Practice** locks the draw to a single theme, or sets the pace.
