import { REGISTERS, OPCODES, READ_ONLY_REGISTERS } from './InstructionSet.js';

export class CPU {
    constructor(program, labels) {
        this.program = program; // Array of { opcode, args }
        this.labels = labels;   // Map of "LabelName" -> Program Index

        this.registers = {
            [REGISTERS.R0]: 0,
            [REGISTERS.R1]: 0,
            [REGISTERS.R2]: 0,
            [REGISTERS.R3]: 0,
            [REGISTERS.R4]: 0,
            [REGISTERS.R5]: 0,
            [REGISTERS.ACC]: 0,
            [REGISTERS.PC]: 0,
            [REGISTERS.CMP]: 0,
            [REGISTERS.PX]: 0,   // Tank X position (read-only, set by BattleManager)
            [REGISTERS.PY]: 0,   // Tank Y position (read-only, set by BattleManager)
            [REGISTERS.DIR]: 0,  // Tank direction (read-only, set by BattleManager)
            [REGISTERS.HP]: 0,   // Tank HP (read-only)
            [REGISTERS.AMMO]: 0, // Tank Ammo (read-only)
        };

        this.yieldAction = null; // Output for the Simulator (e.g., { type: 'MOVE', direction: 'F' })
        this.isDone = false;
        this.maxOps = 50; // Infinite loop protection per tick
    }

    /**
     * Executes instructions until an ACTION is performed (yield) or MAX_OPS reached.
     * @returns {Object|null} Action object or null if finished/waiting
     */
    step() {
        this.yieldAction = null;
        let ops = 0;

        while (ops < this.maxOps) {
            if (this.registers.PC >= this.program.length) {
                this.isDone = true;
                return null; // End of program
            }

            const instruction = this.program[this.registers.PC];
            this.registers.PC++; // Advance PC immediately (Jumps will overwrite this)

            const { opcode, args } = instruction;
            
            // Execute Logic
            const result = this.executeInstruction(opcode, args);

            ops++;

            // If an Action was produced, stop and return it.
            if (result) {
                return result;
            }
        }
        
        // If we exit loop without returning, we hit MAX_OPS. 
        // We yield "WAIT" to the simulator so we don't freeze the browser.
        return { type: 'WAIT', reason: 'MAX_OPS' };
    }

    executeInstruction(opcode, args) {
        switch (opcode) {
            // --- ACTIONS (Return objects) ---
            case OPCODES.NOP:   return { type: 'NOP' };
            case OPCODES.MOV_F: return { type: 'MOVE', dir: 'FORWARD' };
            case OPCODES.MOV_B: return { type: 'MOVE', dir: 'BACKWARD' };
            case OPCODES.ROT_L: return { type: 'ROTATE', dir: 'LEFT' };
            case OPCODES.ROT_R: return { type: 'ROTATE', dir: 'RIGHT' };
            case OPCODES.FIRE:  return { type: 'FIRE' };
            
            // --- SENSORS (Instant) ---
            case OPCODES.SCAN:
                // Scan is special. It requires interaction with the World.
                // The CPU calculates the intent, but the Simulator performs the Raycast.
                // WE MUST YIELD to the simulator to get the data.
                return { type: 'SCAN', destDist: args[0], destType: args[1] };
                
            case OPCODES.PING:
                return { type: 'PING', destX: args[0], destY: args[1] };

            // --- FLOW CONTROL ---
            case OPCODES.JMP:
                this.jump(args[0]);
                break;
            case OPCODES.CMP:
                this.compare(args[0], args[1]);
                break;
            case OPCODES.JE:
                if (this.registers.CMP === 0) this.jump(args[0]);
                break;
            case OPCODES.JNE:
                if (this.registers.CMP !== 0) this.jump(args[0]);
                break;
            case OPCODES.JG:
                if (this.registers.CMP === 1) this.jump(args[0]);
                break;
            case OPCODES.JL:
                if (this.registers.CMP === -1) this.jump(args[0]);
                break;
            case OPCODES.JGE:
                if (this.registers.CMP >= 0) this.jump(args[0]);
                break;
            case OPCODES.JLE:
                if (this.registers.CMP <= 0) this.jump(args[0]);
                break;
            case OPCODES.DJNZ:
                // Ensure args[0] is a valid writable register
                if (this.registers[args[0]] !== undefined && !READ_ONLY_REGISTERS.includes(args[0])) {
                    this.registers[args[0]]--;
                    if (this.registers[args[0]] !== 0) this.jump(args[1]);
                }
                break;

            // --- MATH ---
            case OPCODES.SET:
                if (!READ_ONLY_REGISTERS.includes(args[0])) {
                    this.registers[args[0]] = this.getValue(args[1]);
                }
                break;
            case OPCODES.ADD:
                if (!READ_ONLY_REGISTERS.includes(args[0])) {
                    this.registers[args[0]] += this.getValue(args[1]);
                }
                break;
            case OPCODES.SUB:
                if (!READ_ONLY_REGISTERS.includes(args[0])) {
                    this.registers[args[0]] -= this.getValue(args[1]);
                }
                break;
        }
        return null; // Continue execution
    }

    // Helper: Jump to Label
    jump(labelName) {
        const addr = this.labels[labelName];
        if (addr !== undefined) {
            this.registers.PC = addr;
        } else {
            console.error(`Runtime Error: Label '${labelName}' not found.`);
        }
    }

    // Helper: Compare
    compare(reg, valOrReg) {
        const v1 = this.registers[reg];
        const v2 = this.getValue(valOrReg);
        if (v1 === v2) this.registers.CMP = 0;
        else if (v1 > v2) this.registers.CMP = 1;
        else this.registers.CMP = -1;
    }

    // Helper: Get Value (Register or Number)
    getValue(arg) {
        if (typeof arg === 'number') return arg;
        if (this.registers[arg] !== undefined) return this.registers[arg];
        // Error case
        return 0;
    }
    
    // External Input: Used by Simulator to write SCAN results
    setRegister(reg, val) {
        if (this.registers[reg] !== undefined && !READ_ONLY_REGISTERS.includes(reg)) {
            this.registers[reg] = val;
        }
    }

    // Update tank position and direction (called by BattleManager before each step)
    updateTankState(x, y, direction, hp, ammo) {
        this.registers[REGISTERS.PX] = x;
        this.registers[REGISTERS.PY] = y;
        this.registers[REGISTERS.DIR] = direction;
        this.registers[REGISTERS.HP] = hp;
        this.registers[REGISTERS.AMMO] = ammo;
    }
}
