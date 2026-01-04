import Phaser from 'phaser';
import { BattleScene } from './view/scenes/BattleScene.js';
import { OPCODE_BINARY } from './vm/InstructionSet.js';
import { SimpleCompiler } from './vm/SimpleCompiler.js';
import { Tokenizer } from './vm/Tokenizer.js';
import { Parser } from './vm/Parser.js';
import { BattleManager, TANK_IDS } from './simulation/BattleManager.js';

const config = {
    type: Phaser.AUTO,
    width: 640,
    height: 440,  // Extra 40px for title at top
    parent: 'game-container',
    backgroundColor: '#000000',
    pixelArt: true,
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        parent: 'game-container'
    },
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

// Assembly editor wrappers and components
const asmWrapperP1 = document.getElementById('p1-asm-wrapper');
const asmWrapperP2 = document.getElementById('p2-asm-wrapper');
const asmEditorP1 = document.getElementById('p1-asm-editor');
const asmEditorP2 = document.getElementById('p2-asm-editor');
const asmLinesP1 = document.getElementById('p1-asm-lines');
const asmLinesP2 = document.getElementById('p2-asm-lines');
const asmHighlightP1 = document.getElementById('p1-asm-highlight');
const asmHighlightP2 = document.getElementById('p2-asm-highlight');

// Script panels (for disabling in assembly mode)
const scriptPanelP1 = document.getElementById('p1-script-panel');
const scriptPanelP2 = document.getElementById('p2-script-panel');

// Editor mode state: 'tankscript' or 'assembly' per player
const editorModes = { p1: 'tankscript', p2: 'tankscript' };

// Track last compiled source to detect changes
let lastCompiledP1 = '';
let lastCompiledP2 = '';

// Compiler & Parser
const compiler = new SimpleCompiler();
const tokenizer = new Tokenizer();
const parser = new Parser();

