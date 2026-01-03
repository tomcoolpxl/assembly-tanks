/**
 * Instruction Set Architecture (ISA) for CPU Wars
 */

export const REGISTERS = {
    R0: 'R0',
    R1: 'R1',
    R2: 'R2',
    R3: 'R3',
    R4: 'R4',
    R5: 'R5',
    ACC: 'ACC', // Accumulator
    PC: 'PC',   // Program Counter
    CMP: 'CMP', // Comparison Flag (-1, 0, 1)
    PX: 'PX',   // Tank X position (read-only)
    PY: 'PY',   // Tank Y position (read-only)
    DIR: 'DIR', // Tank facing direction (read-only): 0=E, 1=S, 2=W, 3=N
};

// Read-only registers that cannot be modified by tank scripts
export const READ_ONLY_REGISTERS = ['PX', 'PY', 'DIR'];

export const OPCODES = {
    // ACTIONS (End Turn)
    NOP:   'NOP',   // No Operation (Wait)
    MOV_F: 'MOV_F', // Move Forward
    MOV_B: 'MOV_B', // Move Backward
    ROT_L: 'ROT_L', // Rotate Left
    ROT_R: 'ROT_R', // Rotate Right
    FIRE:  'FIRE',  // Fire Cannon
    
    // SENSORS (Instant - Cost 1 Op?) -> Plan says Instant, but maybe cost 1 "Op" count to prevent infinite
    SCAN:  'SCAN',  // SCAN Reg_Dist, Reg_Type
    PING:  'PING',  // PING Reg_X, Reg_Y (Get GPS Coords)
    
    // FLOW CONTROL (Instant)
    LBL:   'LBL',   // Label definition (Virtual instruction)
    JMP:   'JMP',   // Unconditional Jump
    CMP:   'CMP',   // Compare Reg, Val/Reg -> Sets CMP flag
    JE:    'JE',    // Jump if Equal (CMP == 0)
    JNE:   'JNE',   // Jump if Not Equal (CMP != 0)
    JG:    'JG',    // Jump if Greater (CMP == 1)
    JL:    'JL',    // Jump if Less (CMP == -1)
    JGE:   'JGE',   // Jump if Greater or Equal (CMP >= 0)
    JLE:   'JLE',   // Jump if Less or Equal (CMP <= 0)
    DJNZ:  'DJNZ',  // Decrement Reg, Jump if Not Zero
    
    // MATH / DATA (Instant)
    SET:   'SET',   // Set Reg, Val
    ADD:   'ADD',   // Add Val to Reg
    SUB:   'SUB',   // Sub Val from Reg
};

// Binary Mapping for UI Visualization (8-bit)
export const OPCODE_BINARY = {
    [OPCODES.NOP]:   0x00,
    [OPCODES.MOV_F]: 0x01,
    [OPCODES.MOV_B]: 0x02,
    [OPCODES.ROT_L]: 0x03,
    [OPCODES.ROT_R]: 0x04,
    [OPCODES.FIRE]:  0x05,
    [OPCODES.SCAN]:  0x10,
    [OPCODES.PING]:  0x11,
    [OPCODES.LBL]:   0xFE, // Pseudo
    [OPCODES.JMP]:   0x20,
    [OPCODES.CMP]:   0x21,
    [OPCODES.JE]:    0x22,
    [OPCODES.JNE]:   0x23,
    [OPCODES.JG]:    0x24,
    [OPCODES.JL]:    0x25,
    [OPCODES.JGE]:   0x27,
    [OPCODES.JLE]:   0x28,
    [OPCODES.DJNZ]:  0x26,
    [OPCODES.SET]:   0x30,
    [OPCODES.ADD]:   0x31,
    [OPCODES.SUB]:   0x32,
};

// Valid Argument Types
export const ARG_TYPES = {
    REGISTER: 'REGISTER',
    NUMBER: 'NUMBER', // Integer
    LABEL: 'LABEL',   // String identifier
};

export const TOKEN_TYPES = {
    INSTRUCTION: 'INSTRUCTION',
    REGISTER: 'REGISTER',
    NUMBER: 'NUMBER',
    LABEL: 'LABEL',
    COMMA: 'COMMA',
    NEWLINE: 'NEWLINE'
};

export const INSTRUCTION_SPECS = {
    [OPCODES.NOP]:   [],
    [OPCODES.MOV_F]: [],
    [OPCODES.MOV_B]: [],
    [OPCODES.ROT_L]: [],
    [OPCODES.ROT_R]: [],
    [OPCODES.FIRE]:  [],
    
    [OPCODES.SCAN]:  [ARG_TYPES.REGISTER, ARG_TYPES.REGISTER], // Dest_Dist, Dest_Type
    [OPCODES.PING]:  [ARG_TYPES.REGISTER, ARG_TYPES.REGISTER], // Dest_X, Dest_Y
    
    [OPCODES.LBL]:   [ARG_TYPES.LABEL],
    [OPCODES.JMP]:   [ARG_TYPES.LABEL],
    
    [OPCODES.CMP]:   [ARG_TYPES.REGISTER, [ARG_TYPES.REGISTER, ARG_TYPES.NUMBER]], // Op1, Op2
    
    [OPCODES.JE]:    [ARG_TYPES.LABEL],
    [OPCODES.JNE]:   [ARG_TYPES.LABEL],
    [OPCODES.JG]:    [ARG_TYPES.LABEL],
    [OPCODES.JL]:    [ARG_TYPES.LABEL],
    [OPCODES.JGE]:   [ARG_TYPES.LABEL],
    [OPCODES.JLE]:   [ARG_TYPES.LABEL],
    
    [OPCODES.DJNZ]:  [ARG_TYPES.REGISTER, ARG_TYPES.LABEL],
    
    [OPCODES.SET]:   [ARG_TYPES.REGISTER, [ARG_TYPES.REGISTER, ARG_TYPES.NUMBER]],
    [OPCODES.ADD]:   [ARG_TYPES.REGISTER, [ARG_TYPES.REGISTER, ARG_TYPES.NUMBER]],
    [OPCODES.SUB]:   [ARG_TYPES.REGISTER, [ARG_TYPES.REGISTER, ARG_TYPES.NUMBER]],
};
