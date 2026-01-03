import Phaser from 'phaser';
import { BattleScene } from './view/scenes/BattleScene.js';
import { OPCODE_BINARY } from './vm/InstructionSet.js';
import { SimpleCompiler } from './vm/SimpleCompiler.js';
import { Tokenizer } from './vm/Tokenizer.js';
import { Parser } from './vm/Parser.js';

const config = {
    type: Phaser.AUTO,
    width: 640,
    height: 400,
    parent: 'game-container',
    backgroundColor: '#000000',
    scene: [BattleScene]
};

const game = new Phaser.Game(config);

// DOM Elements
const btnRun = document.getElementById('btn-run');
const btnStop = document.getElementById('btn-stop');
const btnStep = document.getElementById('btn-step');
const btnFf = document.getElementById('btn-ff');
const btnReset = document.getElementById('btn-reset');
const levelSelect = document.getElementById('level-select');

const scriptP1 = document.getElementById('p1-script');
const scriptP2 = document.getElementById('p2-script');

const selP1 = document.getElementById('p1-strategy');
const selP2 = document.getElementById('p2-strategy');

const btnCompileP1 = document.getElementById('p1-compile');
const btnCompileP2 = document.getElementById('p2-compile');

const viewerP1 = document.getElementById('p1-viewer');
const viewerP2 = document.getElementById('p2-viewer');

const machineP1 = document.getElementById('p1-machine');
const machineP2 = document.getElementById('p2-machine');

// Compiler & Parser
const compiler = new SimpleCompiler();
const tokenizer = new Tokenizer();
const parser = new Parser();

