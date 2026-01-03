import { OPCODES, REGISTERS } from './InstructionSet.js';

export class SimpleCompiler {
    constructor() {
        this.labelCount = 0;
        this.output = [];
        this.MAX_DEPTH = 50;
    }

    compile(source) {
        this.output = [];
        this.labelCount = 0;
        // Clean lines: trim, remove comments, skip empty
        const lines = source.split('\n')
            .map(l => l.trim())
            .filter(l => l && !l.startsWith('#') && !l.startsWith(';'));
        
        const contextStack = []; // Track nested 'if', 'while', 'repeat'

        lines.forEach((line) => {
            try {
                // Check nesting depth
                if (['if ', 'while ', 'repeat '].some(k => line.startsWith(k))) {
                    if (contextStack.length >= this.MAX_DEPTH) {
                        throw new Error(`Nesting limit exceeded (Max ${this.MAX_DEPTH})`);
                    }
                }

                // 1. Assignments
                if (line.includes('=') && !line.startsWith('if') && !line.startsWith('while')) {
                    this.parseAssignment(line);
                    return;
                }

                // 2. Simple Actions (no args)
                if (['move', 'turn_left', 'turn_right', 'fire', 'wait'].includes(line)) {
                    this.parseAction(line);
                    return;
                }

                // 3. Sensors
                if (line.startsWith('scan(') || line.startsWith('ping(')) {
                    this.parseSensor(line);
                    return;
                }

                // 4. Control Flow: REPEAT
                if (line.startsWith('repeat ')) {
                    const arg = line.replace('repeat ', '').replace(':', '').trim();
                    const startLabel = `__loop_${this.labelCount++}`;
                    
                    // repeat can take a number or a variable
                    const reg = this.extractReg(arg);
                    
                    // Validation: Ensure it's a register, not a number
                    if (typeof reg === 'number') {
                        throw new Error("Repeat loop requires a variable (e.g., 'repeat var0')");
                    }

                    // Check for register collision in nested repeats
                    for (const ctx of contextStack) {
                        if (ctx.type === 'repeat' && ctx.reg === reg) {
                            throw new Error(`Register collision: Register ${reg} is already used by an enclosing repeat loop.`);
                        }
                    }

                    this.emit(`LBL ${startLabel}`);
                    contextStack.push({ type: 'repeat', label: startLabel, reg: reg });
                    return;
                }

                // 5. Control Flow: WHILE
                if (line.startsWith('while ')) {
                    const startLabel = `__while_start_${this.labelCount}`;
                    const endLabel = `__while_end_${this.labelCount}`;
                    this.labelCount++;
                    
                    this.emit(`LBL ${startLabel}`);
                    this.parseCondition(line.replace('while ', '').replace(':', ''), endLabel);
                    
                    contextStack.push({ type: 'while', start: startLabel, end: endLabel });
                    return;
                }

                // 6. Control Flow: IF
                if (line.startsWith('if ')) {
                    const elseLabel = `__if_else_${this.labelCount}`;
                    const endLabel = `__if_end_${this.labelCount}`;
                    this.labelCount++;

                    this.parseCondition(line.replace('if ', '').replace(':', ''), elseLabel);
                    
                    contextStack.push({ type: 'if', elseLbl: elseLabel, endLbl: endLabel, hasElse: false });
                    return;
                }

                // 7. ELSE
                if (line === 'else:' || line === 'else') {
                    const ctx = contextStack[contextStack.length - 1];
                    if (!ctx || ctx.type !== 'if') throw new Error("Unexpected 'else'");
                    
                    this.emit(`JMP ${ctx.endLbl}`);
                    this.emit(`LBL ${ctx.elseLbl}`);
                    ctx.hasElse = true;
                    return;
                }

                // 8. END
                if (line === 'end') {
                    const ctx = contextStack.pop();
                    if (!ctx) throw new Error("Unexpected 'end'");

                    if (ctx.type === 'repeat') {
                        this.emit(`DJNZ ${ctx.reg}, ${ctx.label}`);
                    }
                    else if (ctx.type === 'while') {
                        this.emit(`JMP ${ctx.start}`);
                        this.emit(`LBL ${ctx.end}`);
                    }
                    else if (ctx.type === 'if') {
                        if (!ctx.hasElse) {
                            this.emit(`LBL ${ctx.elseLbl}`);
                        }
                        this.emit(`LBL ${ctx.endLbl}`);
                    }
                    return;
                }
                
                throw new Error(`Unknown command: "${line}"`);

            } catch (err) {
                throw new Error(`Line "${line}": ${err.message}`);
            }
        });

        if (contextStack.length > 0) throw new Error("Unclosed block (missing 'end')");

        return this.output.join('\n');
    }

