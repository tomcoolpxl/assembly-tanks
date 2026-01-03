# CPU Wars - Project Context

## Project Overview

**"CPU Wars"** is an educational puzzle-strategy game designed to teach low-level programming concepts. Players write "Fake Assembly" code to control a tank's movement, sensors, and weapons. These scripts are executed by a custom Virtual Machine (VM) in a real-time autobattler format against opponents.

### Key Concepts
*   **Code Phase:** Players write assembly-like instructions (e.g., `MOV_F`, `SCAN`, `JMP`).
*   **Battle Phase:** A simulation runs the code for both players on a grid-based arena.
*   **Target Audience:** Students learning loops, registers, and conditionals.

## Technical Architecture

The project maintains a strict separation between **Simulation Logic** (VM) and **Visualization** (Phaser).

### Technology Stack
*   **Language:** JavaScript (ES6+)
*   **Game Engine:** Phaser 3 (Visualization)
*   **Logic:** Custom Virtual Machine (No external dependencies for core logic)
*   **Build/Dev:** Node.js (likely Vite or Webpack for bundling - TBD)

### File Structure (Planned)

```text
/
├── public/
│   └── assets/           # Images, JSON maps
├── src/
│   ├── main.js           # Phaser Entry Point
│   ├── vm/               # PURE LOGIC (No Phaser code)
│   │   ├── Tokenizer.js  # Text -> Tokens
│   │   ├── Parser.js     # Tokens -> Instructions
│   │   ├── CPU.js        # Virtual Machine (Registers, PC)
│   │   └── InstructionSet.js
│   ├── simulation/       # THE REFEREE
│   │   ├── BattleManager.js
│   │   └── Grid.js
│   └── view/             # THE VISUALS
│       ├── scenes/
│       │   ├── EditorScene.js
│       │   └── BattleScene.js
│       └── entities/
│           ├── TankSprite.js
│           └── BulletSprite.js
└── PLAN.md               # Master Design Document
```

## Virtual Machine (VM) Specs

*   **Registers:** `R0-R3` (General), `ACC` (Accumulator), `PC` (Program Counter), `CMP` (Comparison Flag).
*   **Constraints:** `MAX_OPS` limit per tick to prevent infinite loops.
*   **Execution:** Action instructions (Move/Fire) end the turn; Flow/Math instructions are instant.

## Development Status

**Current Phase:** Initialization.
The project currently consists of a design plan (`PLAN.md`). The next steps involve initializing the project environment and implementing the VM Core.

### Getting Started (TODO)

1.  Initialize Node.js project (`npm init`).
2.  Install dependencies (`phaser`, dev tools).
3.  Set up the directory structure.
4.  Begin implementation of `src/vm`.

## Conventions

*   **Logic/View Separation:** The `src/vm` and `src/simulation` directories must **never** import Phaser or DOM elements. They must run in a pure JS environment (testable via Node.js).
*   **Coordinate System:** Grid-based (0-39 x, 0-23 y). Wrapping enabled horizontally.
*   **Code Style:** Standard JS (ESLint recommended).