// Strategies
const STRATEGIES = {
    HUNTER: `# --- Hunter ---
# Ping for enemy, chase them, scan and destroy
var5 = 0
while var5 == var5:
  ping(var0, var1)

  # First align X position with enemy
  if posx < var0:
    # Enemy is to the East
    if dir != 0:
      turn_right
    else:
      move
    end
  else:
    if posx > var0:
      # Enemy is to the West
      if dir != 2:
        turn_left
      else:
        move
      end
    else:
      # Same X - align Y
      if posy < var1:
        # Enemy is South
        if dir != 1:
          turn_right
        else:
          scan(var2, var3)
          if var3 == 2:
            fire
          else:
            move
          end
        end
      else:
        if posy > var1:
          # Enemy is North
          if dir != 3:
            turn_left
          else:
            scan(var2, var3)
            if var3 == 2:
              fire
            else:
              move
            end
          end
        else:
          # On top of enemy? Spin and fire!
          turn_right
          fire
        end
      end
    end
  end
end`,

    VERTICAL_SCANNER: `# --- Vertical Scanner ---
# Patrol up/down, scan horizontally, fire when enemy spotted
var5 = 0
var4 = 0

while var5 == var5:
  # Face East to scan
  if dir != 0:
    turn_right
  else:
    scan(var0, var1)
    if var1 == 2:
      fire
    else:
      # Move vertically
      if var4 == 0:
        # Moving South
        if dir != 1:
          turn_right
        else:
          if posy > 8:
            var4 = 1
          else:
            move
          end
        end
      else:
        # Moving North
        if dir != 3:
          turn_left
        else:
          if posy < 1:
            var4 = 0
          else:
            move
          end
        end
      end
    end
  end
end`,

    CORNER_SNIPER: `# --- Corner Sniper ---
# Go to top-left corner, scan East and South, wait between shots
var5 = 0
while var5 == var5:
  # Get to corner first
  if posx > 1:
    if dir != 2:
      turn_left
    else:
      move
    end
  else:
    if posy > 1:
      if dir != 3:
        turn_left
      else:
        move
      end
    else:
      # In corner! Alternate scanning East and South
      if var5 == 0:
        if dir != 0:
          turn_right
        else:
          scan(var0, var1)
          if var1 == 2:
            fire
            wait
          end
          var5 = 1
        end
      else:
        if dir != 1:
          turn_right
        else:
          scan(var0, var1)
          if var1 == 2:
            fire
            wait
          end
          var5 = 0
        end
      end
    end
  end
end`,

    ZIGZAG: `# --- Zigzag Charger ---
# Charge forward in zigzag pattern, fire often
var0 = 3
var1 = 0
var5 = 0

while var5 == var5:
  # Scan ahead
  scan(var2, var3)
  if var3 == 2:
    fire
  else:
    if var3 == 1:
      # Wall ahead - turn around
      turn_right
      turn_right
    else:
      # Zigzag movement
      if var1 == 0:
        turn_left
        move
        turn_right
        move
        var0 = var0 - 1
        if var0 == 0:
          var1 = 1
          var0 = 3
        end
      else:
        turn_right
        move
        turn_left
        move
        var0 = var0 - 1
        if var0 == 0:
          var1 = 0
          var0 = 3
        end
      end
    end
  end
end`,

    PATROL: `# --- Patrol Bot ---
# Move in a square pattern, scan at each corner
var0 = 4
var5 = 0

while var5 == var5:
  scan(var1, var2)
  if var2 == 2:
    fire
  else:
    if var2 == 1:
      # Wall - turn and continue
      turn_right
      var0 = 4
    else:
      if var0 > 0:
        move
        var0 = var0 - 1
      else:
        turn_right
        var0 = 4
      end
    end
  end
end`,

    STALKER: `# --- Stalker ---
# Follow enemy, keep scanning and shooting
var5 = 0
while var5 == var5:
  # Scan first - if enemy visible, shoot!
  scan(var2, var3)
  if var3 == 2:
    fire
  else:
    # Ping to find enemy
    ping(var0, var1)

    # Move towards enemy X
    if posx < var0:
      # Enemy is East
      if dir == 0:
        move
      else:
        turn_right
      end
    else:
      if posx > var0:
        # Enemy is West
        if dir == 2:
          move
        else:
          turn_left
        end
      else:
        # Same X, move towards Y
        if posy < var1:
          # Enemy is South
          if dir == 1:
            move
          else:
            turn_right
          end
        else:
          if posy > var1:
            # Enemy is North
            if dir == 3:
              move
            else:
              turn_left
            end
          else:
            # Same position - spin!
            turn_right
          end
        end
      end
    end
  end
end`
};

// Initial Load
scriptP1.value = STRATEGIES.HUNTER;
scriptP2.value = STRATEGIES.STALKER;

// Strategy Selectors
selP1.addEventListener('change', () => {
    if (STRATEGIES[selP1.value]) scriptP1.value = STRATEGIES[selP1.value];
});

selP2.addEventListener('change', () => {
    if (STRATEGIES[selP2.value]) scriptP2.value = STRATEGIES[selP2.value];
});