// Strategies (Same as before)
const STRATEGIES = {
    HUNTER: `# --- Hunter ---
# Ping for enemy, chase them, scan and destroy
var5 = 0
loop:
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

loop:
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
loop:
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

loop:
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

loop:
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
loop:
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

// Simple starter scripts for beginners - also add to STRATEGIES
STRATEGIES.SIMPLE_SCOUT = `# Simple Scout - Patrol and Fire
# Scans ahead, fires if enemy, otherwise patrols

loop:
  # First check if enemy is ahead
  scan(var0, var1)

  if var1 == 2:
    fire
  else:
    # No enemy ahead - ping to find them
    ping(var2, var3)

    # Try to align with enemy
    if posx < var2:
      # Enemy is to the East
      if dir == 0:
        move
      else:
        turn_right
      end
    else:
      if posx > var2:
        # Enemy is to the West
        if dir == 2:
          move
        else:
          turn_left
        end
      else:
        # Same X - check Y
        if posy < var3:
          # Enemy is South
          if dir == 1:
            scan(var0, var1)
            if var1 == 2:
              fire
            else:
              move
            end
          else:
            turn_right
          end
        else:
          if posy > var3:
            # Enemy is North
            if dir == 3:
              scan(var0, var1)
              if var1 == 2:
                fire
              else:
                move
              end
            else:
              turn_left
            end
          else:
            # On same spot? Spin and fire
            turn_right
          end
        end
      end
    end
  end
end`;

STRATEGIES.SIMPLE_CHASER = `# Simple Chaser
# Uses ping to find and chase enemy

loop:
  # Ping to find enemy position
  ping(var0, var1)

  # Move towards enemy X position first
  if posx < var0:
    # Enemy is East
    if dir == 0:
      scan(var2, var3)
      if var3 == 2:
        fire
      else:
        move
      end
    else:
      turn_right
    end
  else:
    if posx > var0:
      # Enemy is West
      if dir == 2:
        scan(var2, var3)
        if var3 == 2:
          fire
        else:
          move
        end
      else:
        turn_left
      end
    else:
      # Same X - align Y
      if posy < var1:
        # Enemy is South
        if dir == 1:
          scan(var2, var3)
          if var3 == 2:
            fire
          else:
            move
          end
        else:
          turn_right
        end
      else:
        if posy > var1:
          # Enemy is North
          if dir == 3:
            scan(var2, var3)
            if var3 == 2:
              fire
            else:
              move
            end
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
end`;

// Initial Load - use simple scripts by default
scriptP1.value = STRATEGIES.SIMPLE_SCOUT;
scriptP2.value = STRATEGIES.SIMPLE_CHASER;

// Strategy Selectors
selP1.addEventListener('change', () => {
    if (STRATEGIES[selP1.value]) {
        scriptP1.value = STRATEGIES[selP1.value];
        // If in assembly mode, auto-compile to populate asm editor
        if (editorModes.p1 === 'assembly') {
            try {
                asmEditorP1.value = compiler.compile(scriptP1.value);
            } catch (e) {
                asmEditorP1.value = '; Compilation failed\nNOP';
            }
            updateAsmLineNumbers('p1');
        }
    }
});
selP2.addEventListener('change', () => {
    if (STRATEGIES[selP2.value]) {
        scriptP2.value = STRATEGIES[selP2.value];
        // If in assembly mode, auto-compile to populate asm editor
        if (editorModes.p2 === 'assembly') {
            try {
                asmEditorP2.value = compiler.compile(scriptP2.value);
            } catch (e) {
                asmEditorP2.value = '; Compilation failed\nNOP';
            }
            updateAsmLineNumbers('p2');
        }
    }
});

// --- Line Number Updates for ASM Editor ---
function updateAsmLineNumbers(prefix) {
    const asmEditor = prefix === 'p1' ? asmEditorP1 : asmEditorP2;
    const asmLines = prefix === 'p1' ? asmLinesP1 : asmLinesP2;

    const lines = asmEditor.value.split('\n');
    let html = '';
    for (let i = 0; i < lines.length; i++) {
        html += `<span class="ln" data-line="${i}">${(i).toString(16).padStart(2, '0').toUpperCase()}</span>`;
    }
    asmLines.innerHTML = html;
}

function syncAsmScroll(prefix) {
    const asmEditor = prefix === 'p1' ? asmEditorP1 : asmEditorP2;
    const asmLines = prefix === 'p1' ? asmLinesP1 : asmLinesP2;
    asmLines.scrollTop = asmEditor.scrollTop;
}

// Highlight PC line in ASM editor (assembly mode)
function updateAsmPCHighlight(prefix, pc) {
    const asmWrapper = prefix === 'p1' ? asmWrapperP1 : asmWrapperP2;
    const asmHighlight = prefix === 'p1' ? asmHighlightP1 : asmHighlightP2;
    const asmLines = prefix === 'p1' ? asmLinesP1 : asmLinesP2;
    const asmEditor = prefix === 'p1' ? asmEditorP1 : asmEditorP2;

    if (editorModes[prefix] !== 'assembly') {
        asmHighlight.style.display = 'none';
        return;
    }

    const lineHeight = 15;
    const paddingTop = 5;
    const scrollTop = asmEditor.scrollTop;
    const topPos = paddingTop + (pc * lineHeight) - scrollTop;

    // Only show if line is visible
    if (topPos >= 0 && topPos < asmWrapper.clientHeight - lineHeight) {
        asmHighlight.style.display = 'block';
        asmHighlight.style.top = topPos + 'px';
    } else {
        asmHighlight.style.display = 'none';
    }

    // Highlight line number
    const allLns = asmLines.querySelectorAll('.ln');
    allLns.forEach(ln => ln.classList.remove('active'));
    const activeLn = asmLines.querySelector(`.ln[data-line="${pc}"]`);
    if (activeLn) activeLn.classList.add('active');
}

// --- Editor Mode Switching ---
function setEditorMode(player, mode) {
    const prefix = player; // 'p1' or 'p2'
    editorModes[prefix] = mode;

    const scriptPanel = prefix === 'p1' ? scriptPanelP1 : scriptPanelP2;
    const asmViewer = prefix === 'p1' ? viewerP1 : viewerP2;
    const asmWrapper = prefix === 'p1' ? asmWrapperP1 : asmWrapperP2;
    const asmEditor = prefix === 'p1' ? asmEditorP1 : asmEditorP2;
    const compileBtn = prefix === 'p1' ? btnCompileP1 : btnCompileP2;
    const scriptEl = prefix === 'p1' ? scriptP1 : scriptP2;
    const modeBtns = document.querySelectorAll(`#${prefix}-mode-toggle .mode-btn`);

    // Update toggle button states
    modeBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    if (mode === 'assembly') {
        // Switch to assembly mode
        scriptPanel.classList.add('panel-disabled');
        asmViewer.style.display = 'none';
        asmWrapper.style.display = 'flex';
        compileBtn.textContent = 'VALIDATE';

        // Auto-compile TankScript and populate assembler
        try {
            const asm = compiler.compile(scriptEl.value);
            asmEditor.value = asm;
        } catch (e) {
            asmEditor.value = '; Compilation failed - write assembly here\n; Error: ' + e.message + '\nNOP';
        }
        updateAsmLineNumbers(prefix);
    } else {
        // Switch to TankScript mode
        scriptPanel.classList.remove('panel-disabled');
        asmViewer.style.display = 'block';
        asmWrapper.style.display = 'none';
        compileBtn.textContent = 'COMPILE';
    }
}

