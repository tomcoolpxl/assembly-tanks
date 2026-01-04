import { CPU } from '../vm/CPU.js';
import { Tokenizer } from '../vm/Tokenizer.js';
import { Parser } from '../vm/Parser.js';
import { Grid } from './Grid.js';
import {
    TANK_IDS,
    GRID_WIDTH,
    GRID_HEIGHT,
    INITIAL_HP,
    MAX_OPS_PER_TURN,
    BULLET_MAX_RANGE,
    BULLET_SPEED,
    MAX_TURNS,
    START_POSITIONS,
    DIRS
} from '../constants.js';

export { TANK_IDS };

/**
 * @typedef {Object} Tank
 * @property {number} x - Grid X position (0-15)
 * @property {number} y - Grid Y position (0-9)
 * @property {number} facing - Direction (0=E, 1=S, 2=W, 3=N)
 * @property {number} hp - Health points (0-3)
 * @property {CPU|null} cpu - The tank's CPU instance
 * @property {string|null} lastAction - Last action type
 * @property {string|null} lastFeedback - Feedback message (WALL, BLOCKED, etc.)
 * @property {number} debugPC - Program counter for debugging
 * @property {string|null} debugIR - Instruction register for debugging
 * @property {Object} debugRegisters - Copy of registers for debugging
 * @property {number} turnOps - Operations this turn
 * @property {number} totalOps - Total operations executed
 */

/**
 * @typedef {Object} Bullet
 * @property {number} id - Unique bullet ID
 * @property {string} owner - Tank ID (P1 or P2)
 * @property {number} x - Grid X position
 * @property {number} y - Grid Y position
 * @property {number} dx - X direction (-1, 0, or 1)
 * @property {number} dy - Y direction (-1, 0, or 1)
 * @property {number} dist - Distance traveled
 */

/**
 * @typedef {Object} GameState
 * @property {Object<string, Tank>} tanks - Tank states keyed by ID
 * @property {Bullet[]} bullets - Active bullets
 * @property {string[]} log - Game log messages
 * @property {Object[]} events - Game events for visualization
 * @property {boolean} gameOver - Whether game has ended
 * @property {string|null} winner - Winner ID or draw message
 * @property {number} turnCount - Current turn number
 */

/**
 * Manages the battle simulation between two tanks.
 * Handles turn resolution, movement, bullets, and game state.
 */
export class BattleManager {
    constructor() {
        this.grid = new Grid(GRID_WIDTH, GRID_HEIGHT);
        this.tokenizer = new Tokenizer();
        this.parser = new Parser();

        this.tanks = {
            [TANK_IDS.P1]: { ...START_POSITIONS.P1, hp: INITIAL_HP, cpu: null, lastAction: null, lastFeedback: null, debugPC: 0, debugIR: null, debugRegisters: {}, turnOps: 0, totalOps: 0 },
            [TANK_IDS.P2]: { ...START_POSITIONS.P2, hp: INITIAL_HP, cpu: null, lastAction: null, lastFeedback: null, debugPC: 0, debugIR: null, debugRegisters: {}, turnOps: 0, totalOps: 0 }
        };

        this.bullets = [];
        this.log = [];
        this.events = [];
        this._logTick = (tankId, msg) => {
            const cpu = tankId === 'P1' ? 'CPU_1' : 'CPU_2';
            this.log.push(`[${cpu} T${String(this.turnCount).padStart(3, '0')}] ${msg}`);
        };
        this.isGameOver = false;
        this.winner = null;

        this.pendingActions = { P1: null, P2: null };
        this.turnOps = { P1: 0, P2: 0 };
        this.turnCount = 0;
        this.MAX_OPS = MAX_OPS_PER_TURN;
        this.eventIdCounter = 0;

        this.setupArena(1);
    }

    /**
     * Configure arena walls based on level
     * @param {number} level - Level number (1=empty, 2=center wall, 3=scattered obstacles)
     */
    setupArena(level = 1) {
        this.grid.walls.clear();
        if (level === 2) {
            this.grid.addWall(7, 4); this.grid.addWall(7, 5);
            this.grid.addWall(8, 4); this.grid.addWall(8, 5);
        } else if (level === 3) {
            const obstacles = [[4, 2], [4, 7], [12, 2], [12, 7], [8, 1], [8, 8]];
            obstacles.forEach(pos => this.grid.addWall(pos[0], pos[1]));
        }
    }

