export class Grid {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.walls = new Set(); // Stores "x,y" strings
    }

    isWall(x, y) {
        return this.walls.has(`${x},${y}`);
    }

    isValid(x, y) {
        // Bounds Check
        if (x < 0 || x >= this.width) return false;
        if (y < 0 || y >= this.height) return false;
        
        if (this.walls.has(`${x},${y}`)) return false;

        return true;
    }

    addWall(x, y) {
        this.walls.add(`${x},${y}`);
    }

    // Helper: Raycast for SCAN
    // Returns { distance, type }
    // type: 0=Empty, 1=Wall, 2=Enemy, 3=Self
    raycast(startX, startY, dirX, dirY, selfId, enemyId, entityMap) {
        let x = startX;
        let y = startY;
        let dist = 0;

        // Limit 45 prevents infinite loops
        while (dist < 45) { 
            dist++;
            x = x + dirX;
            y = y + dirY;

            // Bounds Check (Treat as Wall)
            if (x < 0 || x >= this.width || y < 0 || y >= this.height) return { distance: dist, type: 1 };

            // Wall
            if (this.isWall(x, y)) return { distance: dist, type: 1 };

            // Entity
            const key = `${x},${y}`;
            if (entityMap.has(key)) {
                const id = entityMap.get(key);
                if (id === enemyId) return { distance: dist, type: 2 };
                if (id === selfId) return { distance: dist, type: 3 };
            }
        }
        return { distance: dist, type: 0 }; // Empty
    }
}
