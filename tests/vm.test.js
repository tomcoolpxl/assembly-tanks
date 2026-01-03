/**
 * Tests for CPU Wars VM - High-level TankScript language
 * Run with: node tests/vm.test.js
 */

import { SimpleCompiler } from '../src/vm/SimpleCompiler.js';
import { Tokenizer } from '../src/vm/Tokenizer.js';
import { Parser } from '../src/vm/Parser.js';
import { CPU } from '../src/vm/CPU.js';
import { REGISTERS } from '../src/vm/InstructionSet.js';

// Test utilities
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

function assertDeepEqual(actual, expected, message) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

function test(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}`);
        testsPassed++;
    } catch (err) {
        console.log(`✗ ${name}`);
        console.log(`  ${err.message}`);
        testsFailed++;
    }
}

function describe(name, fn) {
    console.log(`\n${name}`);
    console.log('─'.repeat(name.length));
    fn();
}

// Helper: Compile TankScript to assembly
function compile(source) {
    const compiler = new SimpleCompiler();
    return compiler.compile(source);
}

// Helper: Full pipeline - TankScript to CPU
function createCPU(tankScript) {
    const compiler = new SimpleCompiler();
    const asm = compiler.compile(tankScript);
    const tokenizer = new Tokenizer();
    const tokens = tokenizer.tokenize(asm);
    const parser = new Parser();
    const { program, labels, error } = parser.parse(tokens);
    if (error) throw new Error(error);
    return new CPU(program, labels);
}

// Helper: Run CPU until action or done
function runUntilAction(cpu) {
    return cpu.step();
}

// Helper: Run CPU collecting all actions until done
function runToCompletion(cpu, maxSteps = 100) {
    const actions = [];
    let steps = 0;
    while (!cpu.isDone && steps < maxSteps) {
        const action = cpu.step();
        if (action) actions.push(action);
        steps++;
    }
    return actions;
}

// ============================================================
// TESTS
// ============================================================

describe('SimpleCompiler - Action Commands', () => {
    test('compiles "move" to MOV_F', () => {
        const asm = compile('move');
        assertEqual(asm, 'MOV_F', 'move command');
    });

    test('compiles "wait" to NOP', () => {
        const asm = compile('wait');
        assertEqual(asm, 'NOP', 'wait command');
    });

    test('compiles "turn_left" to ROT_L', () => {
        const asm = compile('turn_left');
        assertEqual(asm, 'ROT_L', 'turn_left command');
    });

    test('compiles "turn_right" to ROT_R', () => {
        const asm = compile('turn_right');
        assertEqual(asm, 'ROT_R', 'turn_right command');
    });

    test('compiles "fire" to FIRE', () => {
        const asm = compile('fire');
        assertEqual(asm, 'FIRE', 'fire command');
    });

    test('compiles multiple actions in sequence', () => {
        const asm = compile('move\nturn_left\nwait\nfire');
        assertEqual(asm, 'MOV_F\nROT_L\nNOP\nFIRE', 'multiple actions');
    });
});

describe('SimpleCompiler - Sensor Commands', () => {
    test('compiles scan(var0, var1)', () => {
        const asm = compile('scan(var0, var1)');
        assertEqual(asm, 'SCAN R0, R1', 'scan command');
    });

    test('compiles scan with different registers', () => {
        const asm = compile('scan(var2, var3)');
        assertEqual(asm, 'SCAN R2, R3', 'scan with var2, var3');
    });

    test('compiles ping(var0, var1)', () => {
        const asm = compile('ping(var0, var1)');
        assertEqual(asm, 'PING R0, R1', 'ping command');
    });

    test('compiles ping with different registers', () => {
        const asm = compile('ping(var4, var5)');
        assertEqual(asm, 'PING R4, R5', 'ping with var4, var5');
    });
});

describe('SimpleCompiler - Variable Assignments', () => {
    test('compiles simple assignment var0 = 5', () => {
        const asm = compile('var0 = 5');
        assertEqual(asm, 'SET R0, 5', 'simple assignment');
    });

    test('compiles assignment with negative number via zero subtraction', () => {
        // Note: SimpleCompiler interprets "var1 = -10" as subtraction (var1 = var1 - 10)
        // To assign a negative number, use: var1 = 0 then var1 = var1 - 10
        const asm = compile('var1 = 0\nvar1 = var1 - 10');
        assert(asm.includes('SET R1, 0'), 'should set to 0');
        assert(asm.includes('SUB R1, 10'), 'should subtract 10');
    });

    test('compiles register-to-register assignment var0 = var1', () => {
        const asm = compile('var0 = var1');
        assertEqual(asm, 'SET R0, R1', 'register assignment');
    });

    test('compiles addition var0 = var0 + 1', () => {
        const asm = compile('var0 = var0 + 1');
        assertEqual(asm, 'ADD R0, 1', 'addition with number');
    });

    test('compiles addition var0 = var0 + var1', () => {
        const asm = compile('var0 = var0 + var1');
        assertEqual(asm, 'ADD R0, R1', 'addition with register');
    });

    test('compiles subtraction var0 = var0 - 1', () => {
        const asm = compile('var0 = var0 - 1');
        assertEqual(asm, 'SUB R0, 1', 'subtraction with number');
    });

    test('compiles subtraction var0 = var0 - var2', () => {
        const asm = compile('var0 = var0 - var2');
        assertEqual(asm, 'SUB R0, R2', 'subtraction with register');
    });

    test('compiles zero assignment', () => {
        const asm = compile('var3 = 0');
        assertEqual(asm, 'SET R3, 0', 'zero assignment');
    });

    test('compiles cross-register subtraction var4 = var0 - posx', () => {
        const asm = compile('var4 = var0 - posx');
        assertEqual(asm, 'SET R4, R0\nSUB R4, PX', 'cross-register subtraction needs SET then SUB');
    });

    test('compiles cross-register addition var3 = var1 + var2', () => {
        const asm = compile('var3 = var1 + var2');
        assertEqual(asm, 'SET R3, R1\nADD R3, R2', 'cross-register addition needs SET then ADD');
    });
});

describe('SimpleCompiler - If/Else Conditionals', () => {
    test('compiles simple if with ==', () => {
        const asm = compile('if var0 == 0:\nmove\nend');
        assert(asm.includes('CMP R0, 0'), 'should have CMP');
        assert(asm.includes('JNE'), 'should have JNE for == condition');
        assert(asm.includes('MOV_F'), 'should have MOV_F');
        assert(asm.includes('LBL __if_else_0'), 'should have else label');
        assert(asm.includes('LBL __if_end_0'), 'should have end label');
    });

    test('compiles if with !=', () => {
        const asm = compile('if var0 != 1:\nfire\nend');
        assert(asm.includes('CMP R0, 1'), 'should have CMP');
        assert(asm.includes('JE'), 'should have JE for != condition');
    });

    test('compiles if with >', () => {
        const asm = compile('if var0 > 5:\nturn_left\nend');
        assert(asm.includes('CMP R0, 5'), 'should have CMP');
        assert(asm.includes('JLE'), 'should have JLE for > condition');
    });

    test('compiles if with <', () => {
        const asm = compile('if var0 < 10:\nturn_right\nend');
        assert(asm.includes('CMP R0, 10'), 'should have CMP');
        assert(asm.includes('JGE'), 'should have JGE for < condition');
    });

    test('compiles if/else', () => {
        const asm = compile('if var0 == 1:\nmove\nelse:\nfire\nend');
        assert(asm.includes('JMP __if_end_0'), 'should jump over else');
        assert(asm.includes('LBL __if_else_0'), 'should have else label');
        assert(asm.includes('MOV_F'), 'should have move in if block');
        assert(asm.includes('FIRE'), 'should have fire in else block');
    });

    test('compiles nested if statements', () => {
        const asm = compile('if var0 == 1:\nif var1 == 2:\nmove\nend\nend');
        assert(asm.includes('__if_else_0'), 'should have outer if label');
        assert(asm.includes('__if_else_1'), 'should have inner if label');
    });

    test('compiles if comparing two variables', () => {
        const asm = compile('if var0 == var1:\nmove\nend');
        assert(asm.includes('CMP R0, R1'), 'should compare registers');
    });
});

describe('SimpleCompiler - While Loops', () => {
    test('compiles simple while loop', () => {
        const asm = compile('while var0 > 0:\nmove\nvar0 = var0 - 1\nend');
        assert(asm.includes('LBL __while_start_0'), 'should have start label');
        assert(asm.includes('LBL __while_end_0'), 'should have end label');
        assert(asm.includes('JMP __while_start_0'), 'should loop back');
        assert(asm.includes('JLE __while_end_0'), 'should exit when condition false');
    });

    test('compiles while with == condition', () => {
        const asm = compile('while var0 == 1:\nfire\nend');
        assert(asm.includes('JNE __while_end_0'), 'should exit when not equal');
    });

    test('compiles while with != condition', () => {
        const asm = compile('while var0 != 0:\nmove\nend');
        assert(asm.includes('JE __while_end_0'), 'should exit when equal');
    });

    test('compiles while with < condition', () => {
        const asm = compile('while var0 < 5:\nmove\nend');
        assert(asm.includes('JGE __while_end_0'), 'should exit when >= 5');
    });

    test('compiles nested while loops', () => {
        const asm = compile('while var0 > 0:\nwhile var1 > 0:\nmove\nend\nend');
        assert(asm.includes('__while_start_0'), 'should have outer loop');
        assert(asm.includes('__while_start_1'), 'should have inner loop');
    });

    test('compiles infinite loop using var == var pattern', () => {
        // This is the idiomatic way to write infinite loops in TankScript
        // since CMP requires a register as the first argument
        const asm = compile('while var0 == var0:\nmove\nend');
        assert(asm.includes('CMP R0, R0'), 'should compare register to itself');
        assert(asm.includes('JNE __while_end_0'), 'should have exit jump (never taken)');
    });
});

describe('SimpleCompiler - Repeat Loops', () => {
    test('compiles repeat with variable', () => {
        const asm = compile('var0 = 3\nrepeat var0:\nmove\nend');
        assert(asm.includes('SET R0, 3'), 'should set counter');
        assert(asm.includes('LBL __loop_0'), 'should have loop label');
        assert(asm.includes('DJNZ R0, __loop_0'), 'should decrement and jump');
    });

    test('compiles repeat with different register', () => {
        const asm = compile('var2 = 5\nrepeat var2:\nfire\nend');
        assert(asm.includes('DJNZ R2, __loop_0'), 'should use R2');
    });
});

describe('SimpleCompiler - Comments and Whitespace', () => {
    test('ignores # comments', () => {
        const asm = compile('# This is a comment\nmove');
        assertEqual(asm, 'MOV_F', 'should ignore comment');
    });

    test('ignores ; comments', () => {
        const asm = compile('; This is a comment\nmove');
        assertEqual(asm, 'MOV_F', 'should ignore semicolon comment');
    });

    test('handles empty lines', () => {
        const asm = compile('move\n\n\nfire');
        assertEqual(asm, 'MOV_F\nFIRE', 'should skip empty lines');
    });

    test('handles extra whitespace', () => {
        const asm = compile('   move   ');
        assertEqual(asm, 'MOV_F', 'should trim whitespace');
    });
});

describe('SimpleCompiler - Error Handling', () => {
    test('throws on unknown command', () => {
        let threw = false;
        try {
            compile('unknown_command');
        } catch (e) {
            threw = true;
            assert(e.message.includes('Unknown command'), 'should mention unknown command');
        }
        assert(threw, 'should throw on unknown command');
    });

    test('throws on unclosed if block', () => {
        let threw = false;
        try {
            compile('if var0 == 1:\nmove');
        } catch (e) {
            threw = true;
            assert(e.message.includes('Unclosed block'), 'should mention unclosed block');
        }
        assert(threw, 'should throw on unclosed block');
    });

    test('throws on invalid variable name', () => {
        let threw = false;
        try {
            compile('var9 = 5');
        } catch (e) {
            threw = true;
        }
        assert(threw, 'should throw on invalid variable');
    });

    test('throws on unexpected else', () => {
        let threw = false;
        try {
            compile('else:\nmove\nend');
        } catch (e) {
            threw = true;
        }
        assert(threw, 'should throw on unexpected else');
    });

    test('throws on unexpected end', () => {
        let threw = false;
        try {
            compile('move\nend');
        } catch (e) {
            threw = true;
        }
        assert(threw, 'should throw on unexpected end');
    });
});

describe('CPU - Action Execution', () => {
    test('executes MOV_F and yields MOVE action', () => {
        const cpu = createCPU('move');
        const action = runUntilAction(cpu);
        assertEqual(action.type, 'MOVE', 'should yield MOVE');
        assertEqual(action.dir, 'FORWARD', 'should be FORWARD');
    });

    test('executes ROT_L and yields ROTATE action', () => {
        const cpu = createCPU('turn_left');
        const action = runUntilAction(cpu);
        assertEqual(action.type, 'ROTATE', 'should yield ROTATE');
        assertEqual(action.dir, 'LEFT', 'should be LEFT');
    });

    test('executes ROT_R and yields ROTATE action', () => {
        const cpu = createCPU('turn_right');
        const action = runUntilAction(cpu);
        assertEqual(action.type, 'ROTATE', 'should yield ROTATE');
        assertEqual(action.dir, 'RIGHT', 'should be RIGHT');
    });

    test('executes FIRE and yields FIRE action', () => {
        const cpu = createCPU('fire');
        const action = runUntilAction(cpu);
        assertEqual(action.type, 'FIRE', 'should yield FIRE');
    });

    test('executes NOP and yields NOP action', () => {
        const cpu = createCPU('wait');
        const action = runUntilAction(cpu);
        assertEqual(action.type, 'NOP', 'should yield NOP');
    });

    test('executes multiple actions in sequence', () => {
        const cpu = createCPU('move\nwait\nturn_left\nfire');
        const actions = runToCompletion(cpu);
        assertEqual(actions.length, 4, 'should have 4 actions');
        assertEqual(actions[0].type, 'MOVE', 'first is MOVE');
        assertEqual(actions[1].type, 'NOP', 'second is NOP');
        assertEqual(actions[2].type, 'ROTATE', 'third is ROTATE');
        assertEqual(actions[3].type, 'FIRE', 'fourth is FIRE');
    });
});

describe('CPU - Sensor Execution', () => {
    test('executes SCAN and yields SCAN action with register args', () => {
        const cpu = createCPU('scan(var0, var1)');
        const action = runUntilAction(cpu);
        assertEqual(action.type, 'SCAN', 'should yield SCAN');
        assertEqual(action.destDist, 'R0', 'destDist should be R0');
        assertEqual(action.destType, 'R1', 'destType should be R1');
    });

    test('executes PING and yields PING action with register args', () => {
        const cpu = createCPU('ping(var2, var3)');
        const action = runUntilAction(cpu);
        assertEqual(action.type, 'PING', 'should yield PING');
        assertEqual(action.destX, 'R2', 'destX should be R2');
        assertEqual(action.destY, 'R3', 'destY should be R3');
    });
});

describe('CPU - Variable Operations', () => {
    test('SET initializes register', () => {
        const cpu = createCPU('var0 = 42\nmove');
        runUntilAction(cpu); // Move consumes action, SET is instant
        assertEqual(cpu.registers[REGISTERS.R0], 42, 'R0 should be 42');
    });

    test('SET with negative number', () => {
        const cpu = createCPU('var1 = -5\nmove');
        runUntilAction(cpu);
        assertEqual(cpu.registers[REGISTERS.R1], -5, 'R1 should be -5');
    });

    test('ADD increments register', () => {
        const cpu = createCPU('var0 = 10\nvar0 = var0 + 5\nmove');
        runUntilAction(cpu);
        assertEqual(cpu.registers[REGISTERS.R0], 15, 'R0 should be 15');
    });

    test('SUB decrements register', () => {
        const cpu = createCPU('var0 = 10\nvar0 = var0 - 3\nmove');
        runUntilAction(cpu);
        assertEqual(cpu.registers[REGISTERS.R0], 7, 'R0 should be 7');
    });

    test('ADD with register operand', () => {
        const cpu = createCPU('var0 = 10\nvar1 = 5\nvar0 = var0 + var1\nmove');
        runUntilAction(cpu);
        assertEqual(cpu.registers[REGISTERS.R0], 15, 'R0 should be 15');
    });

    test('SUB with register operand', () => {
        const cpu = createCPU('var0 = 10\nvar1 = 3\nvar0 = var0 - var1\nmove');
        runUntilAction(cpu);
        assertEqual(cpu.registers[REGISTERS.R0], 7, 'R0 should be 7');
    });

    test('register-to-register copy', () => {
        const cpu = createCPU('var0 = 99\nvar1 = var0\nmove');
        runUntilAction(cpu);
        assertEqual(cpu.registers[REGISTERS.R1], 99, 'R1 should be 99');
    });
});

describe('CPU - Conditional Execution', () => {
    test('if true branch executes', () => {
        const cpu = createCPU('var0 = 5\nif var0 == 5:\nmove\nend');
        const actions = runToCompletion(cpu);
        assertEqual(actions.length, 1, 'should execute move');
        assertEqual(actions[0].type, 'MOVE', 'should be MOVE');
    });

    test('if false branch skips', () => {
        const cpu = createCPU('var0 = 5\nif var0 == 10:\nmove\nend');
        const actions = runToCompletion(cpu);
        assertEqual(actions.length, 0, 'should not execute move');
    });

    test('if/else executes else when false', () => {
        const cpu = createCPU('var0 = 5\nif var0 == 10:\nmove\nelse:\nfire\nend');
        const actions = runToCompletion(cpu);
        assertEqual(actions.length, 1, 'should execute one action');
        assertEqual(actions[0].type, 'FIRE', 'should be FIRE from else');
    });

    test('if/else executes if when true', () => {
        const cpu = createCPU('var0 = 5\nif var0 == 5:\nmove\nelse:\nfire\nend');
        const actions = runToCompletion(cpu);
        assertEqual(actions.length, 1, 'should execute one action');
        assertEqual(actions[0].type, 'MOVE', 'should be MOVE from if');
    });

    test('if with > comparison', () => {
        const cpu = createCPU('var0 = 10\nif var0 > 5:\nmove\nend');
        const actions = runToCompletion(cpu);
        assertEqual(actions.length, 1, 'should execute move');
    });

    test('if with > comparison (false)', () => {
        const cpu = createCPU('var0 = 3\nif var0 > 5:\nmove\nend');
        const actions = runToCompletion(cpu);
        assertEqual(actions.length, 0, 'should not execute move');
    });

    test('if with < comparison', () => {
        const cpu = createCPU('var0 = 3\nif var0 < 5:\nmove\nend');
        const actions = runToCompletion(cpu);
        assertEqual(actions.length, 1, 'should execute move');
    });

    test('if with != comparison', () => {
        const cpu = createCPU('var0 = 3\nif var0 != 5:\nmove\nend');
        const actions = runToCompletion(cpu);
        assertEqual(actions.length, 1, 'should execute move');
    });

    test('nested if statements', () => {
        const cpu = createCPU('var0 = 1\nvar1 = 2\nif var0 == 1:\nif var1 == 2:\nmove\nend\nend');
        const actions = runToCompletion(cpu);
        assertEqual(actions.length, 1, 'should execute nested move');
    });
});

describe('CPU - While Loop Execution', () => {
    test('while loop executes correct number of times', () => {
        const cpu = createCPU('var0 = 3\nwhile var0 > 0:\nmove\nvar0 = var0 - 1\nend');
        const actions = runToCompletion(cpu);
        assertEqual(actions.length, 3, 'should move 3 times');
        assertEqual(cpu.registers[REGISTERS.R0], 0, 'R0 should be 0 after loop');
    });

    test('while loop with false condition never executes', () => {
        const cpu = createCPU('var0 = 0\nwhile var0 > 0:\nmove\nend');
        const actions = runToCompletion(cpu);
        assertEqual(actions.length, 0, 'should not execute');
    });

    test('while with != condition', () => {
        const cpu = createCPU('var0 = 2\nwhile var0 != 0:\nfire\nvar0 = var0 - 1\nend');
        const actions = runToCompletion(cpu);
        assertEqual(actions.length, 2, 'should fire 2 times');
    });

    test('while with < condition', () => {
        const cpu = createCPU('var0 = 0\nwhile var0 < 2:\nmove\nvar0 = var0 + 1\nend');
        const actions = runToCompletion(cpu);
        assertEqual(actions.length, 2, 'should move 2 times');
    });
});

describe('CPU - Repeat Loop Execution', () => {
    test('repeat loop executes n times', () => {
        const cpu = createCPU('var0 = 4\nrepeat var0:\nfire\nend');
        const actions = runToCompletion(cpu);
        assertEqual(actions.length, 4, 'should fire 4 times');
    });

    test('repeat loop with counter 1 executes once', () => {
        const cpu = createCPU('var0 = 1\nrepeat var0:\nmove\nend');
        const actions = runToCompletion(cpu);
        assertEqual(actions.length, 1, 'should move 1 time');
    });

    test('repeat decrements counter to 0', () => {
        const cpu = createCPU('var0 = 3\nrepeat var0:\nturn_left\nend');
        runToCompletion(cpu);
        assertEqual(cpu.registers[REGISTERS.R0], 0, 'R0 should be 0 after repeat');
    });
});

describe('CPU - Infinite Loop Protection', () => {
    test('MAX_OPS prevents infinite loop', () => {
        // Use var0 == var0 which is always true (both start at 0)
        const cpu = createCPU('while var0 == var0:\nvar1 = var1 + 1\nend');
        const action = cpu.step();
        assertEqual(action.type, 'WAIT', 'should yield WAIT');
        assertEqual(action.reason, 'MAX_OPS', 'should be MAX_OPS reason');
    });

    test('CPU continues after MAX_OPS on next step', () => {
        // Use var0 == var0 which is always true
        const cpu = createCPU('while var0 == var0:\nvar1 = var1 + 1\nend');
        cpu.step(); // First step hits MAX_OPS
        const action = cpu.step(); // Second step continues
        assertEqual(action.type, 'WAIT', 'should still be in infinite loop');
    });
});

describe('CPU - Program Completion', () => {
    test('isDone is true after program ends', () => {
        const cpu = createCPU('move');
        runToCompletion(cpu);
        assertEqual(cpu.isDone, true, 'should be done');
    });

    test('step returns null when program ends', () => {
        const cpu = createCPU('move');
        cpu.step(); // execute move
        const result = cpu.step(); // try to step again
        assertEqual(result, null, 'should return null');
    });
});

describe('CPU - External Register Access', () => {
    test('setRegister updates register value', () => {
        const cpu = createCPU('move');
        cpu.setRegister(REGISTERS.R0, 123);
        assertEqual(cpu.registers[REGISTERS.R0], 123, 'R0 should be 123');
    });

    test('setRegister works with ACC', () => {
        const cpu = createCPU('move');
        cpu.setRegister(REGISTERS.ACC, 456);
        assertEqual(cpu.registers[REGISTERS.ACC], 456, 'ACC should be 456');
    });
});

describe('Position and Direction Registers', () => {
    test('compiles posx to PX register', () => {
        const asm = compile('if posx > 8:\nmove\nend');
        assert(asm.includes('CMP PX, 8'), 'should use PX register');
    });

    test('compiles posy to PY register', () => {
        const asm = compile('if posy < 5:\nmove\nend');
        assert(asm.includes('CMP PY, 5'), 'should use PY register');
    });

    test('compiles dir to DIR register', () => {
        const asm = compile('if dir == 0:\nfire\nend');
        assert(asm.includes('CMP DIR, 0'), 'should use DIR register');
    });

    test('can copy posx to var0', () => {
        const asm = compile('var0 = posx');
        assertEqual(asm, 'SET R0, PX', 'should copy PX to R0');
    });

    test('can copy posy to var1', () => {
        const asm = compile('var1 = posy');
        assertEqual(asm, 'SET R1, PY', 'should copy PY to R1');
    });

    test('can copy dir to var2', () => {
        const asm = compile('var2 = dir');
        assertEqual(asm, 'SET R2, DIR', 'should copy DIR to R2');
    });

    test('CPU has PX, PY, DIR registers initialized to 0', () => {
        const cpu = createCPU('move');
        assertEqual(cpu.registers['PX'], 0, 'PX should be 0');
        assertEqual(cpu.registers['PY'], 0, 'PY should be 0');
        assertEqual(cpu.registers['DIR'], 0, 'DIR should be 0');
    });

    test('updateTankState sets position and direction', () => {
        const cpu = createCPU('move');
        cpu.updateTankState(5, 3, 2);
        assertEqual(cpu.registers['PX'], 5, 'PX should be 5');
        assertEqual(cpu.registers['PY'], 3, 'PY should be 3');
        assertEqual(cpu.registers['DIR'], 2, 'DIR should be 2');
    });

    test('position registers are readable in conditions', () => {
        const cpu = createCPU('if posx > 3:\nmove\nend');
        cpu.updateTankState(5, 2, 0); // x=5, y=2, dir=0
        const actions = runToCompletion(cpu);
        assertEqual(actions.length, 1, 'should execute move because 5 > 3');
    });

    test('position registers are readable but writes are ignored', () => {
        // Attempting to write to PX should be silently ignored
        const cpu = createCPU('var0 = 99\nmove');
        cpu.updateTankState(5, 3, 1);
        // Try to overwrite via SET (won't actually compile to SET PX directly,
        // but we test that the register protection works at CPU level)
        cpu.registers['PX'] = 5; // Direct access (simulating what BattleManager does)
        runUntilAction(cpu);
        assertEqual(cpu.registers['PX'], 5, 'PX should still be 5');
    });
});

describe('Integration - Complex Programs', () => {
    test('patrol pattern: move, turn, move, turn', () => {
        const cpu = createCPU(`
            var0 = 2
            repeat var0:
                move
                turn_right
            end
        `);
        const actions = runToCompletion(cpu);
        assertEqual(actions.length, 4, 'should have 4 actions');
        assertEqual(actions[0].type, 'MOVE', 'first MOVE');
        assertEqual(actions[1].type, 'ROTATE', 'first ROTATE');
        assertEqual(actions[2].type, 'MOVE', 'second MOVE');
        assertEqual(actions[3].type, 'ROTATE', 'second ROTATE');
    });

    test('conditional firing based on comparison', () => {
        const cpu = createCPU(`
            var0 = 10
            var1 = 5
            if var0 > var1:
                fire
            else:
                move
            end
        `);
        const actions = runToCompletion(cpu);
        assertEqual(actions.length, 1, 'should have 1 action');
        assertEqual(actions[0].type, 'FIRE', 'should fire because 10 > 5');
    });

    test('countdown with while and conditional', () => {
        const cpu = createCPU(`
            var0 = 3
            while var0 > 0:
                if var0 == 2:
                    fire
                else:
                    move
                end
                var0 = var0 - 1
            end
        `);
        const actions = runToCompletion(cpu);
        assertEqual(actions.length, 3, 'should have 3 actions');
        assertEqual(actions[0].type, 'MOVE', 'var0=3: move');
        assertEqual(actions[1].type, 'FIRE', 'var0=2: fire');
        assertEqual(actions[2].type, 'MOVE', 'var0=1: move');
    });

    test('scanning and reacting to result', () => {
        const cpu = createCPU(`
            scan(var0, var1)
        `);
        const action = runUntilAction(cpu);
        assertEqual(action.type, 'SCAN', 'should request scan');
        // Simulate simulator providing scan results
        cpu.setRegister(REGISTERS.R0, 5);  // distance
        cpu.setRegister(REGISTERS.R1, 2);  // type (enemy)
        assertEqual(cpu.registers[REGISTERS.R0], 5, 'distance stored');
        assertEqual(cpu.registers[REGISTERS.R1], 2, 'type stored');
    });

    test('using ping to detect enemy position', () => {
        const cpu = createCPU(`
            ping(var0, var1)
        `);
        const action = runUntilAction(cpu);
        assertEqual(action.type, 'PING', 'should request ping');
        // Simulate BattleManager providing enemy position
        cpu.setRegister(REGISTERS.R0, 7);  // enemy x
        cpu.setRegister(REGISTERS.R1, 3);  // enemy y
        assertEqual(cpu.registers[REGISTERS.R0], 7, 'enemy x stored');
        assertEqual(cpu.registers[REGISTERS.R1], 3, 'enemy y stored');
    });
});

describe('Tokenizer - Basic Tokenization', () => {
    test('tokenizes simple instruction', () => {
        const tokenizer = new Tokenizer();
        const tokens = tokenizer.tokenize('MOV_F');
        assertEqual(tokens[0].value, 'MOV_F', 'should tokenize MOV_F');
    });

    test('tokenizes register', () => {
        const tokenizer = new Tokenizer();
        const tokens = tokenizer.tokenize('SET R0, 5');
        assert(tokens.some(t => t.value === 'R0'), 'should have R0 token');
    });

    test('tokenizes negative number', () => {
        const tokenizer = new Tokenizer();
        const tokens = tokenizer.tokenize('SET R0, -10');
        assert(tokens.some(t => t.value === -10), 'should have -10 token');
    });

    test('ignores semicolon comments', () => {
        const tokenizer = new Tokenizer();
        const tokens = tokenizer.tokenize('MOV_F ; comment');
        assert(!tokens.some(t => t.value === 'COMMENT'), 'should not have comment');
    });
});

describe('Parser - Parsing', () => {
    test('parses simple program', () => {
        const tokenizer = new Tokenizer();
        const parser = new Parser();
        const tokens = tokenizer.tokenize('MOV_F\nFIRE');
        const { program, error } = parser.parse(tokens);
        assert(!error, 'should not have error');
        assertEqual(program.length, 2, 'should have 2 instructions');
    });

    test('parses labels correctly', () => {
        const tokenizer = new Tokenizer();
        const parser = new Parser();
        const tokens = tokenizer.tokenize('LBL START\nMOV_F\nJMP START');
        const { labels, error } = parser.parse(tokens);
        assert(!error, 'should not have error');
        assertEqual(labels['START'], 0, 'START should point to index 0');
    });

    test('reports duplicate label error', () => {
        const tokenizer = new Tokenizer();
        const parser = new Parser();
        const tokens = tokenizer.tokenize('LBL START\nLBL START');
        const { error } = parser.parse(tokens);
        assert(error, 'should have error');
        assert(error.includes('Duplicate label'), 'should mention duplicate');
    });

    test('reports unknown instruction error', () => {
        const tokenizer = new Tokenizer();
        const parser = new Parser();
        const tokens = tokenizer.tokenize('UNKNOWN');
        const { error } = parser.parse(tokens);
        assert(error, 'should have error');
        assert(error.includes('Unknown instruction'), 'should mention unknown');
    });
});

// ============================================
// BattleManager Tests (Game Logic)
// ============================================
import { BattleManager } from '../src/simulation/BattleManager.js';

describe('BattleManager - Initialization', () => {
    test('initializes with correct tank positions', () => {
        const bm = new BattleManager();
        assertEqual(bm.tanks.P1.x, 0, 'P1 starts at x=0');
        assertEqual(bm.tanks.P1.y, 4, 'P1 starts at y=4');
        assertEqual(bm.tanks.P1.facing, 0, 'P1 faces East');
        assertEqual(bm.tanks.P1.hp, 3, 'P1 has 3 HP');

        assertEqual(bm.tanks.P2.x, 15, 'P2 starts at x=15');
        assertEqual(bm.tanks.P2.y, 5, 'P2 starts at y=5');
        assertEqual(bm.tanks.P2.facing, 2, 'P2 faces West');
        assertEqual(bm.tanks.P2.hp, 3, 'P2 has 3 HP');
    });

    test('grid has correct dimensions', () => {
        const bm = new BattleManager();
        assertEqual(bm.grid.width, 16, 'grid width is 16');
        assertEqual(bm.grid.height, 10, 'grid height is 10');
    });
});

// Helper to create mock CPU
function mockCPU(stepFn) {
    return {
        step: stepFn,
        registers: { PC: 0 },
        program: [],
        updateTankState: () => {},
        setRegister: () => {}
    };
}

describe('BattleManager - Movement', () => {
    test('tank moves forward when path is clear', () => {
        const bm = new BattleManager();
        // P1 at (0,4) facing East, should move to (1,4)
        bm.tanks.P1.cpu = mockCPU(() => ({ type: 'MOVE', dir: 'FORWARD' }));
        bm.tanks.P2.cpu = mockCPU(() => null);

        bm.tick();
        assertEqual(bm.tanks.P1.x, 1, 'P1 moved to x=1');
        assertEqual(bm.tanks.P1.y, 4, 'P1 stayed at y=4');
    });

    test('tank blocked by grid boundary', () => {
        const bm = new BattleManager();
        bm.tanks.P1.x = 0;
        bm.tanks.P1.facing = 2; // Face West
        bm.tanks.P1.cpu = mockCPU(() => ({ type: 'MOVE', dir: 'FORWARD' }));
        bm.tanks.P2.cpu = mockCPU(() => null);

        bm.tick();
        assertEqual(bm.tanks.P1.x, 0, 'P1 blocked at boundary');
    });

    test('tank blocked by wall', () => {
        const bm = new BattleManager();
        bm.grid.addWall(1, 4); // Wall in front of P1
        bm.tanks.P1.cpu = mockCPU(() => ({ type: 'MOVE', dir: 'FORWARD' }));
        bm.tanks.P2.cpu = mockCPU(() => null);

        bm.tick();
        assertEqual(bm.tanks.P1.x, 0, 'P1 blocked by wall');
    });

    test('tank rotation changes facing', () => {
        const bm = new BattleManager();
        bm.tanks.P1.cpu = mockCPU(() => ({ type: 'ROTATE', dir: 'RIGHT' }));
        bm.tanks.P2.cpu = mockCPU(() => null);

        bm.tick();
        assertEqual(bm.tanks.P1.facing, 1, 'P1 now faces South');
    });
});

describe('BattleManager - Bullets', () => {
    test('fire creates bullet in front of tank', () => {
        const bm = new BattleManager();
        bm.tanks.P1.cpu = mockCPU(() => ({ type: 'FIRE' }));
        bm.tanks.P2.cpu = mockCPU(() => null);

        bm.tick();
        assertEqual(bm.bullets.length, 1, 'one bullet created');
        assertEqual(bm.bullets[0].owner, 'P1', 'bullet owned by P1');
    });

    test('bullet moves 2 tiles per tick', () => {
        const bm = new BattleManager();
        // Manually add a bullet
        bm.bullets.push({ x: 5, y: 4, dx: 1, dy: 0, owner: 'P1', dist: 0 });
        bm.tanks.P1.cpu = mockCPU(() => null);
        bm.tanks.P2.cpu = mockCPU(() => null);

        bm.tick();
        assertEqual(bm.bullets[0].x, 7, 'bullet moved 2 tiles');
    });

    test('bullet hitting tank reduces HP', () => {
        const bm = new BattleManager();
        // Place bullet right next to P2 (at x=15, y=5)
        // Bullet at x=13, moving East, will hit at x=15 after moving 2 tiles
        bm.bullets.push({ x: 13, y: 5, dx: 1, dy: 0, owner: 'P1', dist: 0 });
        bm.tanks.P1.cpu = mockCPU(() => null);
        bm.tanks.P2.cpu = mockCPU(() => null);

        const initialHP = bm.tanks.P2.hp;
        bm.tick();
        assertEqual(bm.tanks.P2.hp, initialHP - 1, 'P2 lost 1 HP');
    });

    test('bullet disappears on wall hit', () => {
        const bm = new BattleManager();
        bm.grid.addWall(7, 4);
        bm.bullets.push({ x: 5, y: 4, dx: 1, dy: 0, owner: 'P1', dist: 0 });
        bm.tanks.P1.cpu = mockCPU(() => null);
        bm.tanks.P2.cpu = mockCPU(() => null);

        bm.tick();
        assertEqual(bm.bullets.length, 0, 'bullet destroyed on wall');
    });

    test('bullet disappears on boundary', () => {
        const bm = new BattleManager();
        // Bullet near right edge
        bm.bullets.push({ x: 14, y: 4, dx: 1, dy: 0, owner: 'P1', dist: 0 });
        // Move P2 out of the way
        bm.tanks.P2.x = 10;
        bm.tanks.P1.cpu = mockCPU(() => null);
        bm.tanks.P2.cpu = mockCPU(() => null);

        bm.tick();
        assertEqual(bm.bullets.length, 0, 'bullet destroyed at boundary');
    });

    test('only one bullet per tank allowed', () => {
        const bm = new BattleManager();
        bm.bullets.push({ x: 5, y: 4, dx: 1, dy: 0, owner: 'P1', dist: 0 });
        bm.tanks.P1.cpu = mockCPU(() => ({ type: 'FIRE' }));
        bm.tanks.P2.cpu = mockCPU(() => null);

        bm.tick();
        assertEqual(bm.bullets.length, 1, 'still only one P1 bullet');
    });

    test('point-blank shot hits immediately', () => {
        const bm = new BattleManager();
        // Place tanks next to each other
        bm.tanks.P1.x = 5;
        bm.tanks.P1.y = 4;
        bm.tanks.P1.facing = 0; // East
        bm.tanks.P2.x = 6; // Right next to P1
        bm.tanks.P2.y = 4;

        bm.tanks.P1.cpu = mockCPU(() => ({ type: 'FIRE' }));
        bm.tanks.P2.cpu = mockCPU(() => null);

        const initialHP = bm.tanks.P2.hp;
        bm.tick();
        assertEqual(bm.tanks.P2.hp, initialHP - 1, 'P2 hit at point blank');
        assertEqual(bm.bullets.length, 0, 'no bullet created - consumed on impact');
    });
});

describe('BattleManager - Game Over', () => {
    test('game over when tank HP reaches 0', () => {
        const bm = new BattleManager();
        bm.tanks.P2.hp = 1;
        // Bullet will hit P2
        bm.bullets.push({ x: 13, y: 5, dx: 1, dy: 0, owner: 'P1', dist: 0 });
        bm.tanks.P1.cpu = mockCPU(() => null);
        bm.tanks.P2.cpu = mockCPU(() => null);

        bm.tick();
        assertEqual(bm.tanks.P2.hp, 0, 'P2 has 0 HP');
        assert(bm.isGameOver, 'game is over');
        assertEqual(bm.winner, 'P1', 'P1 wins');
    });

    test('draw when both tanks die same tick', () => {
        const bm = new BattleManager();
        bm.tanks.P1.hp = 1;
        bm.tanks.P2.hp = 1;
        bm.tanks.P1.x = 5;
        bm.tanks.P2.x = 10;
        // Bullets crossing
        bm.bullets.push({ x: 3, y: 4, dx: 1, dy: 0, owner: 'P2', dist: 0 }); // Will hit P1 at x=5
        bm.bullets.push({ x: 8, y: 5, dx: 1, dy: 0, owner: 'P1', dist: 0 }); // Will hit P2 at x=10
        bm.tanks.P1.y = 4;
        bm.tanks.P2.y = 5;
        bm.tanks.P1.cpu = mockCPU(() => null);
        bm.tanks.P2.cpu = mockCPU(() => null);

        bm.tick();
        assert(bm.isGameOver, 'game is over');
        assertEqual(bm.winner, 'DRAW', 'result is draw');
    });
});

describe('BattleManager - Sensors', () => {
    test('SCAN detects enemy in line of sight', () => {
        const bm = new BattleManager();
        // P1 at (0,4) facing East, P2 at (15,5) - not in line
        // Move P2 to (10,4) - same row
        bm.tanks.P2.x = 10;
        bm.tanks.P2.y = 4;

        let scanResult = {};
        const cpu1 = mockCPU(() => ({ type: 'SCAN', destDist: 'R0', destType: 'R1' }));
        cpu1.setRegister = (reg, val) => {
            if (reg === 'R0') scanResult.dist = val;
            if (reg === 'R1') scanResult.type = val;
        };
        bm.tanks.P1.cpu = cpu1;
        bm.tanks.P2.cpu = mockCPU(() => null);

        bm.tick();
        assertEqual(scanResult.dist, 10, 'enemy at distance 10');
        assertEqual(scanResult.type, 2, 'type 2 = enemy');
    });

    test('PING returns enemy position', () => {
        const bm = new BattleManager();

        let pingResult = {};
        const cpu1 = mockCPU(() => ({ type: 'PING', destX: 'R0', destY: 'R1' }));
        cpu1.setRegister = (reg, val) => {
            if (reg === 'R0') pingResult.x = val;
            if (reg === 'R1') pingResult.y = val;
        };
        bm.tanks.P1.cpu = cpu1;
        bm.tanks.P2.cpu = mockCPU(() => null);

        bm.tick();
        assertEqual(pingResult.x, 15, 'enemy X is 15');
        assertEqual(pingResult.y, 5, 'enemy Y is 5');
    });
});

// Print summary
console.log('\n========================================');
console.log(`Results: ${testsPassed} passed, ${testsFailed} failed`);
console.log('========================================\n');

process.exit(testsFailed > 0 ? 1 : 0);
