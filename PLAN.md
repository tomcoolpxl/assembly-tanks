Following the plan, I have included a **Self-Review** section at the end to critique the design before implementation begins.

---

# Master Design Document: CPU Wars

## 1. Introduction & Concept

**"CPU Wars"** is an educational puzzle-strategy game designed to teach students the fundamentals of low-level programming (Assembly) and algorithmic thinking.

**The Core Loop:**

1. **Code Phase:** Players write "Fake Assembly" code for their tank in a text editor. They control movement, sensors, and weapons using registers and jump commands.
2. **Battle Phase (Autobattler):** Players hit "RUN". The game simulation takes over. The user's code is compiled into bytecode and executed by a Virtual Machine (VM) in real-time. Students watch their tanks execute their logic against an opponent (AI or another student's code).

**Target Audience:** Students learning programming concepts (loops, variables/registers, conditionals) who need a visual, engaging application of theory.

---

## 2. Game Mechanics & Rules

### The Arena

* **Grid:** 40 Columns (x: 0-39) by 24 Rows (y: 0-23).
* **Top-Left:** (0,0). **Bottom-Right:** (39,23).
* **Wrapping:** The world wraps horizontally. Moving Left from x=0 goes to x=39.
* **Terrain:**
* **Empty:** Passable.
* **Wall:** Indestructible obstacle. Blocks movement and destroys bullets.



### The Units (Tanks)

* **Start Positions:**
* **Blue (Player 1):** (0, 12), Facing Right (East).
* **Red (Player 2):** (39, 13), Facing Left (West).


* **Stats:**
* **HP:** 3 Lives.
* **Fuel/Ammo:** Infinite, but limited by rate of fire and turn speed.


* **Capabilities:** Move (Forward/Back), Rotate (90°), Fire, Scan.

### Combat Rules

* **Firing:** A tank can have **only 1 active bullet** at a time. The `FIRE` command fails (wastes a turn) if a bullet is already traveling.
* **Bullets:**
* **Speed:** 2 Tiles per turn.
* **Wrapping:** Bullets wrap horizontally.
* **Damage:** 1 Hit = -1 Life.


* **Collisions:**
* **Bullet vs. Tank:** Tank takes damage; Bullet destroyed.
* **Bullet vs. Wall:** Bullet destroyed.
* **Bullet vs. Bullet:** Both destroyed (if head-on or landing on same tile).
* **Friendly Fire:** Active. A tank can shoot itself if the bullet wraps around the world.



---

## 3. Technical Architecture

The project strictly separates the **Simulation** (Logic/VM) from the **Visualization** (Phaser).

### Folder Structure

```text
/public
  /assets           # Images, JSON maps
/src
  main.js           # Phaser Entry Point
  /vm               # PURE LOGIC (No Phaser code)
    Tokenizer.js    # Converts text -> Token Objects
    Parser.js       # Converts Tokens -> Instruction Objects
    CPU.js          # The Virtual Machine class (Registers, PC)
    InstructionSet.js # Constants (Opcodes, Error codes)
  /simulation       # THE REFEREE
    BattleManager.js # Manages the Grid, Bullets, and CPU Steps
    Grid.js         # 2D Array wrapper & Coordinate math
  /view             # THE VISUALS
    /scenes
      EditorScene.js # DOM Overlay (Text Areas, Run Button)
      BattleScene.js # Canvas Renderer (Sprites, Animations)
    /entities
      TankSprite.js  # Wrapper for Phaser Container
      BulletSprite.js

```

---

## 4. Virtual Machine (VM) Specification

Each tank runs its own isolated instance of the `CPU` class.

### Registers

* `R0`, `R1`, `R2`, `R3`: General Purpose Integers (Read/Write).
* `ACC`: Accumulator. Stores result of `SCAN` or math overflows.
* `PC`: Program Counter. Index of the current instruction.
* `CMP`: Comparison Flag. Stores result of `CMP` (-1, 0, 1).

### Instruction Set Architecture (ISA)

| Opcode | Args | Description | Type |
| --- | --- | --- | --- |
| `MOV_F` | - | Move Forward 1 tile. | **Action** |
| `MOV_B` | - | Move Backward 1 tile. | **Action** |
| `ROT_L` | - | Rotate Left 90°. | **Action** |
| `ROT_R` | - | Rotate Right 90°. | **Action** |
| `FIRE` | - | Spawn bullet. (Fails if bullet active). | **Action** |
| `SCAN` | `Reg_D, Reg_T` | Raycast. Stores Dist in `Reg_D`, Type in `Reg_T`. | **Instant** |
| `LBL` | `Name` | Define Label (Jump target). | **Flow** |
| `JMP` | `Label` | Unconditional Jump. | **Flow** |
| `CMP` | `Reg, Val/Reg` | Compare. Sets `CMP` flag (-1, 0, 1). | **Flow** |
| `JE` | `Label` | Jump if `CMP == 0`. | **Flow** |
| `JNE` | `Label` | Jump if `CMP != 0`. | **Flow** |
| `DJNZ` | `Reg, Label` | Decrement Reg. Jump if `Reg != 0`. | **Flow** |
| `SET` | `Reg, Val` | Set Register to Value. | **Math** |
| `ADD` | `Reg, Val` | Add Value to Register. | **Math** |
| `SUB` | `Reg, Val` | Subtract Value from Register. | **Math** |