    /**
     * Load and parse assembly code for both tanks
     * @param {string} p1Code - Player 1 assembly source
     * @param {string} p2Code - Player 2 assembly source
     * @returns {{success: boolean, error?: string, p1Program?: Object[], p2Program?: Object[]}}
     */
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
            this.resetTurnState();
            return { success: true, p1Program: p1.program, p2Program: p2.program };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    resetTurnState() {
        this.pendingActions = { P1: null, P2: null };
        this.turnOps = { P1: 0, P2: 0 };
        this.turnCount = 0;
        this.isGameOver = false;
        this.winner = null;
        this.log = ["Turn reset."];
        this.events = [];
        this.bullets = [];

        // Reset tanks to starting positions
        this.tanks.P1.x = START_POSITIONS.P1.x;
        this.tanks.P1.y = START_POSITIONS.P1.y;
        this.tanks.P1.facing = START_POSITIONS.P1.facing;
        this.tanks.P1.hp = INITIAL_HP;
        this.tanks.P1.totalOps = 0;

        this.tanks.P2.x = START_POSITIONS.P2.x;
        this.tanks.P2.y = START_POSITIONS.P2.y;
        this.tanks.P2.facing = START_POSITIONS.P2.facing;
        this.tanks.P2.hp = INITIAL_HP;
        this.tanks.P2.totalOps = 0;
    }

    /**
     * Execute one CPU step for a tank
     * @param {string} tankId - Tank ID (P1 or P2)
     * @returns {Object|null} Action result from CPU step
     */
    stepCPU(tankId) {
        const tank = this.tanks[tankId];
        if (!tank.cpu || tank.hp <= 0) return null; 

        tank.lastFeedback = null;

        const hasActiveBullet = this.bullets.some(b => b.owner === tankId);
        tank.cpu.updateTankState(tank.x, tank.y, tank.facing, tank.hp, hasActiveBullet ? 0 : 1);

        const pc = tank.cpu.registers.PC;
        tank.debugPC = pc;
        if (pc < tank.cpu.program.length) {
            const instr = tank.cpu.program[pc];
            tank.debugIR = `${instr.opcode} ${instr.args.join(', ')}`;
        } else {
            tank.debugIR = 'HALT';
        }

        const result = tank.cpu.step();
        this.turnOps[tankId]++;
        tank.totalOps = (tank.totalOps || 0) + 1;
        tank.debugRegisters = { ...tank.cpu.registers };
        
        if (result && result.type === 'CPU_OP') {
            tank.lastAction = result.opcode; 
        } else if (result && result.type !== 'WAIT') {
            tank.lastAction = result.type;
            this.pendingActions[tankId] = result; 
        } else if (result && result.type === 'WAIT') {
            tank.lastFeedback = result.reason;
            this.pendingActions[tankId] = result;
        } else {
            tank.lastAction = 'HALT';
            this.pendingActions[tankId] = { type: 'HALT' };
        }
        return result;
    }

    addEvent(type, data) {
        this.events.push({ id: this.eventIdCounter++, type, ...data });
    }

    /**
     * Resolve a complete game turn: move bullets, resolve actions, apply movements
     */
    resolveTurn() {
        this.turnCount++;
        this.turnOps.P1 = 0;
        this.turnOps.P2 = 0;
        this.tanks.P1.lastFeedback = null;
        this.tanks.P2.lastFeedback = null;

        const p1Action = this.pendingActions.P1;
        const p2Action = this.pendingActions.P2;

        // 1. Update Existing Bullets (Move them before spawning new ones)
        this.updateBullets();

        // 2. Resolve Sensors
        if (p1Action && p1Action.type === 'SCAN') this.resolveScan(TANK_IDS.P1, p1Action);
        if (p2Action && p2Action.type === 'SCAN') this.resolveScan(TANK_IDS.P2, p2Action);
        if (p1Action && p1Action.type === 'PING') this.resolvePing(TANK_IDS.P1, p1Action);
        if (p2Action && p2Action.type === 'PING') this.resolvePing(TANK_IDS.P2, p2Action);

        // 3. Resolve Actions (Spawn new bullets, plan movement)
        const intents = {};
        this.resolveAction(TANK_IDS.P1, p1Action, intents);
        this.resolveAction(TANK_IDS.P2, p2Action, intents);

        // 4. Apply Movements
        this.applyMovements(intents);

        // Check for game over conditions
        if (this.tanks.P1.hp <= 0 && this.tanks.P2.hp <= 0) {
            this._logTick('P1', 'P1 destroyed!');
            this._logTick('P2', 'P2 destroyed!');
            this.isGameOver = true;
            this.winner = 'DRAW';
            this.log.push('=== DRAW - MUTUAL DESTRUCTION ===');
        } else if (this.tanks.P1.hp <= 0) {
            this._logTick('P1', 'P1 destroyed!');
            this.isGameOver = true;
            this.winner = 'P2';
            this.log.push('=== P2 WINS! ===');
        } else if (this.tanks.P2.hp <= 0) {
            this._logTick('P2', 'P2 destroyed!');
            this.isGameOver = true;
            this.winner = 'P1';
            this.log.push('=== P1 WINS! ===');
        }

        // Check for stalemate (both programs halted)
        if (!this.isGameOver && this.pendingActions.P1?.type === 'HALT' && this.pendingActions.P2?.type === 'HALT') {
            this.isGameOver = true;
            this.winner = 'DRAW (STALEMATE)';
            this.log.push('=== DRAW - STALEMATE ===');
        }

        // Check for turn limit (prevent infinite games)
        if (!this.isGameOver && this.turnCount >= MAX_TURNS) {
            this.isGameOver = true;
            this.winner = 'DRAW (TURN LIMIT)';
            this.log.push('=== DRAW - TURN LIMIT ===');
        }

        this.pendingActions.P1 = null;
        this.pendingActions.P2 = null;
    }