// UI Updater
const REGISTERS = ['PC', 'ACC', 'CMP', 'R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'PX', 'PY', 'DIR', 'HP', 'AMMO'];

// Error Helper
function showError(prefix, msg) {
    const el = document.getElementById(prefix.toLowerCase() + '-error');
    if (el) {
        el.textContent = msg;
        el.style.display = 'block';
    }
}

function clearError(prefix) {
    const el = document.getElementById(prefix.toLowerCase() + '-error');
    if (el) {
        el.style.display = 'none';
        el.textContent = '';
    }
}

// Compile a single player's script
function compilePlayer(prefix, scriptEl, viewerEl, machineEl) {
    clearError(prefix);
    try {
        const asm = compiler.compile(scriptEl.value);
        const tokens = tokenizer.tokenize(asm);
        const { program, labels, error } = parser.parse(tokens);

        if (error) throw new Error(error);

        renderAssembly(viewerEl, program);
        renderMachineCode(machineEl, program);

        return { asm, program, labels };
    } catch (e) {
        showError(prefix, `Compile Error: ${e.message}`);
        return null;
    }
}

// Compile button handlers
btnCompileP1.addEventListener('click', () => {
    compilePlayer('P1', scriptP1, viewerP1, machineP1);
});

btnCompileP2.addEventListener('click', () => {
    compilePlayer('P2', scriptP2, viewerP2, machineP2);
});

btnRun.addEventListener('click', () => {
    clearError('P1');
    clearError('P2');
    try {
        // Compile TankScript to Assembly
        const p1Asm = compiler.compile(scriptP1.value);
        const p2Asm = compiler.compile(scriptP2.value);

        // Parse to get program for display
        const p1Tokens = tokenizer.tokenize(p1Asm);
        const p2Tokens = tokenizer.tokenize(p2Asm);
        const p1Result = parser.parse(p1Tokens);
        const p2Result = parser.parse(p2Tokens);

        if (p1Result.error) throw new Error('P1 Error: ' + p1Result.error);
        if (p2Result.error) throw new Error('P2 Error: ' + p2Result.error);

        // Render assembly and machine code
        renderAssembly(viewerP1, p1Result.program);
        renderAssembly(viewerP2, p2Result.program);
        renderMachineCode(machineP1, p1Result.program);
        renderMachineCode(machineP2, p2Result.program);

        const event = new CustomEvent('run-sim', {
            detail: {
                p1Code: p1Asm,
                p2Code: p2Asm,
                level: parseInt(levelSelect.value)
            }
        });
        window.dispatchEvent(event);
    } catch (e) {
        // If P1 failed, show P1 error, etc.
        // Simple heuristic: if message starts with P1 or P2
        if (e.message.startsWith('P1')) showError('P1', e.message);
        else if (e.message.startsWith('P2')) showError('P2', e.message);
        else alert(e.message); // Fallback
    }
});

btnStop.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('stop-sim'));
});

// Listen for halt state changes
window.addEventListener('halt-state', (e) => {
    if (e.detail.halted) {
        btnStop.classList.add('active');
    } else {
        btnStop.classList.remove('active');
    }
});

btnStep.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('step-sim'));
});

// Track if simulation has been started (not reset)
let simStarted = false;
window.addEventListener('sim-started', () => { simStarted = true; });
window.addEventListener('reset-sim', () => { simStarted = false; });

btnFf.addEventListener('click', () => {
    if (!simStarted) {
        // Start the simulation first, then FF
        btnRun.click();
    }
    window.dispatchEvent(new CustomEvent('ff-sim'));
});

btnReset.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('reset-sim', {
        detail: { level: parseInt(levelSelect.value) }
    }));
});

levelSelect.addEventListener('change', () => {
    window.dispatchEvent(new CustomEvent('reset-sim', {
        detail: { level: parseInt(levelSelect.value) }
    }));
});

window.addEventListener('update-ui', (e) => {
    const state = e.detail;
    updateCPU('p1', state.tanks.P1);
    updateCPU('p2', state.tanks.P2);
});

// Handle Sim Start (Show Bytecode View)
window.addEventListener('sim-started', (e) => {
    const { p1Program, p2Program } = e.detail;
    renderAssembly(viewerP1, p1Program);
    renderAssembly(viewerP2, p2Program);
    renderMachineCode(machineP1, p1Program);
    renderMachineCode(machineP2, p2Program);
});

function renderAssembly(viewer, program) {
    viewer.innerHTML = '';

    program.forEach((inst, index) => {
        const row = document.createElement('div');
        row.className = 'asm-line';
        row.id = viewer.id.replace('viewer', 'asm-line') + '-' + index;

        const addr = document.createElement('span');
        addr.className = 'asm-addr';
        addr.textContent = index.toString(16).padStart(2, '0').toUpperCase();

        const text = document.createElement('span');
        text.className = 'asm-instr';
        let args = inst.args.join(', ');
        text.textContent = `${inst.opcode} ${args}`;

        row.appendChild(addr);
        row.appendChild(text);
        viewer.appendChild(row);
    });
}

