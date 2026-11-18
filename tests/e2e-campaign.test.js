import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import {
  createInitialState,
  executeCommand,
  getSuggestedChips,
  saveGame,
  loadGame,
} from '../src/game/campaign.js';
import { Framebuffer } from '../src/engine/framebuffer.js';
import { renderSceneArt, SCENE_IDS } from '../src/engine/art.js';
import { POLICE_MANUAL } from '../src/game/manual.js';
import { createAudioEngine } from '../src/engine/audio.js';
import { buildScreenFrame } from '../src/ui/layout.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

function runCommands(startState, commands) {
  let state = startState;
  const results = [];
  for (const cmd of commands) {
    const res = executeCommand(state, cmd);
    state = res.state;
    results.push({ cmd, res });
  }
  return { state, results };
}

async function testGoldenPath100Points() {
  console.log('1. Running E2E Scenario 1: Golden Path 100/100 Campaign...');
  let state = createInitialState();
  assert.equal(state.scene, 'precinct_briefing');
  assert.equal(state.score, 0);
  assert.equal(state.officerName, 'Officer Marcus Mercer');
  assert.equal(state.partnerName, 'Officer Claire Bellamy');

  // Act I: Precinct 84 Briefing, Locker Room, and Motor Pool Walk-Around
  state = runCommands(state, [
    'listen briefing', 'look blackboard', 'go locker', 'open locker',
    'take belt', 'take keys', 'go yard', 'inspect tires', 'inspect trunk',
    'enter car', 'fasten seatbelt', 'radio 10-8',
  ]).state;
  assert.equal(state.score, 20, `Expected Act I score 20, got ${state.score}`);
  assert.equal(state.scene, 'crosswalk_redlight');
  assert.equal(state.flags.inspectedTires, true);
  assert.equal(state.flags.seatbeltOn, true);
  assert.equal(state.gameOver, null);

  // Act II-A: 4th & Union Crosswalk Pedestrian Cameo & High-Speed Pursuit
  const pedRes = executeCommand(state, 'look pedestrian');
  state = pedRes.state;
  const pedText = pedRes.output.join('\n');
  assert.match(pedText, /beige raincoat/i);
  assert.match(pedText, /Rossi's Pastries/i);
  assert.match(pedText, /pocket watch/i);
  assert.equal(state.scene, 'pursuit_active');
  assert.equal(state.pursuitStage, 0);

  state = runCommands(state, [
    'turn on lights', 'turn on siren', 'radio 10-80',
    'swerve left', 'hold lane', 'follow tracks',
  ]).state;
  assert.equal(state.score, 38, `Expected Act II-A score 38, got ${state.score}`);
  assert.equal(state.scene, 'felony_stop');
  assert.equal(state.gameOver, null);

  // Act II-B: Felony Stop & Interrogation of Eddie Rourke
  state = runCommands(state, [
    'draw weapon', 'order suspect out', 'holster weapon', 'cuff suspect',
    'search suspect', 'read miranda', 'search trunk', 'bag evidence',
    'turn on recorder', 'show drugs', 'show pager',
  ]).state;
  assert.equal(state.score, 56, `Expected Act II-B score 56, got ${state.score}`);
  assert.equal(state.scene, 'motel_exterior');
  assert.equal(state.gameOver, null);

  // Act III: Starlight Motor Court & Lab Forensics
  state = runCommands(state, [
    'radio 10-97', 'inspect door', 'stand aside', 'knock door',
    'pursue marco', 'cuff marco', 'read miranda', 'inspect table',
    'dust safe', 'lift prints', 'compare prints', 'open safe', 'decode ledger',
  ]).state;
  assert.equal(state.score, 76, `Expected Act III score 76, got ${state.score}`);
  assert.equal(state.scene, 'pier84_exterior');
  assert.equal(state.flags.warrantCode, 'HARBOR-84-OMEGA');
  assert.equal(state.gameOver, null);

  // Act IV: Pier 84 Raid & The Man at the Crosswalk Twist
  state = runCommands(state, [
    'radio swat', 'cut wires', 'signal breach', 'take cover',
    'shout police freeze', 'return fire', 'order drop gun', 'holster weapon',
    'cuff castellano', 'read miranda', 'bag ledger', 'inspect desk',
    'talk castellano', 'go street', 'look street',
  ]).state;
  assert.equal(state.scene, 'epilogue_ceremony');
  assert.equal(state.victory, true);
  assert.equal(state.score, 100, `Expected final score 100, got ${state.score}`);
  assert.equal(state.gameOver, null);

  const epilogueText = state.log.slice(-10).map((entry) => entry.text).join('\n');
  assert.match(epilogueText, /Narcotics Detective/i);
  assert.match(epilogueText, /CASE FILE #84-002/i);
  console.log('   PASS: Full 100/100 campaign reached Epilogue cleanly.');
}

async function testProceduralFailStatesAndUndo() {
  console.log('2. Running E2E Scenario 2: Procedural Fail States & Undo Recovery...');

  // Helper to reach pursuit fast with overrides
  function reachPursuitWith({ skipTires = false, skipSeatbelt = false, skipGear = false } = {}) {
    const cmds = ['listen briefing', 'look blackboard', 'go locker', 'open locker'];
    if (!skipGear) cmds.push('take belt');
    cmds.push('take keys', 'go yard');
    if (!skipTires) cmds.push('inspect tires');
    cmds.push('inspect trunk', 'enter car');
    if (!skipSeatbelt) cmds.push('fasten seatbelt');
    cmds.push('radio 10-8', 'look pedestrian');
    return runCommands(createInitialState(), cmds).state;
  }

  // 2A. Tire blowout from skipping walk-around
  {
    let s = reachPursuitWith({ skipTires: true });
    s = runCommands(s, ['code 3', 'radio 10-80', 'swerve left']).state;
    assert.ok(s.gameOver, 'Expected tire blowout Game Over when skipping tire inspection');
    assert.match(s.gameOver.reason, /tire|blowout|walk-around/i);
    s = executeCommand(s, 'undo').state;
    assert.equal(s.gameOver, null, 'Undo should clear blowout Game Over');
    assert.equal(s.scene, 'pursuit_active');
  }

  // 2B. Seatbelt ejection during swerve
  {
    let s = reachPursuitWith({ skipSeatbelt: true });
    s = runCommands(s, ['code 3', 'radio 10-80', 'swerve left']).state;
    assert.ok(s.gameOver, 'Expected seatbelt Game Over on emergency swerve');
    assert.match(s.gameOver.reason, /seatbelt|safety belt/i);
    s = executeCommand(s, 'undo').state;
    assert.equal(s.gameOver, null);
  }

  // 2C. Pursuing without Code 3 lights & siren
  {
    let s = reachPursuitWith();
    s = executeCommand(s, 'swerve left').state;
    assert.ok(s.gameOver, 'Expected blind intersection crash without Code 3 lights/siren');
    assert.match(s.gameOver.reason, /Code 3|lights|siren/i);
    s = executeCommand(s, 'undo').state;
    assert.equal(s.gameOver, null);
  }

  // 2D. Felony Stop failures (approaching un-drawn, cuffing with gun drawn, missing gear)
  {
    let s = reachPursuitWith();
    s = runCommands(s, ['code 3', 'radio 10-80', 'swerve left', 'hold lane', 'follow tracks']).state;
    assert.equal(s.scene, 'felony_stop');

    // Attempt cuff before drawing weapon / ordering out
    const failApproach = executeCommand(s, 'cuff suspect').state;
    assert.ok(failApproach.gameOver, 'Expected Game Over approaching armed suspect without cover/weapon');
    let recovered = executeCommand(failApproach, 'undo').state;
    assert.equal(recovered.gameOver, null);

    // Draw weapon and order suspect out, then try to cuff WITHOUT holstering
    recovered = runCommands(recovered, ['draw weapon', 'order suspect out']).state;
    const failCuffWithGun = executeCommand(recovered, 'cuff suspect').state;
    assert.ok(failCuffWithGun.gameOver, 'Expected Game Over cuffing with .38 still drawn');
    assert.match(failCuffWithGun.gameOver.reason, /holster/i);
    recovered = executeCommand(failCuffWithGun, 'undo').state;
    assert.equal(recovered.gameOver, null);

    // Missing duty gear from locker room
    let noGear = reachPursuitWith({ skipGear: true });
    noGear = runCommands(noGear, ['code 3', 'radio 10-80', 'swerve left', 'hold lane', 'follow tracks']).state;
    const failNoGun = executeCommand(noGear, 'draw weapon').state;
    assert.ok(failNoGun.gameOver, 'Expected Game Over when rolling out without duty belt/revolver');
    assert.match(failNoGun.gameOver.reason, /locker|duty belt|revolver|gear/i);
  }

  // 2E. Interrogation failures: skipping Miranda or skipping tape recorder
  {
    let s = reachPursuitWith();
    s = runCommands(s, [
      'code 3', 'radio 10-80', 'swerve left', 'hold lane', 'follow tracks',
      'draw weapon', 'order suspect out', 'holster weapon', 'cuff suspect',
      'search suspect', 'search trunk', 'bag evidence', 'go precinct',
    ]).state;
    assert.equal(s.scene, 'interrogation_room');

    // Try showing evidence before turning on recorder or reading Miranda
    const failNoRec = executeCommand(s, 'show drugs').state;
    assert.ok(failNoRec.gameOver, 'Expected Game Over when interrogating without recorder/Miranda');
    let recovered = executeCommand(failNoRec, 'undo').state;
    assert.equal(recovered.gameOver, null);

    // Turn on recorder, still no Miranda -> Miranda v. Arizona fail
    recovered = executeCommand(recovered, 'turn on recorder').state;
    const failNoMiranda = executeCommand(recovered, 'show drugs').state;
    assert.ok(failNoMiranda.gameOver, 'Expected Miranda v. Arizona Game Over');
    assert.match(failNoMiranda.gameOver.reason, /Miranda/i);
    recovered = executeCommand(failNoMiranda, 'undo').state;

    // Reading Miranda and showing drugs/pager succeeds cleanly
    recovered = runCommands(recovered, ['read miranda', 'show drugs', 'show pager']).state;
    assert.equal(recovered.gameOver, null);
    assert.equal(recovered.scene, 'motel_exterior');
  }

  // 2F. Starlight Motel shotgun trap & Pier 84 SWAT/Use-of-Force traps
  {
    let s = reachPursuitWith();
    s = runCommands(s, [
      'code 3', 'radio 10-80', 'swerve left', 'hold lane', 'follow tracks',
      'draw weapon', 'order suspect out', 'holster weapon', 'cuff suspect',
      'search suspect', 'read miranda', 'search trunk', 'bag evidence',
      'turn on recorder', 'show drugs', 'show pager',
      'radio 10-97', 'inspect door',
    ]).state;
    assert.equal(s.scene, 'motel_exterior');

    // Knock without standing aside -> 12-gauge door blast
    const failDoor = executeCommand(s, 'knock door').state;
    assert.ok(failDoor.gameOver, 'Expected fatal shotgun door trap when not standing aside');
    assert.match(failDoor.gameOver.reason, /shotgun|stand aside|door/i);
    s = executeCommand(failDoor, 'undo').state;
    assert.equal(s.gameOver, null);

    // Advance cleanly into Pier 84 exterior
    s = runCommands(s, [
      'stand aside', 'knock door', 'pursue marco', 'cuff marco', 'read miranda',
      'inspect table', 'dust safe', 'lift prints', 'compare prints', 'decode ledger',
    ]).state;
    assert.equal(s.scene, 'pier84_exterior');

    // Breach Pier 84 without SWAT -> fatal cartel ambush
    const failNoSwat = executeCommand(s, 'signal breach').state;
    assert.ok(failNoSwat.gameOver, 'Expected fatal ambush breaching Pier 84 without SWAT');
    assert.match(failNoSwat.gameOver.reason, /SWAT|backup/i);
    s = executeCommand(failNoSwat, 'undo').state;

    // Call SWAT, cut wires, breach, take cover, then fire BEFORE shouting Police Freeze -> Use of force fail
    s = runCommands(s, ['radio swat', 'cut wires', 'signal breach', 'take cover']).state;
    assert.equal(s.scene, 'pier84_interior');
    const failShootEarly = executeCommand(s, 'return fire').state;
    assert.ok(failShootEarly.gameOver, 'Expected Use-of-Force Game Over shooting before warning');
    assert.match(failShootEarly.gameOver.reason, /force|unarmed|freeze/i);
    s = executeCommand(failShootEarly, 'undo').state;
    assert.equal(s.gameOver, null);
  }

  console.log('   PASS: All procedural fail states & undo recoveries verified.');
}

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function assertFrameDimensions(frame, label, cols = 128, rows = 46) {
  const actualRows = frame.screenText.split('\n');
  assert.equal(actualRows.length, rows, `${label} must render ${rows} rows`);
  for (const row of actualRows) {
    assert.equal(stripAnsi(row).length, cols, `${label} line width must equal ${cols}`);
  }
  assert.equal(frame.toolbarHitboxes.length, 4, `${label} must expose 4 toolbar hitboxes`);
  assert.ok(frame.chipHitboxes.length > 0, `${label} must expose at least 1 chip hitbox`);
  for (const box of [...frame.toolbarHitboxes, ...frame.chipHitboxes]) {
    assert.ok(box.x0 >= 1 && box.x1 <= cols && box.x0 <= box.x1 && box.y >= 1 && box.y <= rows, `${label} hitbox out of ${cols}x${rows}`);
  }
}

async function testSaveRestoreManualRendererAudioAndCli() {
  console.log('3. Running E2E Scenario 3: Save/Restore, Manual, Half-Block Art, Audio & CLI...');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'precinct84-test-'));

  try {
    // Save / Restore persistence test
    let s1 = createInitialState();
    s1 = runCommands(s1, ['listen briefing', 'look blackboard', 'go locker', 'open locker', 'take belt']).state;
    const savedScore = s1.score;
    saveGame(s1, 'checkpoint-alpha', tmpDir);

    const sMutated = createInitialState();
    assert.equal(sMutated.score, 0);

    const restored = loadGame('checkpoint-alpha', tmpDir);
    assert.equal(restored.score, savedScore);
    assert.equal(restored.scene, 'precinct_locker');
    assert.equal(restored.flags.equippedGear, true);

    // Context chip helper test
    const chips = getSuggestedChips(restored);
    assert.ok(Array.isArray(chips) && chips.length > 0, 'Suggested chips should not be empty');

    // Police Manual content test
    assert.ok(Array.isArray(POLICE_MANUAL) && POLICE_MANUAL.length >= 4, 'Manual should have multiple sections');
    const manualAllText = POLICE_MANUAL.map((p) => `${p.title}\n${p.lines.join('\n')}`).join('\n');
    assert.match(manualAllText, /10-80/);
    assert.match(manualAllText, /Miranda/i);
    assert.match(manualAllText, /HARBOR|Walk-Around/i);

    // High-res half-block ANSI rendering (128x64) & 128x46 TUI geometry test across ALL 15 scenes, Game Over & Manual
    const fb = new Framebuffer(128, 64);
    for (const sceneId of SCENE_IDS) {
      const mockState = createInitialState();
      mockState.scene = sceneId;
      mockState.pursuitStage = 1;
      mockState.flags.lightsOn = true;
      renderSceneArt(fb, mockState, 5);
      const lines = fb.renderToAnsiLines();
      assert.equal(lines.length, 32, `Scene ${sceneId} must render 32 ANSI half-block lines`);
      assert.equal(stripAnsi(lines[0]).length, 128, `Scene ${sceneId} viewport width must be 128`);
      assert.ok(lines[0].includes('▀'), `Scene ${sceneId} output must contain half-block characters`);
      assert.ok(lines[0].includes('\x1b[38;2;'), `Scene ${sceneId} output must include truecolor ANSI codes`);
      assertFrameDimensions(buildScreenFrame({ state: mockState, tick: 5, cols: 128, rows: 46 }), sceneId, 128, 46);
    }

    assertFrameDimensions(buildScreenFrame({ state: createInitialState(), tick: 1, cols: 80, rows: 28 }), 'scaled-80x28', 80, 28);
    const goState = createInitialState();
    goState.gameOver = { title: 'PROCEDURAL VIOLATION', citation: 'CODE 402-B', reason: 'Skipped pre-watch tire inspection.' };
    renderSceneArt(fb, goState, 2);
    const goLines = fb.renderToAnsiLines();
    assert.equal(goLines.length, 32);
    assert.equal(stripAnsi(goLines[0]).length, 128);
    assertFrameDimensions(buildScreenFrame({ state: goState, tick: 2, cols: 128, rows: 46 }), 'gameOver', 128, 46);
    const manualFrame = buildScreenFrame({ state: createInitialState(), tick: 0, showManual: true, cols: 128, rows: 46 });
    assertFrameDimensions(manualFrame, 'manual', 128, 46);
    assert.match(stripAnsi(manualFrame.screenText), /HARBOR/);

    // Procedural WAV audio synthesis test
    const audioDir = path.join(tmpDir, 'wav-cache');
    const audio = createAudioEngine({ enabled: false, cacheDir: audioDir });
    const wavFiles = audio.ensureAssets();
    assert.ok(wavFiles.siren && fs.existsSync(wavFiles.siren), 'Siren WAV should synthesize cleanly');
    assert.ok(wavFiles.gameover && fs.existsSync(wavFiles.gameover), 'Game Over WAV should synthesize cleanly');

    const saveQuitRes = executeCommand(goState, 'save and quit');
    assert.equal(saveQuitRes.meta?.quit, true, 'save and quit must trigger quit metadata even in Game Over');
    assert.ok(fs.existsSync(saveQuitRes.meta.savePath), 'save and quit must persist save file');
    const cliRun = await execFileAsync('node', [
      path.join(PROJECT_ROOT, 'bin/precinct-84.js'), '--no-audio', '--dump-frame', '--script',
      'listen briefing; look blackboard; go locker; open locker; take belt; take keys; go yard; inspect tires; save and quit; look sky',
    ]);
    assert.equal(cliRun.stderr.trim(), '', 'CLI should not print errors to stderr');
    assert.match(cliRun.stdout, /▀/, 'CLI --dump-frame should output EGA half-block graphics');
    assert.match(cliRun.stdout, /4X-8821/, 'CLI output should contain BOLO details');
    assert.match(cliRun.stdout, /nail/i, 'CLI output should reflect tire inspection discovery');
    assert.match(cliRun.stdout, /Exiting Precinct 84/, 'save and quit should log exit');
    assert.ok(!cliRun.stdout.includes('> look sky'), 'CLI must halt script after save and quit');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log('   PASS: Save/Restore, Manual, 15-scene half-block renderer, audio WAVs & CLI verified.');
}

function collectJsFiles(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...collectJsFiles(full));
    else if (ent.name.endsWith('.js')) out.push(full);
  }
  return out;
}

function testModularLineLimit() {
  const dirs = ['src', 'bin', 'tests'].map((d) => path.join(PROJECT_ROOT, d));
  for (const dir of dirs) {
    for (const file of collectJsFiles(dir)) {
      const lines = fs.readFileSync(file, 'utf8').split('\n').length;
      assert.ok(lines <= 400, `${path.relative(PROJECT_ROOT, file)} has ${lines} lines (> 400)`);
    }
  }
  console.log('4. PASS: All JS modules strictly <= 400 lines.');
}

async function main() {
  await testGoldenPath100Points();
  await testProceduralFailStatesAndUndo();
  await testSaveRestoreManualRendererAudioAndCli();
  testModularLineLimit();
  console.log('\nALL E2E TESTS PASSED');
}

main().catch((err) => {
  console.error('\nE2E TEST FAILURE:', err);
  process.exit(1);
});