### Execution Cycle

1. **Fetch:** Get instruction at `PC`.
2. **Execute:** Perform logic.
3. **Constraint:** If instruction is an **Action**, execution pauses for this turn. If instruction is **Flow/Math**, execution continues immediately (up to a `MAX_OPS` limit of 50 to prevent infinite freezes).

---

## 5. Simulation Logic (The Referee)

The `BattleManager` handles the interaction between the two CPUs and the world.

**The Game Loop (Tick Duration: ~500ms)**

1. **CPU Step:** Run `BlueCPU` and `RedCPU` until they yield an intent (e.g., "I want to move North").
2. **Scan Resolution:** If intent is `SCAN`, calculate raycast immediately, update CPU registers, and resume CPU (since SCAN is instant/non-turn-ending, depending on balance preference. *Decision: Let's make SCAN consume a turn to encourage memory usage vs constant scanning.*).
3. **Conflict Resolution (Movement):**
* Calculate Target Coordinates.
* **Rule:** If `BlueTarget == RedTarget`: Both stay still.
* **Rule:** If `Target == Wall`: Stay still.


4. **Bullet Physics:**
* Move Bullets (`Speed = 2`).
* Handle Wrapping (`x % 40`).
* **Collision Order:** Wall -> Tank -> Bullet-on-Bullet.


5. **State Output:** Generate a `TurnDiff` object for the View.

---

## 6. Phaser Integration (Visualization)

**Visual Style:**

* Top-down 2D.
* Grid lines visible.
* **UI:** HTML DOM overlay for the Code Editor (Left/Right panels) so students can copy/paste/edit text natively.

**Animation Logic:**

* The `BattleScene` listens for the `TurnDiff`.
* **Tweens:** If a tank moves from (0,0) to (1,0), create a Phaser Tween lasting 300ms (shorter than the 500ms turn timer) to ensure smooth arrival before the next logic tick.
* **Visual Wrapping:** If a bullet moves from 39 to 0, the sprite should not "fly back" across the screen. It should disappear at 39 and reappear at 0 (or use two sprites for a seamless visual wrap effect).

---

## 7. Design Review & Critical Analysis

**Critique of the Plan:**

1. **The "Blindness" Factor:**
* *Issue:* The `SCAN` instruction is complex. It returns Distance and Type. Dealing with two return values in "Fake Assembly" is clunky.
* *Fix:* Simplification. `SCAN` puts Distance in `R0` and Type in `R1` (hardcoded output registers), or `ACC` stores a packed value.
* *Decision:* Keep explicit arguments `SCAN [Reg_Dist] [Reg_Type]` for clarity, even if it's verbose.


2. **Infinite Loops:**
* *Issue:* A student writes `LBL A, JMP A`. The browser tab crashes.
* *Fix:* The `MAX_OPS` per tick is non-negotiable. The CPU class must throw an error or force a "Wait" if this limit is hit.


3. **Bullet Visuals (Wrapping):**
* *Issue:* Visualizing a bullet wrapping from x=39 to x=0 looks bad if it just teleports.
* is ok. no ghost sprites.

4. **Synchronicity:**
* *Issue:* If Phaser lags, the visual state might desync from the Logic state.
* *Fix:* The Logic (`BattleManager`) is the source of truth. Phaser visuals are "destructive" reconstruction every frame if necessary, or strictly event-driven. We will use the "Event Driven" approach (The Manager tells Phaser "Move here", Phaser obeys).


5. **User Experience (Feedback):**
* *Issue:* Why did my tank not shoot? (Because a bullet was already active).
* *Fix:* The UI needs a "Console Log" or "Debug Line" on the tank that prints errors like "ERR: AMMO" or "ERR: WALL".


Also needed: example pre-loaded code so we can test.


**Verdict:** The plan is solid. The separation of `VM` and `View` is the key success factor. The simplified Assembly language is capable enough for complex logic without the overhead of real memory management.

---

**Next Step:**
Would you like to start implementing the **VM Core** (Tokenizer/Parser/CPU) or the **Phaser Shell** first? I recommend starting with the **VM Core** to verify the logic with unit tests before worrying about graphics.