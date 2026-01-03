import { CPU } from '../vm/CPU.js';
import { Tokenizer } from '../vm/Tokenizer.js';
import { Parser } from '../vm/Parser.js';
import { Grid } from './Grid.js';

export const TANK_IDS = { P1: 'P1', P2: 'P2' };
const DIRS = {
    0: { x: 1, y: 0 },  // East/Right
    1: { x: 0, y: 1 },  // South/Down
    2: { x: -1, y: 0 }, // West/Left
    3: { x: 0, y: -1 }  // North/Up
};

export class BattleManager {
    constructor() {
        this.grid = new Grid(16, 10); // New dimensions
        this.tokenizer = new Tokenizer();
        this.parser = new Parser();
        
        // Initial State (Adjusted for 16x10 arena)
        this.tanks = {
            [TANK_IDS.P1]: { x: 0, y: 4, facing: 0, hp: 3, cpu: null, lastAction: null, lastFeedback: null }, // P1 Blue
            [TANK_IDS.P2]: { x: 15, y: 5, facing: 2, hp: 3, cpu: null, lastAction: null, lastFeedback: null } // P2 Red (opposite side)
        };
        
        this.bullets = []; // Array of { x, y, dir, owner, dist }
        this.log = []; // Battle log
        this.events = []; // Visual events (Explosions, PINGs)
        this.isGameOver = false;
        this.winner = null;

        // Default Level 1
        this.setupArena(1);
    }

    setupArena(level = 1) {
        this.grid.walls.clear();
        
        if (level === 2) {
            // Level 2: Center Block (Center is 8,5)
            this.grid.addWall(7, 4);
            this.grid.addWall(7, 5);
            this.grid.addWall(8, 4);
            this.grid.addWall(8, 5);
        }
        else if (level === 3) {
            // Level 3: 6 Obstacles scattered (Scaled down for 16x10)
            const obstacles = [
                [4, 2], [4, 7],
                [12, 2], [12, 7],
                [8, 1], [8, 8]
            ];
            obstacles.forEach(pos => {
                this.grid.addWall(pos[0], pos[1]);
                // Single block walls for small map
            });
        }
        // Level 1 is empty (default)
    }

