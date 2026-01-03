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
        this.grid = new Grid(16, 10);
        this.tokenizer = new Tokenizer();
        this.parser = new Parser();
        
        this.tanks = {
            [TANK_IDS.P1]: { x: 0, y: 4, facing: 0, hp: 3, cpu: null, lastAction: null, lastFeedback: null, debugPC: 0, debugIR: null, debugRegisters: {}, turnOps: 0, totalOps: 0 },
            [TANK_IDS.P2]: { x: 15, y: 5, facing: 2, hp: 3, cpu: null, lastAction: null, lastFeedback: null, debugPC: 0, debugIR: null, debugRegisters: {}, turnOps: 0, totalOps: 0 }
        };
        
        this.bullets = []; 
        this.log = []; 
        this.events = []; 
        this.isGameOver = false;
        this.winner = null;
        
        this.pendingActions = { P1: null, P2: null };
        this.turnOps = { P1: 0, P2: 0 };
        this.turnCount = 0;
        this.MAX_OPS = 50; 
        this.eventIdCounter = 0;

        this.setupArena(1);
    }

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
        
        this.tanks.P1.x = 0; this.tanks.P1.y = 4; this.tanks.P1.facing = 0; this.tanks.P1.hp = 3; this.tanks.P1.totalOps = 0;
        this.tanks.P2.x = 15; this.tanks.P2.y = 5; this.tanks.P2.facing = 2; this.tanks.P2.hp = 3; this.tanks.P2.totalOps = 0;
    }

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

        if (this.tanks.P1.hp <= 0 && this.tanks.P2.hp <= 0) { this.isGameOver = true; this.winner = 'DRAW'; }
        else if (this.tanks.P1.hp <= 0) { this.isGameOver = true; this.winner = 'P2'; }
        else if (this.tanks.P2.hp <= 0) { this.isGameOver = true; this.winner = 'P1'; }
        
        if (!this.isGameOver && this.pendingActions.P1?.type === 'HALT' && this.pendingActions.P2?.type === 'HALT') {
            this.isGameOver = true;
            this.winner = 'DRAW (STALEMATE)';
        }

        this.pendingActions.P1 = null;
        this.pendingActions.P2 = null;
    }

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
    }

    resolvePing(tankId, action) {
        const tank = this.tanks[tankId];
        const enemyId = tankId === 'P1' ? 'P2' : 'P1';
        const enemy = this.tanks[enemyId];
        if (enemy.hp > 0) {
            tank.cpu.setRegister(action.destX, enemy.x);
            tank.cpu.setRegister(action.destY, enemy.y);
        } else {
            tank.cpu.setRegister(action.destX, -1);
            tank.cpu.setRegister(action.destY, -1);
        }
        this.addEvent('PING', { tankId: tankId, x: tank.x, y: tank.y, enemyX: enemy.x, enemyY: enemy.y });
    }

    resolveAction(tankId, action, intents) {
        if (!action || ['DEAD', 'HALT', 'WAIT'].includes(action.type)) return;
        const tank = this.tanks[tankId];

        if (action.type === 'ROTATE') {
            if (action.dir === 'LEFT') tank.facing = (tank.facing + 3) % 4;
            if (action.dir === 'RIGHT') tank.facing = (tank.facing + 1) % 4;
        } 
        else if (action.type === 'MOVE') {
            let dirIdx = tank.facing;
            if (action.dir === 'BACKWARD') dirIdx = (dirIdx + 2) % 4;
            intents[tankId] = { targetX: tank.x + DIRS[dirIdx].x, targetY: tank.y + DIRS[dirIdx].y };
        }
        else if (action.type === 'FIRE') {
            const hasActiveBullet = this.bullets.some(b => b.owner === tankId);
            if (hasActiveBullet) { tank.lastFeedback = 'RELOADING'; return; }

            const dir = DIRS[tank.facing];
            const startX = tank.x + dir.x;
            const startY = tank.y + dir.y;

            if (!this.grid.isValid(startX, startY)) {
                this.addEvent('EXPLOSION', { x: startX, y: startY, owner: tankId });
                tank.lastFeedback = 'BLOCKED';
                return;
            }

            const enemyId = tankId === 'P1' ? 'P2' : 'P1';
            const enemy = this.tanks[enemyId];
            if (enemy.hp > 0 && enemy.x === startX && enemy.y === startY) {
                enemy.hp--;
                this.log.push(`${tankId} hit! HP: ${enemy.hp}`);
                this.addEvent('EXPLOSION', { x: startX, y: startY, owner: tankId, hitTank: enemyId });
                return;
            }

            this.bullets.push({
                id: this.eventIdCounter++, // Use event counter or separate? Separate is safer but event counter is fine for unique ID
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

        if (p1Move && !this.grid.isValid(p1Move.targetX, p1Move.targetY)) {
            this.tanks.P1.lastFeedback = 'WALL'; delete intents.P1;
        }
        if (p2Move && !this.grid.isValid(p2Move.targetX, p2Move.targetY)) {
            this.tanks.P2.lastFeedback = 'WALL'; delete intents.P2;
        }

        if (intents.P1 && intents.P2 && 
            intents.P1.targetX === this.tanks.P2.x && intents.P1.targetY === this.tanks.P2.y &&
            intents.P2.targetX === this.tanks.P1.x && intents.P2.targetY === this.tanks.P1.y) {
            this.tanks.P1.lastFeedback = 'COLLISION'; this.tanks.P2.lastFeedback = 'COLLISION';
            delete intents.P1; delete intents.P2;
        }

        if (intents.P1 && intents.P2 && 
            intents.P1.targetX === intents.P2.targetX && intents.P1.targetY === intents.P2.targetY) {
            this.tanks.P1.lastFeedback = 'COLLISION'; this.tanks.P2.lastFeedback = 'COLLISION';
            delete intents.P1; delete intents.P2;
        }

        if (intents.P1 && intents.P1.targetX === this.tanks.P2.x && intents.P1.targetY === this.tanks.P2.y) {
            this.tanks.P1.lastFeedback = 'BLOCKED'; delete intents.P1;
        }
        if (intents.P2 && intents.P2.targetX === this.tanks.P1.x && intents.P2.targetY === this.tanks.P1.y) {
            this.tanks.P2.lastFeedback = 'BLOCKED'; delete intents.P2;
        }

        if (intents.P1) { this.tanks.P1.x = intents.P1.targetX; this.tanks.P1.y = intents.P1.targetY; }
        if (intents.P2) { this.tanks.P2.x = intents.P2.targetX; this.tanks.P2.y = intents.P2.targetY; }
        
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
            for (let i = 0; i < 2; i++) {
                if (!active) break;
                b.x += b.dx; b.y += b.dy; b.dist++;
                if (b.dist > 40) { active = false; continue; }
                
                if (!this.grid.isValid(b.x, b.y)) {
                    active = false;
                    this.addEvent('EXPLOSION', { x: b.x, y: b.y, owner: b.owner });
                    continue;
                }

                for (const tid of ['P1', 'P2']) {
                    const t = this.tanks[tid];
                    if (t.hp > 0 && t.x === b.x && t.y === b.y) {
                        t.hp--;
                        active = false;
                        this.log.push(`${tid} hit! HP: ${t.hp}`);
                        this.addEvent('EXPLOSION', { x: b.x, y: b.y, owner: b.owner, hitTank: tid });
                    }
                }
            }
            if (active) surviving.push(b);
        }
        this.bullets = surviving;
    }
}