function prioritize(items) {
  const pending = items.filter((item) => !item.done);
  const completed = items.filter((item) => item.done);
  return [...pending, ...completed].map(({ label, command }) => ({ label, command }));
}

export function getSuggestedChips(state) {
  if (state.gameOver) {
    return [{ label: 'Undo Mistake', command: 'undo' }];
  }
  const f = state.flags || {};
  switch (state.scene) {
    case 'precinct_briefing':
      return prioritize([
        { label: 'Listen Briefing', command: 'listen briefing', done: Boolean(f.gotBriefing) },
        { label: 'Read Blackboard', command: 'look blackboard', done: Boolean(f.readBolo) },
        { label: 'Go Locker', command: 'go locker', done: false },
      ]);
    case 'precinct_locker':
      return prioritize([
        { label: 'Open Locker', command: 'open locker', done: Boolean(f.openedLocker) },
        { label: 'Take Belt', command: 'take belt', done: Boolean(f.equippedGear) },
        { label: 'Take Keys', command: 'take keys', done: Boolean(f.hasKeys) },
        { label: 'Go Yard', command: 'go yard', done: false },
      ]);
    case 'precinct_yard':
      return prioritize([
        { label: 'Inspect Tires', command: 'inspect tires', done: Boolean(f.inspectedTires) },
        { label: 'Inspect Trunk', command: 'inspect trunk', done: Boolean(f.inspectedTrunk) },
        { label: 'Enter Car', command: 'enter car', done: Boolean(f.inCar) },
        { label: 'Fasten Seatbelt', command: 'fasten seatbelt', done: Boolean(f.seatbeltOn) },
        { label: 'Radio 10-8', command: 'radio 10-8', done: Boolean(f.called108) },
      ]);
    case 'crosswalk_redlight':
      return [{ label: 'Look Pedestrian', command: 'look pedestrian' }];
    case 'pursuit_active':
      if (state.pursuitStage === 0) {
        return prioritize([
          { label: 'Lights On', command: 'turn on lights', done: Boolean(f.lightsOn) },
          { label: 'Siren On', command: 'turn on siren', done: Boolean(f.sirenOn) },
          { label: 'Radio 10-80', command: 'radio 10-80', done: Boolean(f.called1080) },
        ]);
      }
      if (state.pursuitStage === 1) {
        return [
          { label: 'Swerve Left', command: 'swerve left' },
          { label: 'Brake', command: 'brake' },
        ];
      }
      if (state.pursuitStage === 2) {
        return [
          { label: 'Hold Lane', command: 'hold lane' },
          { label: 'Swerve Left', command: 'swerve left' },
        ];
      }
      return [{ label: 'Follow Tracks', command: 'follow tracks' }];
    case 'felony_stop':
      return prioritize([
        { label: 'Draw Weapon', command: 'draw weapon', done: Boolean(f.weaponDrawn || f.suspectCompliant) },
        { label: 'Order Out', command: 'order suspect out', done: Boolean(f.suspectCompliant) },
        { label: 'Holster', command: 'holster weapon', done: Boolean(f.eddieCuffed || (f.suspectCompliant && !f.weaponDrawn)) },
        { label: 'Cuff Suspect', command: 'cuff suspect', done: Boolean(f.eddieCuffed) },
        { label: 'Search Suspect', command: 'search suspect', done: Boolean(f.eddieSearched) },
        { label: 'Read Miranda', command: 'read miranda', done: Boolean(f.eddieMiranda) },
        { label: 'Search Trunk', command: 'search trunk', done: Boolean(f.trunkSearched) },
        { label: 'Bag Evidence', command: 'bag evidence', done: Boolean(f.baggedRourkeEvidence) },
      ]);
    case 'interrogation_room':
      return prioritize([
        { label: 'Turn On Recorder', command: 'turn on recorder', done: Boolean(f.recorderOn) },
        { label: 'Read Miranda', command: 'read miranda', done: Boolean(f.eddieMiranda) },
        { label: 'Show Drugs', command: 'show drugs', done: Boolean(f.showedDrugs) },
        { label: 'Show Pager', command: 'show pager', done: Boolean(f.showedPager) },
      ]);
    case 'motel_exterior':
      return prioritize([
        { label: 'Radio 10-97', command: 'radio 10-97', done: Boolean(f.called1097) },
        { label: 'Inspect Door', command: 'inspect door', done: Boolean(f.inspectedMotelDoor) },
        { label: 'Stand Aside', command: 'stand aside', done: Boolean(f.stoodAside) },
        { label: 'Knock Door', command: 'knock door', done: Boolean(f.survivedTrap) },
      ]);
    case 'motel_alley':
      return prioritize([
        { label: 'Pursue Marco', command: 'pursue marco', done: Boolean(f.corneredMarco) },
        { label: 'Cuff Marco', command: 'cuff marco', done: Boolean(f.marcoCuffed) },
        { label: 'Read Miranda', command: 'read miranda', done: Boolean(f.marcoMiranda) },
      ]);
    case 'motel_lab':
      return prioritize([
        { label: 'Inspect Table', command: 'inspect table', done: Boolean(f.inspectedTable) },
        { label: 'Dust Safe', command: 'dust safe', done: Boolean(f.dustedSafe) },
        { label: 'Lift Prints', command: 'lift prints', done: Boolean(f.liftedPrints) },
        { label: 'Compare Prints', command: 'compare prints', done: Boolean(f.comparedPrints) },
        { label: 'Open Safe', command: 'open safe', done: Boolean(f.openedSafe) },
        { label: 'Decode Ledger', command: 'decode ledger', done: Boolean(f.decodedLedger) },
      ]);
    case 'pier84_exterior':
      return prioritize([
        { label: 'Radio SWAT', command: 'radio swat', done: Boolean(f.swatCalled) },
        { label: 'Cut Wires', command: 'cut wires', done: Boolean(f.alarmDisabled) },
        { label: 'Signal Breach', command: 'signal breach', done: Boolean(f.breachedPier) },
      ]);
    case 'pier84_interior':
      return prioritize([
        { label: 'Take Cover', command: 'take cover', done: Boolean(f.pierCover) },
        { label: 'Police Freeze', command: 'shout police freeze', done: Boolean(f.announcedPolice) },
        { label: 'Return Fire', command: 'return fire', done: Boolean(f.enforcerDown) },
      ]);
    case 'pier84_office':
      return prioritize([
        { label: 'Order Drop Gun', command: 'order drop gun', done: Boolean(f.castellanoDisarmed) },
        { label: 'Holster', command: 'holster weapon', done: Boolean(f.castellanoCuffed || (f.castellanoDisarmed && !f.weaponDrawn)) },
        { label: 'Cuff Castellano', command: 'cuff castellano', done: Boolean(f.castellanoCuffed) },
        { label: 'Read Miranda', command: 'read miranda', done: Boolean(f.castellanoMiranda) },
        { label: 'Bag Ledger', command: 'bag ledger', done: Boolean(f.hasMasterLedger) },
        { label: 'Inspect Desk', command: 'inspect desk', done: Boolean(f.inspectedBossDesk) },
        { label: 'Talk Castellano', command: 'talk castellano', done: Boolean(f.castellanoConfessed) },
        { label: 'Go Street', command: 'go street', done: false },
      ]);
    case 'pier84_street_twist':
      return [{ label: 'Look Street', command: 'look street' }];
    default:
      return [{ label: 'Final Score', command: 'score' }];
  }
}
