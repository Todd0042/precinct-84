# Precinct 84: Case I — *Blue Velvet*

An illustrated EGA/VGA half-block detective and beat-cop parser game for the terminal, inspired by Sierra's classic *Police Quest*.

## Features

- **Animated EGA/VGA Half-Block Viewport:** Truecolor 24-bit ANSI (`▀`) pixel framebuffer (`60x20` virtual resolution inside a `60x23` terminal layout) rendering animated rain, sweeping windshield wipers, pulsing red/blue emergency lightbars, neon motel signs, harbor searchlights, and crime-scene tape across 15 scene states.
- **Classic Sierra Verb-Noun Natural Parser:** Supports flexible verb-noun commands (`inspect tires`, `look pedestrian`, `turn on lights`, `radio 10-80`, `draw weapon`, `holster weapon`, `cuff suspect`, `read miranda`, `dust safe`, `stand aside`, `return fire`) plus Tab-completable and SGR mouse-clickable verb/noun chips.
- **Strict Police-Procedure Fail States & Undo:** Violating real police procedure (skipping the pre-watch tire walk-around, forgetting your seatbelt, approaching an un-cuffed suspect or cuffing with your gun drawn, interrogating without Miranda or tape, walking into a door trap, or breaching Pier 84 without SWAT) triggers a Sierra-style procedural citation with instant **`[U]` / `undo`** recovery.
- **Built-in Patrolman's Field Guide (`[F1]` / `manual`):** Pocket manual covering Radio 10-Codes, Motor Pool Walk-Around, 7-Step Felony Stop Checklist, Interrogation & Forensics, and Use-of-Force rules.
- **Retro PC Speaker / AdLib Synth Audio:** Procedurally synthesizes `.wav` cues (wail siren, Motorola radio squelch, keystrokes, handcuffs ratchet, gunshot, point chime, Sierra game-over dirge) and plays them non-blockingly via `ffplay` when available (`--no-audio` or `[F2]` to mute).
- **Save & Restore Slots:** Persistent JSON save slots (`save <name>`, `restore <name>`, or `[F5]` quick save).

## Quick Start

```bash
cd /workspace/precinct-84
npm start
```

### CLI Options

```bash
node ./bin/precinct-84.js --help
node ./bin/precinct-84.js --no-audio
node ./bin/precinct-84.js --no-audio --script "look; listen briefing; go locker; open locker"
node ./bin/precinct-84.js --no-audio --dump-frame --script "listen briefing; look blackboard"
```

## Controls (Interactive TUI)

- **Type commands** at the `>` prompt and press `Enter` (e.g., `listen briefing`, `inspect tires`, `radio 10-8`).
- **`Tab`** — Cycle / insert suggested verb-noun chips from the context helper bar.
- **`Up` / `Down`** — Browse command history.
- **Mouse Click** — Click `[F1:Manual]`, `[F2:Audio]`, `[F5:Save]`, `[F9:Undo]`, or any chip in the helper bar.
- **`F1`** (or `manual`) — Toggle the Precinct 84 Patrolman's Field Guide overlay.
- **`F2`** — Toggle retro synthesized sound effects.
- **`F5`** — Quick save to slot `quicksave`.
- **`F9`** (or `undo`) — Undo last mistake / recover from a procedural Game Over.

## Project Structure

Every JavaScript module is kept cleanly modular and strictly under 400 lines:

- `bin/precinct-84.js` — CLI entrypoint supporting interactive TUI and `--script` batch playback.
- `src/engine/palette.js` — 16-color Sierra EGA + atmospheric night-noir RGB palette & ANSI color helpers.
- `src/engine/framebuffer.js` — Virtual pixel canvas (`60x20` default, scaling logical `76x32` coordinates) rendering crisp half-block (`▀`) ANSI lines.
- `src/engine/art-primitives.js` — Shared rain, emergency lightbar, character, cruiser, cockpit, and citation overlays.
- `src/engine/art-act1-2.js` — Animated half-block scenes for Acts I & II (precinct, crosswalk, pursuit, interrogation).
- `src/engine/art-act3-4.js` — Animated half-block scenes for Acts III & IV (motel, forensics lab, Pier 84, finale).
- `src/engine/art.js` — Scene art dispatcher and `SCENE_IDS` registry.
- `src/engine/audio.js` — Procedural PCM `.wav` synthesizer and `ffplay` runner.
- `src/engine/parser.js` — Sierra-style verb-noun parser with synonym normalization and radio-code detection.
- `src/game/manual.js` — Structured Patrolman's Field Guide reference pages.
- `src/game/state.js` — Initial state, scoring helpers, procedural fail trigger, undo snapshots, and save/load slots.
- `src/game/scenes-act1.js` — Act I scene handlers (briefing, locker room, motor pool walk-around).
- `src/game/scenes-act2.js` — Act II scene handlers (crosswalk cameo, pursuit, felony stop, interrogation).
- `src/game/scenes-act3.js` — Act III scene handlers (Starlight Motor Court trap, alley capture, safe forensics).
- `src/game/scenes-act4.js` — Act IV scene handlers (Pier 84 SWAT raid, kingpin showdown, crosswalk twist, epilogue).
- `src/game/chips.js` — Context-aware clickable verb/noun chip suggestions per scene.
- `src/game/campaign.js` — Central command dispatcher and campaign exports.
- `src/ui/layout.js` — Pure ANSI TUI layout builder with mouse chip hitboxes and manual overlay.
- `src/ui/tui.js` — Raw-mode keyboard, SGR mouse, command history, and animation loop.
- `tests/e2e-campaign.test.js` — Full E2E test suite verifying Golden Path 100/100, procedural fail states, undo, save/restore, half-block rendering, CLI execution, and the `<= 400` lines/file invariant.

## Running Tests

```bash
cd /workspace/precinct-84
npm run test:e2e
```