// Mode toggle event listeners
document.querySelectorAll('.mode-toggle .mode-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const toggle = e.target.closest('.mode-toggle');
        const player = toggle.id.replace('-mode-toggle', ''); // 'p1' or 'p2'
        const mode = e.target.dataset.mode;
        if (editorModes[player] !== mode) {
            setEditorMode(player, mode);
        }
    });
});

// ASM editor input/scroll listeners for line number sync
asmEditorP1.addEventListener('input', () => updateAsmLineNumbers('p1'));
asmEditorP1.addEventListener('scroll', () => syncAsmScroll('p1'));
asmEditorP2.addEventListener('input', () => updateAsmLineNumbers('p2'));
asmEditorP2.addEventListener('scroll', () => syncAsmScroll('p2'));

// UI Updater
const REGISTERS = ['PC', 'ACC', 'CMP', 'R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'PX', 'PY', 'DIR', 'HP', 'AMMO'];

// Error Helper
function showError(prefix, msg) {
    const el = document.getElementById(prefix.toLowerCase() + '-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function clearError(prefix) {
    const el = document.getElementById(prefix.toLowerCase() + '-error');
    if (el) { el.style.display = 'none'; el.textContent = ''; }
}

// Compile a single player's script (handles both TankScript and Assembly modes)
function compilePlayer(prefix, scriptEl, viewerEl, machineEl) {
    clearError(prefix);
    const mode = editorModes[prefix.toLowerCase()];
    const asmEditor = prefix.toLowerCase() === 'p1' ? asmEditorP1 : asmEditorP2;

    try {
        let asm;

        if (mode === 'assembly') {
            // Assembly mode: read directly from asm editor
            asm = asmEditor.value;
        } else {
            // TankScript mode: compile first
            asm = compiler.compile(scriptEl.value);
        }

        const tokens = tokenizer.tokenize(asm);
        const { program, labels, error } = parser.parse(tokens);
        if (error) throw new Error(error);

        // Always update viewers (in tankscript mode, show compiled; in asm mode, show parsed)
        renderAssembly(viewerEl, program);
        renderMachineCode(machineEl, program);

        return { asm, program, labels };
    } catch (e) {
        const errorType = mode === 'assembly' ? 'Parse' : 'Compile';
        showError(prefix, `${errorType} Error: ${e.message}`);
        return null;
    }
}

// --- Simulation Control ---
let simulationTimer = null;
let runModeSpeed = 500; 
let microOpSpeed = 20;  
let isFastForward = false;

// Update control button active states (RUN, FAST, HALT are mutually exclusive)
function updateControlButtons() {
    btnRun.classList.toggle('active', simulationRunning && !isFastForward);
    btnFf.classList.toggle('active', simulationRunning && isFastForward);
    btnStop.classList.toggle('active', !simulationRunning);
}
let simulationRunning = false;

const battleManager = new BattleManager();

// Initialize view with initial state after Phaser scene is ready
game.events.once('ready', () => {
    window.dispatchEvent(new CustomEvent('reset-sim', {
        detail: {
            level: 1,
            walls: Array.from(battleManager.grid.walls),
            tanks: {
                P1: { x: battleManager.tanks.P1.x, y: battleManager.tanks.P1.y, facing: battleManager.tanks.P1.facing },
                P2: { x: battleManager.tanks.P2.x, y: battleManager.tanks.P2.y, facing: battleManager.tanks.P2.facing }
            }
        }
    }));
});

function updateUIState(state) {
    if (!state) return;
    updateCPU('p1', state.tanks.P1);
    updateCPU('p2', state.tanks.P2);
    window.dispatchEvent(new CustomEvent('update-ui', { detail: state }));
}

function executeLoopStep() {
    if (!simulationRunning || battleManager.isGameOver) {
        stopSimulation();
        return;
    }

    // Step P1 if not ready
    const p1Ready = !!battleManager.pendingActions[TANK_IDS.P1] || battleManager.tanks[TANK_IDS.P1].hp <= 0;
    if (!p1Ready) {
        battleManager.stepCPU(TANK_IDS.P1);
    }

    // Step P2 if not ready
    const p2Ready = !!battleManager.pendingActions[TANK_IDS.P2] || battleManager.tanks[TANK_IDS.P2].hp <= 0;
    if (!p2Ready) {
        battleManager.stepCPU(TANK_IDS.P2);
    }

    // Update UI once after both have potentially stepped
    updateUIState(battleManager.getState());

    // Check if BOTH are ready now (re-evaluate after steps)
    const p1Done = !!battleManager.pendingActions.P1 || battleManager.tanks.P1.hp <= 0;
    const p2Done = !!battleManager.pendingActions.P2 || battleManager.tanks.P2.hp <= 0;

    let nextDelay = isFastForward ? 0 : microOpSpeed;

    if (p1Done && p2Done) {
        // End of Turn!
        battleManager.resolveTurn();
        updateUIState(battleManager.getState());
        nextDelay = isFastForward ? 50 : runModeSpeed;
    }

    simulationTimer = setTimeout(executeLoopStep, nextDelay);
}

function startSimulationLoop() {
    if (simulationTimer) clearTimeout(simulationTimer);
    simulationRunning = true;
    updateControlButtons();
    executeLoopStep();
}

function stopSimulation() {
    if (simulationTimer) clearTimeout(simulationTimer);
    simulationTimer = null;
    simulationRunning = false;
    isFastForward = false;
    updateControlButtons();
}

// Compile button handlers
btnCompileP1.addEventListener('click', () => {
    const res = compilePlayer('P1', scriptP1, viewerP1, machineP1);
    if (res) {
        btnCompileP1.textContent = "OK!";
        setTimeout(() => btnCompileP1.textContent = "COMPILE", 1000);
    }
});

btnCompileP2.addEventListener('click', () => {
    const res = compilePlayer('P2', scriptP2, viewerP2, machineP2);
    if (res) {
        btnCompileP2.textContent = "OK!";
        setTimeout(() => btnCompileP2.textContent = "COMPILE", 1000);
    }
});

// Main Control Button Handlers
btnRun.addEventListener('click', () => {
    if (simulationRunning && !isFastForward) return;

    // Get current source code for both players
    const p1Source = editorModes.p1 === 'assembly' ? asmEditorP1.value : scriptP1.value;
    const p2Source = editorModes.p2 === 'assembly' ? asmEditorP2.value : scriptP2.value;

    // Check if we need to recompile (no code loaded OR source changed)
    const hasLoadedCode = battleManager.tanks.P1.cpu && battleManager.tanks.P2.cpu;
    const codeChanged = p1Source !== lastCompiledP1 || p2Source !== lastCompiledP2;

    if (!hasLoadedCode || codeChanged) {
        // Compile and load fresh
        const p1 = compilePlayer('P1', scriptP1, viewerP1, machineP1);
        const p2 = compilePlayer('P2', scriptP2, viewerP2, machineP2);
        if (!p1 || !p2) return;

        // Track the source we just compiled
        lastCompiledP1 = p1Source;
        lastCompiledP2 = p2Source;

        // Reset arena when reloading code
        const level = parseInt(levelSelect.value);
        battleManager.setupArena(level);
        battleManager.resetTurnState();

        const res = battleManager.loadCode(p1.asm, p2.asm);
        if (!res.success) { showError('P1', res.error); return; }

        // Send walls and initial tank state to view
        window.dispatchEvent(new CustomEvent('run-sim', {
            detail: {
                level,
                walls: Array.from(battleManager.grid.walls),
                tanks: {
                    P1: { x: battleManager.tanks.P1.x, y: battleManager.tanks.P1.y, facing: battleManager.tanks.P1.facing },
                    P2: { x: battleManager.tanks.P2.x, y: battleManager.tanks.P2.y, facing: battleManager.tanks.P2.facing }
                }
            }
        }));
    }
    // If code was already loaded and unchanged, just continue from current state

    isFastForward = false;
    startSimulationLoop();
});

btnStop.addEventListener('click', () => {
    stopSimulation();
});

btnStep.addEventListener('click', () => {
    stopSimulation(); // Ensure interval is off, but button becomes active
    
    // Lazy compile/load if CPUs missing
    if (!battleManager.tanks.P1.cpu) {
         const p1 = compilePlayer('P1', scriptP1, viewerP1, machineP1);
         const p2 = compilePlayer('P2', scriptP2, viewerP2, machineP2);
         if (!p1 || !p2) return;
         battleManager.loadCode(p1.asm, p2.asm);
    }
    
    // Step BOTH tanks (simultaneous visual step)
    const p1Ready = !!battleManager.pendingActions[TANK_IDS.P1] || battleManager.tanks[TANK_IDS.P1].hp <= 0;
    if (!p1Ready) battleManager.stepCPU(TANK_IDS.P1);

    const p2Ready = !!battleManager.pendingActions[TANK_IDS.P2] || battleManager.tanks[TANK_IDS.P2].hp <= 0;
    if (!p2Ready) battleManager.stepCPU(TANK_IDS.P2);

    // Check resolve
    const p1Done = !!battleManager.pendingActions.P1 || battleManager.tanks.P1.hp <= 0;
    const p2Done = !!battleManager.pendingActions.P2 || battleManager.tanks.P2.hp <= 0;

    if (p1Done && p2Done) {
        battleManager.resolveTurn();
    }
    updateUIState(battleManager.getState());
});

btnFf.addEventListener('click', () => {
    if (simulationRunning && isFastForward) return;

    // Get current source code for both players
    const p1Source = editorModes.p1 === 'assembly' ? asmEditorP1.value : scriptP1.value;
    const p2Source = editorModes.p2 === 'assembly' ? asmEditorP2.value : scriptP2.value;

    // Check if we need to recompile (no code loaded OR source changed)
    const hasLoadedCode = battleManager.tanks.P1.cpu && battleManager.tanks.P2.cpu;
    const codeChanged = p1Source !== lastCompiledP1 || p2Source !== lastCompiledP2;

    if (!hasLoadedCode || codeChanged) {
        const p1 = compilePlayer('P1', scriptP1, viewerP1, machineP1);
        const p2 = compilePlayer('P2', scriptP2, viewerP2, machineP2);
        if (!p1 || !p2) return;

        // Track the source we just compiled
        lastCompiledP1 = p1Source;
        lastCompiledP2 = p2Source;

        // Reset arena when reloading code
        const level = parseInt(levelSelect.value);
        battleManager.setupArena(level);
        battleManager.resetTurnState();

        const res = battleManager.loadCode(p1.asm, p2.asm);
        if (!res.success) { showError('P1', res.error); return; }

        window.dispatchEvent(new CustomEvent('run-sim', {
            detail: {
                level,
                walls: Array.from(battleManager.grid.walls),
                tanks: {
                    P1: { x: battleManager.tanks.P1.x, y: battleManager.tanks.P1.y, facing: battleManager.tanks.P1.facing },
                    P2: { x: battleManager.tanks.P2.x, y: battleManager.tanks.P2.y, facing: battleManager.tanks.P2.facing }
                }
            }
        }));
    }
    isFastForward = true;
    startSimulationLoop();
});

btnReset.addEventListener('click', () => {
    stopSimulation();
    const level = parseInt(levelSelect.value);
    battleManager.setupArena(level);
    battleManager.resetTurnState();
    const p1 = compilePlayer('P1', scriptP1, viewerP1, machineP1);
    const p2 = compilePlayer('P2', scriptP2, viewerP2, machineP2);
    if (p1 && p2) {
        battleManager.loadCode(p1.asm, p2.asm);
        // Track compiled source
        lastCompiledP1 = editorModes.p1 === 'assembly' ? asmEditorP1.value : scriptP1.value;
        lastCompiledP2 = editorModes.p2 === 'assembly' ? asmEditorP2.value : scriptP2.value;
    }
    updateUIState(battleManager.getState());
    // Send walls and initial tank state to view
    window.dispatchEvent(new CustomEvent('reset-sim', {
        detail: {
            level,
            walls: Array.from(battleManager.grid.walls),
            tanks: {
                P1: { x: battleManager.tanks.P1.x, y: battleManager.tanks.P1.y, facing: battleManager.tanks.P1.facing },
                P2: { x: battleManager.tanks.P2.x, y: battleManager.tanks.P2.y, facing: battleManager.tanks.P2.facing }
            }
        }
    }));
    btnStop.classList.remove('active');
});

levelSelect.addEventListener('change', () => { btnReset.click(); });

// Render Functions
function renderAssembly(viewer, program) {
    viewer.innerHTML = '';
    if (!program) return;
    program.forEach((inst, index) => {
        const row = document.createElement('div');
        row.className = 'asm-line';
        row.id = viewer.id.replace('viewer', 'asm-line') + '-' + index;
        const addr = document.createElement('span');
        addr.className = 'asm-addr';
        addr.textContent = index.toString(16).padStart(2, '0').toUpperCase();
        const text = document.createElement('span');
        text.className = 'asm-instr';
        text.textContent = `${inst.opcode} ${inst.args.join(', ')}`;
        row.appendChild(addr); row.appendChild(text); viewer.appendChild(row);
    });
}

function renderMachineCode(container, program) {
    container.innerHTML = '';
    if (!program) return;
    program.forEach((inst, index) => {
        const row = document.createElement('div');
        row.className = 'machine-line';
        row.id = container.id + '-line-' + index;
        const addr = document.createElement('span');
        addr.className = 'machine-addr';
        addr.textContent = index.toString(16).padStart(2, '0').toUpperCase();
        const opByte = OPCODE_BINARY[inst.opcode] || 0;
        const hex = document.createElement('span');
        hex.className = 'machine-hex';
        hex.textContent = opByte.toString(16).padStart(2, '0').toUpperCase();
        const bin = document.createElement('span');
        bin.className = 'machine-bin';
        bin.textContent = opByte.toString(2).padStart(8, '0');
        row.appendChild(addr); row.appendChild(hex); row.appendChild(bin);
        container.appendChild(row);
    });
}

// Game actions that end the turn (vs instant CPU operations)
const GAME_ACTIONS = ['MOVE', 'ROTATE', 'FIRE', 'SCAN', 'PING', 'NOP'];

function updateCPU(prefix, tankData) {
    if (!tankData || !tankData.debugRegisters) return;
    const statusEl = document.getElementById(`${prefix}-status`);
    if (statusEl) {
        let statusText = 'IDLE';
        let color = '#aaa';
        if (tankData.hp <= 0) { statusText = 'DESTROYED'; color = '#f00'; }
        else if (tankData.lastFeedback) { statusText = tankData.lastFeedback; color = '#f66'; }
        else if (tankData.lastAction) {
            if (tankData.lastAction === 'HALT') { statusText = 'HALTED'; color = '#f0f'; }
            else if (GAME_ACTIONS.includes(tankData.lastAction)) {
                statusText = `ACT: ${tankData.lastAction}`; color = '#4f4';
            } else {
                statusText = `TICK: ${tankData.lastAction}`; color = '#ff0';
            }
        }
        statusEl.textContent = statusText;
        statusEl.style.color = color;
    }
    const regs = tankData.debugRegisters;
    
    // Update Total Ops
    const totalOpsEl = document.getElementById(`${prefix}-totalOps`);
    if (totalOpsEl) totalOpsEl.textContent = tankData.totalOps || 0;
    
    const pxEl = document.getElementById(`${prefix}-PX`); if(pxEl) pxEl.textContent = regs['PX'];
    const pyEl = document.getElementById(`${prefix}-PY`); if(pyEl) pyEl.textContent = regs['PY'];
    const dirEl = document.getElementById(`${prefix}-DIR`); 
    if(dirEl) { const dirNames = ['E', 'S', 'W', 'N']; dirEl.textContent = dirNames[regs['DIR']] || regs['DIR']; }
    const hpEl = document.getElementById(`${prefix}-HP`); if(hpEl) hpEl.textContent = tankData.hp;
    const ammoEl = document.getElementById(`${prefix}-AMMO`); if(ammoEl) ammoEl.textContent = regs['AMMO'];
    ['PC', 'ACC', 'CMP', 'R0', 'R1', 'R2', 'R3', 'R4', 'R5'].forEach(reg => {
        const val = regs[reg];
        const el = document.getElementById(`${prefix}-${reg}`);
        if (el) el.textContent = val;
        const binEl = document.getElementById(`${prefix}-${reg}-bin`);
        if (binEl) binEl.textContent = (val & 0xFF).toString(2).padStart(8, '0');
    });
    const irEl = document.getElementById(`${prefix}-IR`);
    const irBinEl = document.getElementById(`${prefix}-IR-bin`);
    if (irEl) {
        const irText = tankData.debugIR || '-'; irEl.textContent = irText;
        if (irBinEl) {
            if (irText === '-' || irText === 'HALT') irBinEl.textContent = '00000000';
            else { const opcode = irText.split(' ')[0]; const binVal = OPCODE_BINARY[opcode] || 0; irBinEl.textContent = binVal.toString(2).padStart(8, '0'); }
        }
    }
    const highlightPC = (tankData.debugPC !== undefined) ? tankData.debugPC : regs.PC;
    const viewer = document.getElementById(`${prefix}-viewer`);
    const oldActiveAsm = viewer.querySelector('.active');
    if (oldActiveAsm) oldActiveAsm.classList.remove('active');
    const newActiveAsm = document.getElementById(`${prefix}-asm-line-${highlightPC}`);
    if (newActiveAsm) { newActiveAsm.classList.add('active'); newActiveAsm.scrollIntoView({ block: 'nearest' }); }
    const machine = document.getElementById(`${prefix}-machine`);
    const oldActiveMachine = machine.querySelector('.active');
    if (oldActiveMachine) oldActiveMachine.classList.remove('active');
    const newActiveMachine = document.getElementById(`${prefix}-machine-line-${highlightPC}`);
    if (newActiveMachine) { newActiveMachine.classList.add('active'); newActiveMachine.scrollIntoView({ block: 'nearest' }); }

    // Update ASM editor PC highlight (assembly mode)
    updateAsmPCHighlight(prefix, highlightPC);
}