function renderMachineCode(container, program) {
    container.innerHTML = '';

    program.forEach((inst, index) => {
        const row = document.createElement('div');
        row.className = 'machine-line';
        row.id = container.id + '-line-' + index;

        const addr = document.createElement('span');
        addr.className = 'machine-addr';
        addr.textContent = index.toString(16).padStart(2, '0').toUpperCase();

        const opByte = OPCODE_BINARY[inst.opcode] || 0;

        // Build hex representation
        const hex = document.createElement('span');
        hex.className = 'machine-hex';
        hex.textContent = opByte.toString(16).padStart(2, '0').toUpperCase();

        // Build binary representation
        const bin = document.createElement('span');
        bin.className = 'machine-bin';
        bin.textContent = opByte.toString(2).padStart(8, '0');

        row.appendChild(addr);
        row.appendChild(hex);
        row.appendChild(bin);
        container.appendChild(row);
    });
}

function updateCPU(prefix, tankData) {
    if (!tankData || !tankData.debugRegisters) return;

    // Update Status Line
    const statusEl = document.getElementById(`${prefix}-status`);
    if (statusEl) {
        let statusText = 'IDLE';
        let color = '#aaa';

        if (tankData.hp <= 0) {
            statusText = 'DESTROYED';
            color = '#f00';
        } else if (tankData.lastFeedback) {
            // High-level feedback (e.g. RELOADING, BLOCKED)
            statusText = `FAIL (${tankData.lastFeedback})`;
            color = '#f66'; // Red-ish
        } else if (tankData.lastAction) {
            statusText = tankData.lastAction;
            color = '#4f4'; // Green
        }

        statusEl.textContent = statusText;
        statusEl.style.color = color;
    }

    const regs = tankData.debugRegisters;

    REGISTERS.forEach(reg => {
        const val = regs[reg];
        const el = document.getElementById(`${prefix}-${reg}`);
        if (el) el.textContent = val;

        const binEl = document.getElementById(`${prefix}-${reg}-bin`);
        if (binEl) {
            binEl.textContent = (val & 0xFF).toString(2).padStart(8, '0');
        }
    });

    const irEl = document.getElementById(`${prefix}-IR`);
    const irBinEl = document.getElementById(`${prefix}-IR-bin`);

    if (irEl) {
        const irText = tankData.debugIR || '-';
        irEl.textContent = irText;

        if (irBinEl) {
            if (irText === '-' || irText === 'HALT') {
                irBinEl.textContent = '00000000';
            } else {
                const opcode = irText.split(' ')[0];
                const binVal = OPCODE_BINARY[opcode] || 0;
                irBinEl.textContent = binVal.toString(2).padStart(8, '0');
            }
        }
    }

    // Highlight current PC in assembly viewer
    const highlightPC = (tankData.debugPC !== undefined) ? tankData.debugPC : regs.PC;
    const viewer = document.getElementById(`${prefix}-viewer`);
    const oldActiveAsm = viewer.querySelector('.active');
    if (oldActiveAsm) oldActiveAsm.classList.remove('active');

    const newActiveAsm = document.getElementById(`${prefix}-asm-line-${highlightPC}`);
    if (newActiveAsm) {
        newActiveAsm.classList.add('active');
        newActiveAsm.scrollIntoView({ block: 'nearest' });
    }

    // Highlight current PC in machine code viewer
    const machine = document.getElementById(`${prefix}-machine`);
    const oldActiveMachine = machine.querySelector('.active');
    if (oldActiveMachine) oldActiveMachine.classList.remove('active');

    const newActiveMachine = document.getElementById(`${prefix}-machine-line-${highlightPC}`);
    if (newActiveMachine) {
        newActiveMachine.classList.add('active');
        newActiveMachine.scrollIntoView({ block: 'nearest' });
    }
}