    emit(asm) {
        this.output.push(asm);
    }

    extractReg(str) {
        const s = str.trim().toLowerCase();
        // General purpose variables: var0-var5 -> R0-R5
        const varMatch = s.match(/^var([0-5])$/);
        if (varMatch) return `R${varMatch[1]}`;
        // Read-only position/direction registers
        if (s === 'posx') return 'PX';
        if (s === 'posy') return 'PY';
        if (s === 'dir') return 'DIR';
        // Literal numbers
        if (/^-?\d+$/.test(s)) return parseInt(s, 10);
        throw new Error(`Invalid variable or number: "${s}"`);
    }

    parseAction(cmd) {
        const map = {
            'move': 'MOV_F',
            'turn_left': 'ROT_L',
            'turn_right': 'ROT_R',
            'fire': 'FIRE',
            'wait': 'NOP'
        };
        this.emit(map[cmd]);
    }

    parseAssignment(line) {
        const parts = line.split('=');
        const target = this.extractReg(parts[0].trim());
        const expr = parts[1].trim();

        if (expr.includes('+')) {
            const operands = expr.split('+');
            const left = this.extractReg(operands[0].trim());
            const right = this.extractReg(operands[1].trim());
            // If target != left operand, need to SET first
            if (target !== left) {
                this.emit(`SET ${target}, ${left}`);
            }
            this.emit(`ADD ${target}, ${right}`);
        } else if (expr.includes('-') && !expr.startsWith('-')) {
            // Subtraction (but not negative number like -5)
            const operands = expr.split('-');
            const left = this.extractReg(operands[0].trim());
            const right = this.extractReg(operands[1].trim());
            // If target != left operand, need to SET first
            if (target !== left) {
                this.emit(`SET ${target}, ${left}`);
            }
            this.emit(`SUB ${target}, ${right}`);
        } else {
            this.emit(`SET ${target}, ${this.extractReg(expr)}`);
        }
    }

    parseSensor(line) {
        const content = line.substring(line.indexOf('(') + 1, line.indexOf(')'));
        const args = content.split(',').map(s => this.extractReg(s.trim()));
        if (line.startsWith('scan')) this.emit(`SCAN ${args[0]}, ${args[1]}`);
        else if (line.startsWith('ping')) this.emit(`PING ${args[0]}, ${args[1]}`);
    }

    parseCondition(condStr, failLabel) {
        let op = '', asmJump = '';
        
        if (condStr.includes('==')) { op = '=='; asmJump = 'JNE'; }
        else if (condStr.includes('!=')) { op = '!='; asmJump = 'JE'; }
        else if (condStr.includes('>')) { op = '>'; asmJump = 'JLE'; } // Jump if Less or Equal (False)
        else if (condStr.includes('<')) { op = '<'; asmJump = 'JGE'; } // Jump if Greater or Equal (False)
        else throw new Error(`Unsupported operator in condition: "${condStr}"`);

        const parts = condStr.split(op);
        const p1 = this.extractReg(parts[0]);
        const p2 = this.extractReg(parts[1]);
        
        this.emit(`CMP ${p1}, ${p2}`);
        this.emit(`${asmJump} ${failLabel}`);
    }
}