    /**
     * Get current game state for UI rendering
     * @returns {GameState}
     */
    getState() {
        return {
            tanks: JSON.parse(JSON.stringify(this.tanks)),
            bullets: [...this.bullets],
            log: [...this.log],
            events: [...this.events],
            gameOver: this.isGameOver,
            winner: this.winner,
            turnCount: this.turnCount
        };
    }

    resolveScan(tankId, action) {
        const tank = this.tanks[tankId];
        const dir = DIRS[tank.facing];
        const entityMap = new Map();
        const enemyId = tankId === 'P1' ? 'P2' : 'P1';
        const enemy = this.tanks[enemyId];
        if (enemy.hp > 0) entityMap.set(`${enemy.x},${enemy.y}`, enemyId);

        const result = this.grid.raycast(tank.x, tank.y, dir.x, dir.y, tankId, enemyId, entityMap);
        tank.cpu.setRegister(action.destDist, result.distance);
        tank.cpu.setRegister(action.destType, result.type);

        const typeNames = ['EMPTY', 'WALL', 'TANK'];
        this._logTick(tankId, `${tankId} scans: ${typeNames[result.type] || 'EMPTY'} at dist ${result.distance}`);
    }

    resolvePing(tankId, action) {
        const tank = this.tanks[tankId];
        const enemyId = tankId === 'P1' ? 'P2' : 'P1';
        const enemy = this.tanks[enemyId];
        if (enemy.hp > 0) {
            tank.cpu.setRegister(action.destX, enemy.x);
            tank.cpu.setRegister(action.destY, enemy.y);
            this.addEvent('PING', { tankId: tankId, x: tank.x, y: tank.y, enemyX: enemy.x, enemyY: enemy.y });
            this._logTick(tankId, `${tankId} pings: enemy at (${enemy.x},${enemy.y})`);
        } else {
            tank.cpu.setRegister(action.destX, -1);
            tank.cpu.setRegister(action.destY, -1);
            this.addEvent('PING', { tankId: tankId, x: tank.x, y: tank.y, enemyX: -1, enemyY: -1 });
            this._logTick(tankId, `${tankId} pings: no enemy`);
        }
    }

