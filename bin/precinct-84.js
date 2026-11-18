#!/usr/bin/env node
import { createInitialState, executeCommand, SCENE_META } from '../src/game/campaign.js';
import { Framebuffer } from '../src/engine/framebuffer.js';
import { renderSceneArt } from '../src/engine/art.js';
import { startInteractiveTui } from '../src/ui/tui.js';

function printHelp() {
  console.log(`Precinct 84: Case I - Blue Velvet
Usage:
  precinct-84 [options]

Options:
  --no-audio          Disable procedural WAV audio playback
  --script "<cmds>"   Run semicolon-separated commands non-interactively
  --dump-frame        Output rendered EGA half-block ANSI frame with --script
  --help              Show this help message`);
}

function runScriptMode({ script, dumpFrame }) {
  let state = createInitialState();
  const commands = script.split(';').map((c) => c.trim()).filter(Boolean);
  console.log(`=== ${SCENE_META[state.scene]?.title || state.scene} ===`);

  for (const cmd of commands) {
    const res = executeCommand(state, cmd);
    state = res.state;
    console.log(`\n> ${cmd}`);
    for (const line of res.output) {
      console.log(`  ${line}`);
    }
  }

  if (dumpFrame) {
    const fb = new Framebuffer(128, 64);
    renderSceneArt(fb, state, 4);
    console.log('\n' + fb.renderToAnsiLines().join('\n'));
  }
  console.log(`\n[FINAL STATE] Scene: ${state.scene} | Score: ${state.score}/${state.maxScore}`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  const noAudio = args.includes('--no-audio');
  const dumpFrame = args.includes('--dump-frame');
  const scriptIdx = args.indexOf('--script');
  const script = scriptIdx !== -1 ? args[scriptIdx + 1] : null;

  if (script !== null && script !== undefined) {
    runScriptMode({ script, dumpFrame });
    return;
  }

  startInteractiveTui({
    initialState: createInitialState(),
    audioEnabled: !noAudio,
  });
}

main();
