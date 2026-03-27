// ─── State ───────────────────────────────────────────────────────────────────
let numPlayers = 0;
let numBits = 8;

let aliceBits  = [];
let aliceBases = [];
let eveBases   = [];
let bobBases   = [];

// Derived
let aliceStates  = [];  // |0⟩ |1⟩ |+⟩ |−⟩
let eveMeasured  = [];  // bits Eve measured
let eveForwarded = [];  // states Eve forwards to Bob
let bobMeasured  = [];  // bits Bob measured

const STATES = {
  '0Z': '|0⟩',
  '1Z': '|1⟩',
  '0X': '|+⟩',
  '1X': '|−⟩',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function rand(n)    { return Math.floor(Math.random() * n); }
function randBit()  { return rand(2); }
function randBase() { return rand(2) === 0 ? 'Z' : 'X'; }

// ─── Player Selection ─────────────────────────────────────────────────────────
function selectPlayers(n) {
  numPlayers = n;
  document.querySelectorAll('.player-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('pc' + n).classList.add('selected');
  document.getElementById('startBtn').disabled = false;
}

// ─── Start Game ───────────────────────────────────────────────────────────────
function startGame() {
  numBits = parseInt(document.getElementById('numBits').value);
  if (numBits < 4)  numBits = 4;
  if (numBits > 20) numBits = 20;

  // Initialise arrays based on player count
  aliceBits  = Array.from({ length: numBits }, () => numPlayers >= 1 ? 0 : randBit());
  aliceBases = Array.from({ length: numBits }, () => numPlayers >= 1 ? 'Z' : randBase());
  eveBases   = Array.from({ length: numBits }, () => numPlayers >= 3 ? 'Z' : randBase());
  bobBases   = Array.from({ length: numBits }, () => numPlayers >= 2 ? 'Z' : randBase());

  // For solo play, give Alice a random starting point she can edit
  if (numPlayers === 1) {
    aliceBits  = Array.from({ length: numBits }, () => randBit());
    aliceBases = Array.from({ length: numBits }, () => randBase());
  }

  document.getElementById('screen-players').style.display = 'none';
  document.getElementById('screen-game').style.display = 'block';

  buildProgress();
  goToAlice();
}

// ─── Progress Tracker ─────────────────────────────────────────────────────────
function buildProgress() {
  const steps = [
    { label: 'ALICE', cls: 'alice' },
    { label: 'EVE',   cls: 'eve'   },
    { label: 'BOB',   cls: 'bob'   },
    { label: 'SIFT',  cls: 'alice' },
  ];
  const track = document.getElementById('progressTrack');
  track.innerHTML = '';

  steps.forEach((s, i) => {
    const node = document.createElement('div');
    node.className = 'prog-node';
    node.id = 'pnode' + i;
    node.innerHTML = `
      <div class="prog-circle" id="pcircle${i}">${i + 1}</div>
      <div class="prog-label"  id="plabel${i}">${s.label}</div>
    `;
    track.appendChild(node);

    if (i < steps.length - 1) {
      const line = document.createElement('div');
      line.className = 'prog-line';
      line.id = 'pline' + i;
      track.appendChild(line);
    }
  });
}

function setProgress(activeStep) {
  const clsMap = ['alice', 'eve', 'bob', 'alice'];

  for (let i = 0; i < 4; i++) {
    const c = document.getElementById('pcircle' + i);
    const l = document.getElementById('plabel' + i);
    c.className = 'prog-circle';
    l.className = 'prog-label';

    if (i < activeStep) {
      c.classList.add(clsMap[i] + '-done', 'done');
    } else if (i === activeStep) {
      c.classList.add(clsMap[i] + '-active');
      l.classList.add(clsMap[i] + '-active');
    }

    const line = document.getElementById('pline' + i);
    if (line) line.className = 'prog-line' + (i < activeStep ? ' lit' : '');
  }
}

// ─── Step Navigation ──────────────────────────────────────────────────────────
function showStep(id) {
  document.querySelectorAll('.step-section').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function goToAlice() {
  setProgress(0);
  buildAliceUI();
  showStep('step-alice');
}

function goToEve() {
  computeAliceStates();
  updateAliceStatesDisplay();

  if (numPlayers < 3) {
    eveBases = Array.from({ length: numBits }, () => randBase());
    document.getElementById('eve-auto-note').innerHTML =
      '<span class="auto-badge">AUTO-GENERATED</span>';
  } else {
    document.getElementById('eve-auto-note').innerHTML = '';
  }

  computeEveMeasurements();
  setProgress(1);
  buildEveUI();
  showStep('step-eve');
}

function goToBob() {
  computeEveMeasurements();

  if (numPlayers < 2) {
    bobBases = Array.from({ length: numBits }, () => randBase());
    document.getElementById('bob-auto-note').innerHTML =
      '<span class="auto-badge">AUTO-GENERATED</span>';
  } else {
    document.getElementById('bob-auto-note').innerHTML = '';
  }

  computeBobMeasurements();
  setProgress(2);
  buildBobUI();
  showStep('step-bob');
}

function goToSift() {
  computeBobMeasurements();
  setProgress(3);
  buildResults();
  showStep('step-results');
}

// ─── Quantum Computations ─────────────────────────────────────────────────────
function computeAliceStates() {
  aliceStates = aliceBits.map((b, i) => STATES[b + aliceBases[i]]);
}

/**
 * Simulates measuring a qubit in a given basis.
 * Correct basis → deterministic result.
 * Wrong basis   → random result (mimics quantum randomness).
 */
function measureQubit(sentState, measBasis) {
  const stateMap = {
    '|0⟩': { b: 0, bs: 'Z' },
    '|1⟩': { b: 1, bs: 'Z' },
    '|+⟩': { b: 0, bs: 'X' },
    '|−⟩': { b: 1, bs: 'X' },
  };
  const orig = stateMap[sentState];
  return orig.bs === measBasis ? orig.b : randBit();
}

function computeEveMeasurements() {
  computeAliceStates();
  eveMeasured  = [];
  eveForwarded = [];

  for (let i = 0; i < numBits; i++) {
    const measured = measureQubit(aliceStates[i], eveBases[i]);
    eveMeasured.push(measured);
    // Eve re-prepares the qubit in her own basis before forwarding
    eveForwarded.push(STATES[measured + eveBases[i]]);
  }
}

function computeBobMeasurements() {
  computeEveMeasurements();
  bobMeasured = [];
  for (let i = 0; i < numBits; i++) {
    bobMeasured.push(measureQubit(eveForwarded[i], bobBases[i]));
  }
}

// ─── Alice UI ─────────────────────────────────────────────────────────────────
function buildAliceUI() {
  computeAliceStates();
  const isEditable = numPlayers >= 1;

  // Bits
  const bitsEl = document.getElementById('aliceBits');
  bitsEl.innerHTML = '';
  aliceBits.forEach((b, i) => {
    const cell = document.createElement('div');
    cell.className = `bit-cell alice-bit-${b}${!isEditable ? ' readonly' : ''}`;
    cell.textContent = b;
    cell.title = `Bit ${i}: ${b}`;
    if (isEditable) {
      cell.onclick = () => { aliceBits[i] ^= 1; buildAliceUI(); };
    }
    bitsEl.appendChild(cell);
  });

  // Bases
  const basesEl = document.getElementById('aliceBases');
  basesEl.innerHTML = '';
  aliceBases.forEach((b, i) => {
    const cell = document.createElement('div');
    cell.className = `bit-cell alice-base-${b}${!isEditable ? ' readonly' : ''}`;
    cell.textContent = b;
    cell.title = `Basis ${i}: ${b === 'Z' ? 'Rectilinear ✚' : 'Diagonal ✕'}`;
    if (isEditable) {
      cell.onclick = () => { aliceBases[i] = aliceBases[i] === 'Z' ? 'X' : 'Z'; buildAliceUI(); };
    }
    basesEl.appendChild(cell);
  });

  updateAliceStatesDisplay();
}

function updateAliceStatesDisplay() {
  computeAliceStates();
  const el = document.getElementById('aliceStates');
  el.innerHTML = '';
  aliceStates.forEach((s, i) => {
    const cell = document.createElement('div');
    cell.className = `bit-cell state alice-base-${aliceBases[i]} readonly`;
    cell.textContent = s;
    cell.title = `Qubit ${i}: ${s}`;
    el.appendChild(cell);
  });
}

function randomizeAlice() {
  aliceBits  = Array.from({ length: numBits }, () => randBit());
  aliceBases = Array.from({ length: numBits }, () => randBase());
  buildAliceUI();
}

// ─── Eve UI ───────────────────────────────────────────────────────────────────
function buildEveUI() {
  const isEditable = numPlayers >= 3;

  // Bases
  const basesEl = document.getElementById('eveBases');
  basesEl.innerHTML = '';
  eveBases.forEach((b, i) => {
    const cell = document.createElement('div');
    cell.className = `bit-cell eve-base-${b}${!isEditable ? ' readonly' : ''}`;
    cell.textContent = b;
    if (isEditable) {
      cell.onclick = () => {
        eveBases[i] = eveBases[i] === 'Z' ? 'X' : 'Z';
        computeEveMeasurements();
        buildEveUI();
      };
    }
    basesEl.appendChild(cell);
  });

  // Measured bits
  const measEl = document.getElementById('eveMeasured');
  measEl.innerHTML = '';
  eveMeasured.forEach((b, i) => {
    const matchAlice = eveBases[i] === aliceBases[i];
    const cell = document.createElement('div');
    cell.className = `bit-cell readonly ${matchAlice ? 'alice-bit-' + b : 'disturbed'}`;
    cell.textContent = b;
    cell.title = matchAlice ? '✓ Correct basis' : '⚠ Wrong basis — random result';
    measEl.appendChild(cell);
  });

  // Forwarded states
  const fwdEl = document.getElementById('eveForwarded');
  fwdEl.innerHTML = '';
  eveForwarded.forEach((s, i) => {
    const matchAlice = eveBases[i] === aliceBases[i];
    const cell = document.createElement('div');
    cell.className = `bit-cell state readonly ${matchAlice ? 'alice-base-' + eveBases[i] : 'disturbed'}`;
    cell.textContent = s;
    cell.title = matchAlice ? 'Correct state forwarded' : '⚠ Disturbed state forwarded';
    fwdEl.appendChild(cell);
  });
}

function randomizeEve() {
  eveBases = Array.from({ length: numBits }, () => randBase());
  computeEveMeasurements();
  buildEveUI();
}

// ─── Bob UI ───────────────────────────────────────────────────────────────────
function buildBobUI() {
  const isEditable = numPlayers >= 2;
  computeBobMeasurements();

  // Bases
  const basesEl = document.getElementById('bobBases');
  basesEl.innerHTML = '';
  bobBases.forEach((b, i) => {
    const cell = document.createElement('div');
    cell.className = `bit-cell bob-base-${b}${!isEditable ? ' readonly' : ''}`;
    cell.textContent = b;
    if (isEditable) {
      cell.onclick = () => {
        bobBases[i] = bobBases[i] === 'Z' ? 'X' : 'Z';
        computeBobMeasurements();
        buildBobUI();
      };
    }
    basesEl.appendChild(cell);
  });

  // Measured bits
  const measEl = document.getElementById('bobMeasured');
  measEl.innerHTML = '';
  bobMeasured.forEach((b, i) => {
    const matchAlice = bobBases[i] === aliceBases[i];
    const cell = document.createElement('div');
    cell.className = `bit-cell readonly bob-base-${bobBases[i]} ${matchAlice ? '' : 'mismatch'}`;
    cell.textContent = b;
    cell.title = matchAlice ? '✓ Same basis as Alice' : '✗ Different basis — discarded';
    measEl.appendChild(cell);
  });
}

function randomizeBob() {
  bobBases = Array.from({ length: numBits }, () => randBase());
  computeBobMeasurements();
  buildBobUI();
}

// ─── Results & Sifting ────────────────────────────────────────────────────────
function buildResults() {
  computeBobMeasurements();

  const tbody = document.getElementById('resultBody');
  tbody.innerHTML = '';

  let aliceKeyBits = [];
  let bobKeyBits   = [];
  let errors       = 0;
  let siftedCount  = 0;
  let eveMatches   = 0;

  for (let i = 0; i < numBits; i++) {
    const basesMatch = aliceBases[i] === bobBases[i];
    const eveMatch   = eveBases[i]   === aliceBases[i];
    const correct    = aliceBits[i]  === bobMeasured[i];
    if (eveMatch) eveMatches++;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="color:var(--muted);font-size:0.7rem">${i + 1}</td>
      <td class="col-alice">${aliceBits[i]}</td>
      <td class="col-alice">${aliceBases[i]}</td>
      <td class="col-alice" style="font-size:1.1rem">${aliceStates[i]}</td>
      <td class="${eveMatch ? 'col-eve' : ''}" style="${!eveMatch ? 'color:rgba(255,58,110,0.5)' : ''}">${eveBases[i]}</td>
      <td class="${eveMatch ? 'col-eve' : ''}" style="${!eveMatch ? 'color:rgba(255,58,110,0.5)' : ''}">${eveMeasured[i]}</td>
      <td class="${basesMatch ? 'col-bob' : 'col-mismatch'}">${bobBases[i]}</td>
      <td class="${basesMatch ? (correct ? 'col-bob' : 'col-eve') : 'col-mismatch'}">${bobMeasured[i]}</td>
      <td>${basesMatch
        ? '<span style="color:var(--gold)">✓</span>'
        : '<span style="color:var(--muted);opacity:0.4">✗</span>'
      }</td>
      <td>${basesMatch
        ? `<span class="${correct ? 'col-key' : 'col-eve'}">${aliceBits[i]}${!correct ? '⚠' : ''}</span>`
        : '<span class="col-discard">—</span>'
      }</td>
    `;
    tbody.appendChild(tr);

    if (basesMatch) {
      siftedCount++;
      aliceKeyBits.push(aliceBits[i]);
      bobKeyBits.push(bobMeasured[i]);
      if (!correct) errors++;
    }
  }

  // Stats row
  const statsEl = document.getElementById('statsRow');
  const errorRate = siftedCount > 0 ? ((errors / siftedCount) * 100).toFixed(0) : 0;
  statsEl.innerHTML = `
    <div class="stat-pill alice-stat"><span class="stat-num">${numBits}</span> Total Qubits</div>
    <div class="stat-pill gold-stat"><span class="stat-num">${siftedCount}</span> Sifted Bits</div>
    <div class="stat-pill eve-stat"><span class="stat-num">${errors}</span> Errors (Eve Noise)</div>
    <div class="stat-pill bob-stat"><span class="stat-num">${eveMatches}/${numBits}</span> Eve Basis Hits</div>
    <div class="stat-pill ${errors > 0 ? 'eve-stat' : 'bob-stat'}">
      <span class="stat-num">${errorRate}%</span> Error Rate
    </div>
  `;

  // Alice's key
  document.getElementById('aliceKey').textContent = aliceKeyBits.length > 0
    ? aliceKeyBits.join(' ')
    : '(no matching bases)';

  // Bob's key — highlight any errors in red
  const bobKeyEl = document.getElementById('bobKey');
  if (aliceKeyBits.length > 0) {
    bobKeyEl.innerHTML = bobKeyBits.map((b, i) =>
      b !== aliceKeyBits[i]
        ? `<span style="color:var(--eve);text-decoration:underline">${b}</span>`
        : b
    ).join(' ');
  } else {
    bobKeyEl.textContent = '(no matching bases)';
  }

  // Eavesdropping alert
  const alertEl = document.getElementById('eveAlert');
  if (siftedCount === 0) {
    alertEl.innerHTML = `
      <div class="alert alert-info">
        <strong>⚠ NO SIFTED KEY</strong><br>
        No basis matches found. Try again with more bits or different bases.
      </div>`;
  } else if (errors === 0) {
    alertEl.innerHTML = `
      <div class="alert alert-success">
        <strong>✓ CHANNEL APPEARS SECURE</strong><br>
        No errors detected in the sifted key. Eve either wasn't eavesdropping,
        or got lucky with ${eveMatches} basis match${eveMatches !== 1 ? 'es' : ''} out of ${numBits}.
        In practice, Alice and Bob sacrifice a portion of the sifted key to verify
        statistically — a 25% error rate signals eavesdropping.
      </div>`;
  } else {
    alertEl.innerHTML = `
      <div class="alert alert-warning">
        <strong>⚠ EAVESDROPPING DETECTED</strong><br>
        ${errors} error${errors !== 1 ? 's' : ''} found in ${siftedCount} sifted bits
        (${errorRate}% error rate).
        The no-cloning theorem means Eve's interception inevitably disturbed the quantum states.
        Alice and Bob should abort this key exchange and try again over a different channel.
      </div>`;
  }
}

// ─── Reset ────────────────────────────────────────────────────────────────────
function resetGame() {
  document.getElementById('screen-game').style.display = 'none';
  document.getElementById('screen-players').style.display = 'block';
  numPlayers = 0;
  document.querySelectorAll('.player-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('startBtn').disabled = true;
}

function showLoading() {
    // Show the loading screen
    document.getElementById("loading-screen").style.display = "block";

    // Animate the dots
    let dots = document.getElementById("dots");
    let count = 0;
    setInterval(() => {
        count = (count + 1) % 4; // cycles through 0–3
        dots.textContent = ".".repeat(count);
    }, 500);

    // After 3 seconds, go to the game page
    setTimeout(() => {
        window.location.href = "bb84.html"; // replace with your actual game page
    }, 3000);
}
