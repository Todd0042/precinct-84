import { executeCommand, getSuggestedChips } from '../game/campaign.js';
import { createAudioEngine } from '../engine/audio.js';
import { buildScreenFrame, HIGHRES_COLS, HIGHRES_ROWS } from './layout.js';

export function startInteractiveTui({ initialState, audioEnabled = true }) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Interactive TUI requires a TTY terminal. Use --script for non-interactive runs.');
  }

  const audio = createAudioEngine({ enabled: audioEnabled });
  let state = initialState;
  let tick = 0;
  let inputBuffer = '';
  let showManual = false;
  const history = [];
  let historyIdx = -1;
  let tabIdx = 0;
  let latestHitboxes = { chipHitboxes: [], toolbarHitboxes: [] };

  const enterScreen = '\x1b[?1049h\x1b[?25l\x1b[?1000h\x1b[?1006h';
  const leaveScreen = '\x1b[?1006l\x1b[?1000l\x1b[?25h\x1b[?1049l';

  function render() {
    const cols = process.stdout.columns || HIGHRES_COLS;
    const rows = process.stdout.rows || HIGHRES_ROWS;
    const frame = buildScreenFrame({
      state,
      tick,
      audioEq: audio.getEqDisplay(),
      inputBuffer,
      showManual,
      cols,
      rows,
    });
    latestHitboxes = {
      chipHitboxes: frame.chipHitboxes,
      toolbarHitboxes: frame.toolbarHitboxes,
    };
    process.stdout.write('\x1b[H\x1b[2J' + frame.screenText);
  }

  function runCmd(cmdText) {
    const trimmed = String(cmdText || '').trim();
    if (!trimmed) return;
    if (trimmed === 'quit' || trimmed === 'exit') {
      cleanup();
      process.exit(0);
    }
    history.push(trimmed);
    historyIdx = history.length;
    tabIdx = 0;
    const res = executeCommand(state, trimmed);
    state = res.state;
    if (res.meta?.openManual) {
      showManual = !showManual;
    }
    if (res.sfx) {
      audio.play(res.sfx);
    }
    render();
  }

  function handleToolbarAction(action) {
    if (action === 'manual') showManual = !showManual;
    else if (action === 'audio') audio.toggle();
    else if (action === 'save') runCmd('save quicksave');
    else if (action === 'undo') runCmd('undo');
    render();
  }

  function handleMouseEvent(seq) {
    const m = seq.match(/^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/);
    if (!m || m[4] !== 'M' || Number(m[1]) !== 0) return;
    const col = Number(m[2]);
    const row = Number(m[3]);
    for (const box of latestHitboxes.toolbarHitboxes) {
      if (row === box.y && col >= box.x0 && col <= box.x1) {
        handleToolbarAction(box.action);
        return;
      }
    }
    for (const chip of latestHitboxes.chipHitboxes) {
      if (row === chip.y && col >= chip.x0 && col <= chip.x1) {
        runCmd(chip.command);
        return;
      }
    }
  }

  function onData(buf) {
    const str = buf.toString('utf8');
    if (str === '\x03') {
      cleanup();
      process.exit(0);
    }
    if (str.startsWith('\x1b[<')) {
      handleMouseEvent(str);
      return;
    }
    if (str === '\x1bOP' || str === '\x1b[11~') {
      showManual = !showManual;
      render();
      return;
    }
    if (str === '\x1bOQ' || str === '\x1b[12~') {
      audio.toggle();
      render();
      return;
    }
    if (str === '\x1b[15~') {
      runCmd('save quicksave');
      return;
    }
    if (str === '\x1b[20~') {
      runCmd('undo');
      return;
    }
    if (str === '\x1b') {
      if (showManual) {
        showManual = false;
        render();
      }
      return;
    }
    if (str === '\x1b[A') {
      if (history.length > 0 && historyIdx > 0) {
        historyIdx -= 1;
        inputBuffer = history[historyIdx];
        render();
      }
      return;
    }
    if (str === '\x1b[B') {
      if (historyIdx < history.length - 1) {
        historyIdx += 1;
        inputBuffer = history[historyIdx];
      } else {
        historyIdx = history.length;
        inputBuffer = '';
      }
      render();
      return;
    }
    if (str === '\t') {
      const chips = getSuggestedChips(state);
      if (chips.length > 0) {
        inputBuffer = chips[tabIdx % chips.length].command;
        tabIdx += 1;
        render();
      }
      return;
    }
    if (str === '\r' || str === '\n') {
      const cmd = inputBuffer;
      inputBuffer = '';
      runCmd(cmd);
      return;
    }
    if (str === '\x7f' || str === '\b') {
      inputBuffer = inputBuffer.slice(0, -1);
      render();
      return;
    }
    if (!str.startsWith('\x1b') && str >= ' ') {
      inputBuffer += str;
      render();
    }
  }

  let timer = null;
  function cleanup() {
    if (timer) clearInterval(timer);
    process.stdout.off('resize', render);
    process.stdin.off('data', onData);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdout.write(leaveScreen);
  }

  process.stdout.write(enterScreen);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', onData);
  process.stdout.on('resize', render);
  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });

  render();
  timer = setInterval(() => {
    tick = (tick + 1) % 10000;
    render();
  }, 150);
}
