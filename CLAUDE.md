# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CPU Wars is an educational puzzle-strategy game where players write "TankScript" code to control tanks in a real-time autobattler. The code compiles to assembly and executes on a custom Virtual Machine.

## Commands

```bash
npm install       # Install dependencies
npm run dev       # Start Vite dev server (localhost:5173)
npm test          # Run tests (Node.js test runner)
npm run build     # Build to dist/
npm run deploy    # Build and deploy to gh-pages
```

## Architecture

### Strict Separation of Concerns

The codebase enforces a critical architectural rule:

- **`src/vm/`** and **`src/simulation/`** must NEVER import Phaser or DOM elements
- These layers must be pure JavaScript, testable in Node.js via `npm test`
- **`src/view/`** contains all Phaser-related rendering code

### Layer Responsibilities

| Layer | Location | Purpose |
|-------|----------|---------|
| VM | `src/vm/` | Compilation and execution engine (CPU, Tokenizer, Parser, SimpleCompiler) |
| Simulation | `src/simulation/` | Game rules (BattleManager, Grid, collision, turn resolution) |
| View | `src/view/` | Phaser 3 rendering (BattleScene) |
| Entry | `src/main.js` | UI orchestration, DOM events, simulation control |

### Compilation Pipeline

```
TankScript (user code)
    ↓ SimpleCompiler
Assembly ("SET R0, 5\nMOV_F")
    ↓ Tokenizer
Tokens
    ↓ Parser
Program + Labels
    ↓ CPU
Execution
```

### Execution Model

1. Both tanks' CPUs step until they yield an action (max 50 ops per tick)
2. `BattleManager.resolveTurn()` processes actions, sensors, bullets, collisions
3. Sensor results written back to CPU registers
4. View updates from `BattleManager.getState()`

## Coding Conventions

- **Registers:** UPPERCASE (`R0`, `ACC`, `PC`, `PX`, `PY`, `DIR`)
- **Instructions:** UPPERCASE (`MOV_F`, `SCAN`, `JMP`)
- **Internal labels:** snake_case with `__` prefix (`__while_start_0`, `__if_end_1`)
- **Variables:** TankScript `var0-var5` maps to Assembly `R0-R5`

## VM Constraints

- **MAX_OPS:** 50 instructions per tick (prevents infinite loops)
- **MAX_NESTING:** Enforced by compiler for control structures
- **Variables:** Only `var0-var5` allowed
- **Read-only registers:** `PX`, `PY`, `DIR`, `HP`, `AMMO`

## Instruction Categories

- **Actions (end turn):** `MOV_F`, `MOV_B`, `ROT_L`, `ROT_R`, `FIRE`, `NOP`
- **Sensors (end turn):** `SCAN`, `PING`
- **Flow (instant):** `JMP`, `JE`, `JNE`, `JG`, `JL`, `JGE`, `JLE`, `DJNZ`, `CMP`, `LBL`
- **Math (instant):** `SET`, `ADD`, `SUB`

## Testing

Tests are in `tests/vm.test.js` and cover the VM and compilation pipeline:

```bash
npm test          # Run all tests
```

The test file contains helpers:
- `createCPU(tankScript)` - Full pipeline from TankScript to CPU
- `runUntilAction(cpu)` - Execute until first yielded action
- `runToCompletion(cpu)` - Collect all actions until program halts

## Key Files

- `src/vm/InstructionSet.js` - ISA definitions, register specs, opcode encoding
- `src/vm/CPU.js` - `step()` executes one instruction, returns action or CPU_OP
- `src/vm/SimpleCompiler.js` - TankScript to Assembly compiler
- `src/simulation/BattleManager.js` - Turn resolution, state management, referee logic
- `src/simulation/Grid.js` - 16×10 arena, raycast for SCAN, collision detection
