const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

let players = {};
let food = [];
let blackHoles = [];
let lootHoles = [];
const MAP_SIZE = 20000;

// Configuración del universo
for(let i=0; i<1000; i++) food.push({ x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, id: i });
for(let i=0; i<40; i++) blackHoles.push({ x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, size: 100 });
for(let i=0; i<15; i++) lootHoles.push({ x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, size: 80 });

io.on('connection', (socket) => {
    socket.on('joinGame', (data) => {
        players[socket.id] = {
            name: data.name || "Astronauta",
            color: `hsl(${Math.random() * 360}, 100%, 60%)`,
            cells: [{ 
                x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, 
                size: 50, boostX: 0, boostY: 0, 
                splitTimer: 0 
            }],
            targetX: MAP_SIZE/2, targetY: MAP_SIZE/2,
            speedMultiplier: 1
        };
    });

    // MECÁNICA DE DIVISIÓN (Barra Espaciadora)
    socket.on('split', () => {
        let p = players[socket.id];
        if (!p) return;
        let newCells = [];
        p.cells.forEach(cell => {
            if (cell.size >= 300) {
                let halfMass = cell.size / 2;
                if (halfMass >= 100) {
                    cell.size = halfMass;
                    let dx = p.targetX - cell.x;
                    let dy = p.targetY - cell.y;
                    let dist = Math.sqrt(dx*dx + dy*dy) || 1;
                    newCells.push({ 
                        x: cell.x, y: cell.y, size: halfMass,
                        boostX: (dx/dist) * 45, boostY: (dy/dist) * 45,
                        splitTimer: Date.now() + 15000 // No se fusionan por 15 seg
                    });
                }
            }
        });
        if (newCells.length > 0) p.cells.push(...newCells);
    });

    // MECÁNICA DE HACKS
    socket.on('adminAction', (data) => {
        let p = players[socket.id];
        if (!p) return;
        if (data.type === 'mass') p.cells.forEach(c => c.size = Math.max(10, c.size + data.value));
        if (data.type === 'teleport') p.cells.forEach(c => { c.x = data.x; c.y = data.y; });
        if (data.type === 'speed') {
            p.speedMultiplier = data.value;
            setTimeout(() => { if(players[socket.id]) players[socket.id].speedMultiplier = 1; }, 10000);
        }
    });

    socket.on('updatePos', (data) => {
        let p = players[socket.id];
        if(!p) return;
        p.targetX = data.x;
        p.targetY = data.y;
    });

    socket.on('disconnect', () => { delete players[socket.id]; });
});

function updatePhysics() {
    for (let id in players) {
        let p = players[id];
        p.cells.forEach((cell, i) => {
            // Movimiento hacia el mouse
            let dx = p.targetX - cell.x;
            let dy = p.targetY - cell.y;
            let dist = Math.sqrt(dx*dx + dy*dy);
            
            // VELOCIDAD BASE (Ajustable)
            let baseSpeed = 22 / (1 + cell.size * 0.015);
            let speed = Math.max(0.6, baseSpeed * (p.speedMultiplier || 1));

            if (dist > 5) {
                cell.x += (dx/dist) * speed;
                cell.y += (dy/dist) * speed;
            }

            // Aplicar Inercia (Boost del split)
            if (cell.boostX || cell.boostY) {
                cell.x += cell.boostX;
                cell.y += cell.boostY;
                cell.boostX *= 0.92; cell.boostY *= 0.92;
                if(Math.abs(cell.boostX) < 1) cell.boostX = 0;
                if(Math.abs(cell.boostY) < 1) cell.boostY = 0;
            }

            // Colisión con Comida
            for (let j = food.length - 1; j >= 0; j--) {
                let f = food[j];
                if (Math.sqrt((cell.x-f.x)**2 + (cell.y-f.y)**2) < cell.size) {
                    cell.size += (f.val || 2.5);
                    food.splice(j, 1);
                    if(!f.val) food.push({ x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, id: Date.now()+j });
                }
            }

            // Colisión con Loot (Celeste)
            lootHoles.forEach((lh, idx) => {
                if (Math.sqrt((cell.x-lh.x)**2 + (cell.y-lh.y)**2) < cell.size + lh.size) {
                    cell.size += Math.floor(Math.random() * 31) + 40;
                    lootHoles[idx] = { x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, size: 80 };
                }
            });

            // Colisión con Agujero Negro (Morado)
            blackHoles.forEach(bh => {
                let dX = cell.x - bh.x; let dY = cell.y - bh.y;
                let d = Math.sqrt(dX*dX + dY*dY);
                if (d < bh.size + cell.size) {
                    if (cell.size >= 300) {
                        // EXPLOSIÓN: Se divide en 6 pedazos y pierde el 80% de masa
                        let pieces = 6;
                        let pieceSize = (cell.size * 0.2) / pieces;
                        cell.size = pieceSize;
                        for(let k=0; k<pieces-1; k++) {
                            p.cells.push({
                                x: cell.x, y: cell.y, size: pieceSize,
                                boostX: (Math.random()-0.5)*30, boostY: (Math.random()-0.5)*30,
                                splitTimer: Date.now() + 10000
                            });
                        }
                    } else if (cell.size > 30) {
                        cell.size -= 0.5;
                    }
                    cell.x += dX * 0.05; cell.y += dY * 0.05;
                }
            });
        });

        // Re-fusión y Repulsión entre células del mismo jugador
        for(let i=0; i<p.cells.length; i++) {
            for(let j=i+1; j<p.cells.length; j++) {
                let c1 = p.cells[i]; let c2 = p.cells[j];
                let dX = c2.x - c1.x; let dY = c2.y - c1.y;
                let d = Math.sqrt(dX*dX + dY*dY);
                let minDist = c1.size + c2.size;

                if (d < minDist) {
                    // Si el timer de split terminó, se fusionan
                    if (Date.now() > c1.splitTimer && Date.now() > c2.splitTimer) {
                        c1.size += c2.size;
                        p.cells.splice(j, 1);
                        j--;
                    } else {
                        // Si no, se empujan (repulsión física)
                        let force = (minDist - d) / 8;
                        let angle = Math.atan2(dY, dX);
                        c1.x -= Math.cos(angle) * force; c1.y -= Math.sin(angle) * force;
                        c2.x += Math.cos(angle) * force; c2.y += Math.sin(angle) * force;
                    }
                }
            }
        }
    }
}

setInterval(() => {
    updatePhysics();
    let leaderboard = Object.values(players)
        .map(p => ({ 
            name: p.name, 
            score: Math.floor(p.cells.reduce((sum, c) => sum + c.size, 0)) 
        }))
        .sort((a, b) => b.score - a.score).slice(0, 5);
    io.emit('gameState', { players, food, blackHoles, lootHoles, leaderboard });
}, 1000/60);

http.listen(3000, '0.0.0.0', () => { console.log('NEON SPACE RUNNING ON PORT 3000'); });