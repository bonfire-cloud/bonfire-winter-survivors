/* Notepad mock app — registered in the shell's BF.Apps registry. */
(function () {
  const BF = (globalThis.BF = globalThis.BF || {});

  const NOTE_TEXT = [
    'BONFIRE: WINTER SURVIVORS - readme.txt',
    '========================================',
    '',
    'The bonfire is the whole game.',
    'Its light radius is your safe zone.',
    'A big fire keeps the beasts back but burns',
    'wood fast and is visible from the castle.',
    '',
    'By day: send survivors to Wood / Hunt / Scout.',
    'Woodcutters must reach an actual tree cell.',
    'By night: defend the ring of light. Click beasts.',
    'Carry embers to move camp. Death is permanent.',
    '',
    '486 DX/33 - 8 MB RAM - 4 MB VGA - CD-ROM',
    '(3dfx support sold separately, obviously)',
  ].join('\n');

  const HELP_TEXT = [
    'BONFIRE: WINTER SURVIVORS - Help',
    '=================================',
    '',
    'Keep the fire fed. Send woodcutters to tree cells by day.',
    'Defend the ring of light by night; click beasts to strike.',
    'Carry embers through the dark to move camp toward the castle.',
    'Fireside talk builds bonds. Blankets keep people warm.',
    'If all four die, the run is over. Seeds make every run different.',
  ].join('\n');

  BF.Apps.register('notepad', {
    title: 'Notepad',
    w: 460, h: 340, x: 140, y: 90,
    NOTE_TEXT, HELP_TEXT,
    open(text) {
      const w = BF.Desktop.openWindow('notepad', 'Untitled - Notepad', 460, 340, 140, 90, (win) => {
        const ta = BF.env.document.createElement('textarea');
        ta.className = 'nptext';
        ta.value = NOTE_TEXT;
        win.el.querySelector('.winclient').appendChild(ta);
        win._ta = ta;
      });
      w.el.querySelector('.wtitle').textContent = (text === HELP_TEXT ? 'Help - Notepad' : 'README.txt - Notepad');
      if (text !== undefined && w._ta) w._ta.value = text;
      return w;
    },
  });
})();