    loadCode(p1Code, p2Code) {
        try {
            const t1 = this.tokenizer.tokenize(p1Code);
            const p1 = this.parser.parse(t1);
            if (p1.error) throw new Error(`P1 Error: ${p1.error}`);
            this.tanks.P1.cpu = new CPU(p1.program, p1.labels);

            const t2 = this.tokenizer.tokenize(p2Code);
            const p2 = this.parser.parse(t2);
            if (p2.error) throw new Error(`P2 Error: ${p2.error}`);
            this.tanks.P2.cpu = new CPU(p2.program, p2.labels);

            this.log.push("Simulation Started.");
            return { 
                success: true,
                p1Program: p1.program,
                p2Program: p2.program
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * Runs one simulation tick (approx 500ms game time).
     * Returns the differential state for the View.
     */
    tick() {
        if (this.isGameOver) return null;
        this.events = []; // Clear previous events
        
        // Reset Feedback
        this.tanks.P1.lastFeedback = null;
        this.tanks.P2.lastFeedback = null;

        const p1Action = this.runCPU(TANK_IDS.P1);
        const p2Action = this.runCPU(TANK_IDS.P2);

        // Process Actions (Scan, Move intents)
        // We need to resolve movements simultaneously to handle head-on collisions
        const intents = {}; 
        
        // 1. Resolve Scans first (Instant)
        // If CPU yielded SCAN, we provide data and running it continues NEXT tick?
        // Actually, our CPU yields SCAN as an "Action", so it consumes the turn.
        if (p1Action && p1Action.type === 'SCAN') this.resolveScan(TANK_IDS.P1, p1Action);
        if (p2Action && p2Action.type === 'SCAN') this.resolveScan(TANK_IDS.P2, p2Action);

        // Resolve PING (GPS)
        if (p1Action && p1Action.type === 'PING') this.resolvePing(TANK_IDS.P1, p1Action);
        if (p2Action && p2Action.type === 'PING') this.resolvePing(TANK_IDS.P2, p2Action);

        // 2. Resolve Movement / Rotation / Fire
        this.resolveAction(TANK_IDS.P1, p1Action, intents);
        this.resolveAction(TANK_IDS.P2, p2Action, intents);

        // 3. Apply Movements (Checking collisions)
        this.applyMovements(intents);

        // 4. Update Bullets
        this.updateBullets();

        // 5. Check Win Condition
        if (this.tanks.P1.hp <= 0 && this.tanks.P2.hp <= 0) {
            this.isGameOver = true; this.winner = 'DRAW';
        } else if (this.tanks.P1.hp <= 0) {
            this.isGameOver = true; this.winner = 'P2';
        } else if (this.tanks.P2.hp <= 0) {
            this.isGameOver = true; this.winner = 'P1';
        }

        return {
            tanks: JSON.parse(JSON.stringify(this.tanks)), // Deep copy state
            bullets: [...this.bullets],
            log: [...this.log], // Should probably just send new logs
            events: [...this.events],
            gameOver: this.isGameOver,
            winner: this.winner
        };
    }

    runCPU(tankId) {
        const tank = this.tanks[tankId];
        if (!tank.cpu) return null; // Should not happen if loaded correctly

        // If tank is dead, do nothing
        if (tank.hp <= 0) return null;

        // Calculate Ammo (1 if no active bullet, 0 if active)
        const hasActiveBullet = this.bullets.some(b => b.owner === tankId);
        const ammo = hasActiveBullet ? 0 : 1;

        // Update position/direction registers BEFORE executing code
        // This ensures tank scripts can read current position instantly
        tank.cpu.updateTankState(tank.x, tank.y, tank.facing, tank.hp, ammo);

        // Capture IR (Instruction about to be executed)
        const pc = tank.cpu.registers.PC;
        tank.debugPC = pc; // Store PC for UI highlighting
        if (pc < tank.cpu.program.length) {
            const instr = tank.cpu.program[pc];
            tank.debugIR = `${instr.opcode} ${instr.args.join(', ')}`;
        } else {
            tank.debugIR = 'HALT';
        }

        // Run CPU until it yields an action
        const action = tank.cpu.step();
        
        // Store last action for debug
        // If WAIT (MAX_OPS), set feedback immediately
        if (action && action.type === 'WAIT' && action.reason === 'MAX_OPS') {
            tank.lastFeedback = 'LOOP STALL';
        }
        
        tank.lastAction = action ? action.type : 'IDLE';
        
        // Snapshot registers
        tank.debugRegisters = { ...tank.cpu.registers };
        
        return action;
    }

    resolveScan(tankId, action) {
        const tank = this.tanks[tankId];
        const dir = DIRS[tank.facing];
        const entityMap = new Map();
        
        // Map other tank
        const enemyId = tankId === 'P1' ? 'P2' : 'P1';
        const enemy = this.tanks[enemyId];
        if (enemy.hp > 0) entityMap.set(`${enemy.x},${enemy.y}`, enemyId);
        
        const result = this.grid.raycast(tank.x, tank.y, dir.x, dir.y, tankId, enemyId, entityMap);
        
        // Write back to CPU registers
        // We need a way to set registers from outside. Added setRegister to CPU.
        tank.cpu.setRegister(action.destDist, result.distance);
        tank.cpu.setRegister(action.destType, result.type);
    }

    resolvePing(tankId, action) {
        const tank = this.tanks[tankId];
        // PING detects the ENEMY's position (costs a turn)
        const enemyId = tankId === 'P1' ? 'P2' : 'P1';
        const enemy = this.tanks[enemyId];

        // Store enemy position (or -1,-1 if enemy is dead)
        if (enemy.hp > 0) {
            tank.cpu.setRegister(action.destX, enemy.x);
            tank.cpu.setRegister(action.destY, enemy.y);
        } else {
            tank.cpu.setRegister(action.destX, -1);
            tank.cpu.setRegister(action.destY, -1);
        }
        // Record PING event for visualization (from self to enemy)
        this.events.push({ type: 'PING', tankId: tankId, x: tank.x, y: tank.y, enemyX: enemy.x, enemyY: enemy.y });
    }

    resolveAction(tankId, action, intents) {
        if (!action) return;
        const tank = this.tanks[tankId];

        if (action.type === 'ROTATE') {
            if (action.dir === 'LEFT') tank.facing = (tank.facing + 3) % 4;
            if (action.dir === 'RIGHT') tank.facing = (tank.facing + 1) % 4;
        } 
        else if (action.type === 'MOVE') {
            let dirIdx = tank.facing;
            if (action.dir === 'BACKWARD') dirIdx = (dirIdx + 2) % 4;
            
            const dx = DIRS[dirIdx].x;
            const dy = DIRS[dirIdx].y;
            
            intents[tankId] = { 
                targetX: tank.x + dx, 
                targetY: tank.y + dy 
            };
        }
        else if (action.type === 'FIRE') {
            // Check if bullet already active
            const hasActiveBullet = this.bullets.some(b => b.owner === tankId);
            if (hasActiveBullet) {
                tank.lastFeedback = 'RELOADING';
                return; // Fail silently (waste turn)
            }

            // Spawn bullet
            const dir = DIRS[tank.facing];
            // Start 1 tile in front
            const startX = tank.x + dir.x;
            const startY = tank.y + dir.y;

            // Check wall and Bounds immediately
            if (!this.grid.isValid(startX, startY)) {
                // Hit wall/boundary immediately
                this.events.push({ type: 'EXPLOSION', x: startX, y: startY, owner: tankId });
                tank.lastFeedback = 'BLOCKED';
                return;
            }

            // Check for immediate tank hit at spawn position
            for (const tid of ['P1', 'P2']) {
                const t = this.tanks[tid];
                if (t.hp > 0 && t.x === startX && t.y === startY) {
                    t.hp--;
                    this.log.push(`${tid} hit! HP: ${t.hp}`);
                    this.events.push({ type: 'EXPLOSION', x: startX, y: startY, owner: tankId, hitTank: tid });
                    return; // Bullet consumed
                }
            }

            // No immediate hit, create bullet
            this.bullets.push({
                x: startX,
                y: startY,
                dx: dir.x,
                dy: dir.y,
                owner: tankId,
                dist: 0
            });
        }
    }

    applyMovements(intents) {
        const p1Move = intents.P1;
        const p2Move = intents.P2;

        // 1. Check Target Validity (Walls)
        if (p1Move && !this.grid.isValid(p1Move.targetX, p1Move.targetY)) {
            this.tanks.P1.lastFeedback = 'WALL';
            delete intents.P1;
        }
        if (p2Move && !this.grid.isValid(p2Move.targetX, p2Move.targetY)) {
            this.tanks.P2.lastFeedback = 'WALL';
            delete intents.P2;
        }

        // 2. Check Head-on Collision (Swapping places)
        // If P1 wants P2's spot AND P2 wants P1's spot -> Cancel both
        if (intents.P1 && intents.P2) {
             if (intents.P1.targetX === this.tanks.P2.x && intents.P1.targetY === this.tanks.P2.y &&
                 intents.P2.targetX === this.tanks.P1.x && intents.P2.targetY === this.tanks.P1.y) {
                 this.tanks.P1.lastFeedback = 'COLLISION';
                 this.tanks.P2.lastFeedback = 'COLLISION';
                 delete intents.P1;
                 delete intents.P2;
             }
        }

        // 3. Check Same Target Collision
        if (intents.P1 && intents.P2) {
            if (intents.P1.targetX === intents.P2.targetX && intents.P1.targetY === intents.P2.targetY) {
                this.tanks.P1.lastFeedback = 'COLLISION';
                this.tanks.P2.lastFeedback = 'COLLISION';
                delete intents.P1;
                delete intents.P2;
            }
        }

        // 4. Check Collision with Stationary Tank
        if (intents.P1) {
             if (intents.P1.targetX === this.tanks.P2.x && intents.P1.targetY === this.tanks.P2.y) {
                this.tanks.P1.lastFeedback = 'BLOCKED';
                delete intents.P1;
             }
        }
        if (intents.P2) {
             if (intents.P2.targetX === this.tanks.P1.x && intents.P2.targetY === this.tanks.P1.y) {
                this.tanks.P2.lastFeedback = 'BLOCKED';
                delete intents.P2;
             }
        }

        // Apply what's left
        if (intents.P1) {
            this.tanks.P1.x = intents.P1.targetX;
            this.tanks.P1.y = intents.P1.targetY;
        }
        if (intents.P2) {
            this.tanks.P2.x = intents.P2.targetX;
            this.tanks.P2.y = intents.P2.targetY;
        }

        // Safety clamp: ensure tanks never exceed grid boundaries
        for (const tid of ['P1', 'P2']) {
            const t = this.tanks[tid];
            t.x = Math.max(0, Math.min(this.grid.width - 1, t.x));
            t.y = Math.max(0, Math.min(this.grid.height - 1, t.y));
        }
    }

    updateBullets() {
        const survivingBullets = [];
        
        // Move bullets (Speed = 2 tiles per tick, so we do 2 sub-steps)
        // Or just move 2 tiles at once? 
        // Move 1 tile, check collision, move 2nd tile, check collision.
        
        for (let b of this.bullets) {
            let active = true;
            for (let step = 0; step < 2; step++) {
                if (!active) break;
                
                b.x = b.x + b.dx;
                b.y = b.y + b.dy;
                b.dist++;

                // Max Range
                if (b.dist > 40) {
                    active = false;
                    continue;
                }

                // Wall/Bounds Collision
                // If isValid returns false, it hit a Wall OR Bounds
                if (!this.grid.isValid(b.x, b.y)) {
                    active = false;
                    this.events.push({ type: 'EXPLOSION', x: b.x, y: b.y, owner: b.owner }); // Track event
                    continue;
                }

                // Tank Collision
                for (let tid of ['P1', 'P2']) {
                    const t = this.tanks[tid];
                    if (t.hp > 0 && t.x === b.x && t.y === b.y) {
                        t.hp--;
                        active = false;
                        this.log.push(`${tid} hit! HP: ${t.hp}`);
                        this.events.push({ type: 'EXPLOSION', x: b.x, y: b.y, owner: b.owner, hitTank: tid });
                    }
                }
            }
            if (active) survivingBullets.push(b);
        }
        this.bullets = survivingBullets;
    }
}