    resolveAction(tankId, action, intents) {
        if (!action || ['DEAD', 'HALT', 'WAIT'].includes(action.type)) return;
        const tank = this.tanks[tankId];

        if (action.type === 'ROTATE') {
            const dirName = action.dir === 'LEFT' ? 'left' : 'right';
            if (action.dir === 'LEFT') tank.facing = (tank.facing + 3) % 4;
            if (action.dir === 'RIGHT') tank.facing = (tank.facing + 1) % 4;
            this._logTick(tankId, `${tankId} turns ${dirName}`);
        }
        else if (action.type === 'MOVE') {
            let dirIdx = tank.facing;
            if (action.dir === 'BACKWARD') dirIdx = (dirIdx + 2) % 4;
            intents[tankId] = { targetX: tank.x + DIRS[dirIdx].x, targetY: tank.y + DIRS[dirIdx].y };
        }
        else if (action.type === 'FIRE') {
            const hasActiveBullet = this.bullets.some(b => b.owner === tankId);
            if (hasActiveBullet) {
                tank.lastFeedback = 'RELOADING';
                this._logTick(tankId, `${tankId} fires (reloading)`);
                return;
            }

            const dir = DIRS[tank.facing];
            const startX = tank.x + dir.x;
            const startY = tank.y + dir.y;

            if (!this.grid.isValid(startX, startY)) {
                this.addEvent('EXPLOSION', { x: startX, y: startY, owner: tankId });
                tank.lastFeedback = 'BLOCKED';
                this._logTick(tankId, `${tankId} fires (blocked)`);
                return;
            }

            const enemyId = tankId === 'P1' ? 'P2' : 'P1';
            const enemy = this.tanks[enemyId];
            if (enemy.hp > 0 && enemy.x === startX && enemy.y === startY) {
                enemy.hp--;
                this._logTick(tankId, `${tankId} fires - direct hit! ${enemyId} HP: ${enemy.hp}`);
                this.addEvent('EXPLOSION', { x: startX, y: startY, owner: tankId, hitTank: enemyId });
                return;
            }

            this._logTick(tankId, `${tankId} fires`);
            this.bullets.push({
                id: this.eventIdCounter++,
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
        // Collision resolution priority (in order):
        // 1. WALL - Tank tries to move into wall or out of bounds (highest priority)
        // 2. COLLISION - Head-on: both tanks try to swap positions
        // 3. COLLISION - Same target: both tanks try to move to same cell
        // 4. BLOCKED - Tank tries to move into other tank's current cell
        // Note: Once a tank's intent is rejected, it's removed from further checks

        const p1Move = intents.P1;
        const p2Move = intents.P2;

        // 1. Wall collision (highest priority)
        if (p1Move && !this.grid.isValid(p1Move.targetX, p1Move.targetY)) {
            this.tanks.P1.lastFeedback = 'WALL';
            delete intents.P1;
        }
        if (p2Move && !this.grid.isValid(p2Move.targetX, p2Move.targetY)) {
            this.tanks.P2.lastFeedback = 'WALL';
            delete intents.P2;
        }

        // 2. Head-on collision (both tanks try to swap positions)
        if (intents.P1 && intents.P2 &&
            intents.P1.targetX === this.tanks.P2.x && intents.P1.targetY === this.tanks.P2.y &&
            intents.P2.targetX === this.tanks.P1.x && intents.P2.targetY === this.tanks.P1.y) {
            this.tanks.P1.lastFeedback = 'COLLISION';
            this.tanks.P2.lastFeedback = 'COLLISION';
            delete intents.P1;
            delete intents.P2;
        }

        // 3. Same-target collision (both tanks try to move to same cell)
        if (intents.P1 && intents.P2 &&
            intents.P1.targetX === intents.P2.targetX && intents.P1.targetY === intents.P2.targetY) {
            this.tanks.P1.lastFeedback = 'COLLISION';
            this.tanks.P2.lastFeedback = 'COLLISION';
            delete intents.P1;
            delete intents.P2;
        }

        // 4. Blocked by other tank (one tank tries to move into other's current position)
        if (intents.P1 && intents.P1.targetX === this.tanks.P2.x && intents.P1.targetY === this.tanks.P2.y) {
            this.tanks.P1.lastFeedback = 'BLOCKED';
            delete intents.P1;
        }
        if (intents.P2 && intents.P2.targetX === this.tanks.P1.x && intents.P2.targetY === this.tanks.P1.y) {
            this.tanks.P2.lastFeedback = 'BLOCKED';
            delete intents.P2;
        }

        // Log move results
        if (p1Move) {
            if (intents.P1) {
                this.tanks.P1.x = intents.P1.targetX;
                this.tanks.P1.y = intents.P1.targetY;
                this._logTick('P1', `P1 moves to (${this.tanks.P1.x},${this.tanks.P1.y})`);
            } else {
                this._logTick('P1', `P1 moves (${this.tanks.P1.lastFeedback.toLowerCase()})`);
            }
        }
        if (p2Move) {
            if (intents.P2) {
                this.tanks.P2.x = intents.P2.targetX;
                this.tanks.P2.y = intents.P2.targetY;
                this._logTick('P2', `P2 moves to (${this.tanks.P2.x},${this.tanks.P2.y})`);
            } else {
                this._logTick('P2', `P2 moves (${this.tanks.P2.lastFeedback.toLowerCase()})`);
            }
        }

        for (const tid of ['P1', 'P2']) {
            const t = this.tanks[tid];
            t.x = Math.max(0, Math.min(this.grid.width - 1, t.x));
            t.y = Math.max(0, Math.min(this.grid.height - 1, t.y));
        }
    }

    updateBullets() {
        const surviving = [];
        for (let b of this.bullets) {
            let active = true;
            for (let i = 0; i < BULLET_SPEED; i++) {
                if (!active) break;
                b.x += b.dx; b.y += b.dy; b.dist++;
                if (b.dist > BULLET_MAX_RANGE) { active = false; continue; }
                
                if (!this.grid.isValid(b.x, b.y)) {
                    active = false;
                    this.addEvent('EXPLOSION', { x: b.x, y: b.y, owner: b.owner });
                    continue;
                }

                for (const tid of ['P1', 'P2']) {
                    if (tid === b.owner) continue; // Bullets can't hit their owner
                    const t = this.tanks[tid];
                    if (t.hp > 0 && t.x === b.x && t.y === b.y) {
                        t.hp--;
                        active = false;
                        this._logTick(b.owner, `${b.owner} bullet hits ${tid}! HP: ${t.hp}`);
                        this.addEvent('EXPLOSION', { x: b.x, y: b.y, owner: b.owner, hitTank: tid });
                    }
                }
            }
            if (active) surviving.push(b);
        }
        this.bullets = surviving;
    }
}