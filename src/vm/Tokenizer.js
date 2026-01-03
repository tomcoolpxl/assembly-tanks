import { TOKEN_TYPES } from './InstructionSet.js';

export class Tokenizer {
    constructor() {
        this.regex = {
            comment: /;.*/g,
        };
    }

    /**
     * @param {string} code 
     * @returns {Array} List of tokens { type, value, line }
     */
    tokenize(code) {
        const lines = code.split('\n');
        const tokens = [];

        lines.forEach((lineText, lineIndex) => {
            const lineNum = lineIndex + 1;
            
            // Remove comments
            let cleanLine = lineText.replace(this.regex.comment, '').trim();
            
            if (cleanLine.length === 0) return;

            // Replace commas with " , " to ensure they are split
            cleanLine = cleanLine.replace(/,/g, ' , ');
            
            const words = cleanLine.split(/\s+/);

            words.forEach(word => {
                if (!word) return;
                
                const token = this.classifyToken(word, lineNum);
                tokens.push(token);
            });
            
            tokens.push({ type: TOKEN_TYPES.NEWLINE, line: lineNum });
        });

        return tokens;
    }

    classifyToken(word, line) {
        const upper = word.toUpperCase();

        // Is Number?
        if (/^-?\d+$/.test(word)) {
            return { type: TOKEN_TYPES.NUMBER, value: parseInt(word, 10), line };
        }

        // Is Comma?
        if (word === ',') {
            return { type: TOKEN_TYPES.COMMA, value: ',', line };
        }

        // Is Register? (R0-R5, ACC, CMP, PC, PX, PY, DIR, HP, AMMO)
        if (/^(R[0-5]|ACC|CMP|PC|PX|PY|DIR|HP|AMMO)$/.test(upper)) {
            return { type: TOKEN_TYPES.REGISTER, value: upper, line };
        }

        // Default: Identifier (Instruction or Label)
        return { type: TOKEN_TYPES.INSTRUCTION, value: upper, line };
    }
}
