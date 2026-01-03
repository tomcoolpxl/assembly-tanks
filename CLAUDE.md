# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CPU Wars is an educational puzzle-strategy game that teaches low-level programming concepts through a real-time autobattler format. Players write "TankScript" code (a high-level language) that compiles to assembly-like instructions executed by a custom Virtual Machine.

## Build & Development Commands

```bash
npm install        # Install dependencies
npm run dev        # Start Vite dev server (http://localhost:5173)
npm run build      # Build for production (outputs to dist/)
npm test           # Run VM test suite (tests/vm.test.js)
```

## Architecture

**Strict separation of logic and visualization:**

- `src/vm/` - Pure JavaScript VM (zero Phaser dependencies, testable in Node.js)
- `src/simulation/` - Game referee logic (zero Phaser dependencies)
- `src/view/` - Phaser rendering only, observes simulation state

**Communication:** Event-driven via custom DOM events (`run-sim`, `update-ui`, `stop-sim`)

### Execution Pipeline

1. **TankScript** (high-level: loops, if/while, sensor calls) → `SimpleCompiler.js`
2. **Assembly** (MOV_F, SCAN, JMP, etc.) → `Tokenizer.js` + `Parser.js`
3. **Bytecode** → `CPU.js` executes instruction-by-instruction

### Key Files

| File | Purpose |
|------|---------|
| `src/vm/CPU.js` | Virtual Machine with registers (R0-R5, ACC, PC, CMP) and execution loop |
| `src/vm/SimpleCompiler.js` | TankScript → Assembly compiler |
| `src/vm/InstructionSet.js` | Opcodes, registers, ISA constants |
| `src/simulation/BattleManager.js` | Game loop, collision resolution, state management |
| `src/simulation/Grid.js` | 16x10 arena, wall management, raycast |
| `src/view/scenes/BattleScene.js` | Phaser scene for rendering and animations |
| `src/main.js` | Entry point, DOM event handling, Phaser initialization |

### Instruction Types

- **Actions** (MOV_F, MOV_B, ROT_L, ROT_R, FIRE): End the turn, yield to simulator
- **Sensors** (SCAN, PING): Yield to get results, consume a turn
- **Flow** (JMP, JE, JNE, JG, JL, CMP, DJNZ): Instant, no turn consumed
- **Math** (SET, ADD, SUB): Instant

### Registers

| Register | TankScript | Access | Description |
|----------|------------|--------|-------------|
| R0-R5 | var0-var5 | Read/Write | General purpose |
| PX | posx | Read-only | Tank X position (instant) |
| PY | posy | Read-only | Tank Y position (instant) |
| DIR | dir | Read-only | Tank direction: 0=E, 1=S, 2=W, 3=N |
| ACC | - | Read/Write | Accumulator |
| PC | - | Internal | Program counter |
| CMP | - | Internal | Comparison flag (-1, 0, 1) |

### Game Constants

- Arena: 16x10 grid (no wrapping, hard boundaries)
- Tick: 500ms normal, 50ms fast-forward
- Bullet speed: 2 tiles/tick
- Tank HP: 3 lives
- MAX_OPS: 50 ops/tick (prevents infinite loops)

## Code Conventions

- `src/vm/` and `src/simulation/` must NEVER import Phaser or DOM elements
- Register names: UPPERCASE (R0, ACC, PC, CMP)
- Instruction names: UPPERCASE (MOV_F, JMP)
- Auto-generated labels: snake_case with `__` prefix (e.g., `__while_start_0`)
- Directions: 0=East, 1=South, 2=West, 3=North

## Adding New Instructions

1. Add opcode constant in `InstructionSet.js`
2. Implement case in `CPU.js` `executeInstruction()`
3. If high-level support needed, add to `SimpleCompiler.js`

## Adding New Arena Levels

Modify `BattleManager.js` `setupArena()` - add obstacles via `grid.addWall(x, y)`
