/* Data-driven content: heroes, tasks, events, fireside conversations. */
(function () {
  const BF = (globalThis.BF = globalThis.BF || {});

  BF.DATA = {
    heroes: [
      { id: 'sword',   name: 'Aldric the Swordsman', role: 'Swordsman', hp: 120, atk: 18, color: '#9aa3b2' },
      { id: 'ranger',  name: 'Sylva the Ranger',     role: 'Ranger',    hp: 90,  atk: 14, color: '#c96f4a' },
      { id: 'rogue',   name: 'Vesper the Rogue',     role: 'Rogue',     hp: 80,  atk: 13, color: '#6a5a8a' },
      { id: 'trapper', name: 'Bram the Trapper',     role: 'Trapper',   hp: 100, atk: 11, color: '#8a6f4d' },
    ],

    tasks: [
      { id: 'wood',  label: 'Gather wood' },
      { id: 'hunt',  label: 'Hunt' },
      { id: 'scout', label: 'Scout toward the castle' },
      { id: 'rest',  label: 'Rest at camp' },
    ],

    /* Randomized event deck. when: which phase the event can fire in. */
    events: [
      { id: 'cache',    when: ['day', 'dusk'], text: "Bram finds a hunter's cache in the snow: +3 wood, +2 food.",
        apply(s) { s.inventory.wood += 3; s.inventory.food += 2; } },
      { id: 'wolves',   when: ['night'], text: 'Howling in the treeline. Something is already moving out there.',
        apply(s) { s._spawnBeast(); s._spawnBeast(); } },
      { id: 'stranger', when: ['dusk'], text: 'A stranger watches from the edge of the light, then melts into the trees. +1 food left behind.',
        apply(s) { s.inventory.food += 1; } },
      { id: 'storm',    when: ['night'], text: 'The wind picks up. The cold bites harder tonight.',
        apply(s) { s.storm = true; } },
      { id: 'argument', when: ['dusk', 'night'], text: 'Voices rise around the fire. Someone leaves the circle angry.',
        apply(s) {
          const alive = s.aliveHeroes();
          if (alive.length < 2) return;
          const a = s.rng.pick(alive), b = s.rng.pick(alive.filter(h => h !== a));
          a.bonds[b.id] = Math.max(-100, a.bonds[b.id] - 15);
          b.bonds[a.id] = Math.max(-100, b.bonds[a.id] - 15);
        } },
      { id: 'gift',     when: ['day'], text: 'Sylva trades with a passing trapper: +1 torch.',
        apply(s) { s.inventory.torches += 1; } },
      { id: 'injury',   when: ['night'], text: 'A beast lunges at the ring of light before it is driven off.',
        apply(s) {
          const alive = s.aliveHeroes();
          if (!alive.length) return;
          const h = s.rng.pick(alive);
          h.hp -= 15;
          s.say(h.name + ' is hurt (-15 hp).');
        } },
      { id: 'aurora',   when: ['night'], text: 'The sky burns green over the valley. For a moment, everyone hopes.',
        apply(s) { for (const h of s.aliveHeroes()) h.morale = Math.min(100, h.morale + 10); } },
      { id: 'eyes',     when: ['night'], text: 'Eyes. So many eyes in the treeline tonight.',
        apply(s) { s._spawnBeast(); } },
      { id: 'old_fire', when: ['dusk'], text: 'An old fire ring, long cold. Someone camped here before you. +2 wood.',
        apply(s) { s.inventory.wood += 2; } },
    ],

    /* Fireside conversations: bonds and grudges. */
    conversations: [
      { a: 'sword',   b: 'ranger',  delta: 12,  line: '{a}: "Watch the treeline." {b}: "I always do, Aldric."' },
      { a: 'rogue',   b: 'trapper', delta: -12, line: '{b}: "Your snares are sloppy, Bram." {a}: "And your manners are worse, Vesper."' },
      { a: 'sword',   b: 'rogue',   delta: -8,  line: '{a}: "I don\'t trust you in the dark." {b}: "You don\'t have to."' },
      { a: 'ranger',  b: 'trapper', delta: 10,  line: '{b}: "This valley used to be full of game. Now it\'s full of eyes." {a}: "Then we make our own."' },
      { a: 'sword',   b: 'trapper', delta: 8,   line: '{a}: "Keep the fire fed, Bram. Everyone\'s life is your woodpile."' },
      { a: 'ranger',  b: 'rogue',   delta: 6,   line: '{b}: "You laugh too loud at night. The eyes have ears." {a}: "Then I\'ll laugh quieter."' },
      { a: 'sword',   b: 'ranger',  delta: -15, line: '{a}: "You left me at the ridge, Sylva. I don\'t forget."' },
      { a: 'trapper', b: 'rogue',   delta: -10, line: '{a}: "Share your blanket or freeze alone." {b}: "Keep it. I sleep fine."' },
    ],
  };
})();
