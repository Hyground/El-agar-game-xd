const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

let players = {};
let food = [];
let viruses = [];
let lootHoles = [];
const MAP_SIZE = 15000;
const START_TIME = Date.now();

function initMap() {
    // Comida Normal
    for(let i=0; i<1500; i++) food.push({ x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, id: Math.random(), color: `hsl(${Math.random()*360}, 100%, 50%)` });
    // MEGA COMIDA (Solo al inicio, 100 puntos de masa)
    for(let i=0; i<30; i++) food.push({ x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, id: Math.random(), color: '#ffffff', isMega: true, val: 100 });
    
    for(let i=0; i<40; i++) viruses.push({ x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, size: 100, shots: 0 });
    for(let i=0; i<25; i++) lootHoles.push({ x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, size: 80 });
}
initMap();

io.on('connection', (socket) => {
    socket.on('joinGame', (data) => {
        players[socket.id] = {
            name: data.name || "Astronauta",
            color: `hsl(${Math.random() * 360}, 100%, 60%)`,
            skin: data.skin || null,
            cells: [{ 
                x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, 
                size: 40, boostX: 0, boostY: 0, splitTimer: 0 
            }],
            targetX: MAP_SIZE/2, targetY: MAP_SIZE/2,
            score: 16
        };
    });

    socket.on('updatePos', (data) => {
        if(players[socket.id]) {
            players[socket.id].targetX = data.x;
            players[socket.id].targetY = data.y;
        }
    });

    socket.on('split', () => {
        let p = players[socket.id];
        if (!p || p.cells.length >= 16) return;
        let newCells = [];
        p.cells.forEach(cell => {
            if (cell.size >= 60 && p.cells.length + newCells.length < 16) {
                cell.size /= 1.4142;
                let dx = p.targetX - cell.x;
                let dy = p.targetY - cell.y;
                let dist = Math.sqrt(dx*dx + dy*dy) || 1;
                newCells.push({ 
                    x: cell.x, y: cell.y, size: cell.size,
                    boostX: (dx/dist) * 45, boostY: (dy/dist) * 45,
                    splitTimer: Date.now() + 10000 
                });
            }
        });
        p.cells.push(...newCells);
    });

    socket.on('ejectMass', () => {
        let p = players[socket.id];
        if (!p) return;
        p.cells.forEach(cell => {
            if (cell.size > 55) {
                let area = cell.size * cell.size;
                area -= 400;
                cell.size = Math.sqrt(area);
                let dx = p.targetX - cell.x;
                let dy = p.targetY - cell.y;
                let dist = Math.sqrt(dx*dx + dy*dy) || 1;
                food.push({
                    x: cell.x + (dx/dist) * (cell.size + 30),
                    y: cell.y + (dy/dist) * (cell.size + 30),
                    id: Math.random(),
                    val: 18,
                    boostX: (dx/dist) * 25, boostY: (dy/dist) * 25,
                    isEjected: true,
                    color: p.color
                });
            }
        });
    });

    socket.on('adminAction', (data) => {
        let p = players[socket.id];
        if (!p) return;
        if (data.type === 'mass') {
            p.cells.forEach(c => {
                let area = c.size * c.size;
                area = Math.max(100, area + data.value * 100);
                c.size = Math.sqrt(area);
            });
        }
        if (data.type === 'merge') {
            p.cells.forEach(c => c.splitTimer = 0);
        }
    });

    socket.on('disconnect', () => { delete players[socket.id]; });
});

function updatePhysics() {
    food.forEach(f => {
        if (f.boostX || f.boostY) {
            f.x += f.boostX; f.y += f.boostY;
            f.boostX *= 0.9; f.boostY *= 0.9;
        }
        if(f.isEjected) {
            viruses.forEach(v => {
                let d = Math.sqrt((f.x-v.x)**2 + (f.y-v.y)**2);
                if(d < v.size) {
                    v.shots++;
                    f.x = -1000;
                    if(v.shots >= 7) {
                        v.shots = 0;
                        viruses.push({
                            x: v.x, y: v.y, size: 100, shots: 0,
                            boostX: f.boostX * 1.5, boostY: f.boostY * 1.5
                        });
                    }
                }
            });
        }
    });

    for (let id in players) {
        let p = players[id];
        let totalMassArea = 0;

        p.cells.forEach((cell, i) => {
            let dx = p.targetX - cell.x;
            let dy = p.targetY - cell.y;
            let dist = Math.sqrt(dx*dx + dy*dy);
            
            // NUEVA FÓRMULA DE VELOCIDAD: Más rápida y equilibrada
            // Empezamos con base 35 y bajamos con una potencia menor (0.35)
            let speed = Math.max(1.2, (35 / Math.pow(cell.size, 0.35)));

            if (dist > 1) {
                cell.x += (dx/dist) * speed;
                cell.y += (dy/dist) * speed;
            }

            if (cell.boostX || cell.boostY) {
                cell.x += cell.boostX; cell.y += cell.boostY;
                cell.boostX *= 0.92; cell.boostY *= 0.92;
            }

            cell.x = Math.max(cell.size, Math.min(MAP_SIZE - cell.size, cell.x));
            cell.y = Math.max(cell.size, Math.min(MAP_SIZE - cell.size, cell.y));

            for (let j = food.length - 1; j >= 0; j--) {
                let f = food[j];
                let d = Math.sqrt((cell.x-f.x)**2 + (cell.y-f.y)**2);
                if (d < cell.size) {
                    // Si es mega, aumenta el área masivamente (100 puntos de score)
                    let increment = f.isMega ? 10000 : (f.val || 12) * (f.val || 12);
                    cell.size = Math.sqrt(cell.size * cell.size + increment);
                    food.splice(j, 1);
                    // Solo reaparece si NO es Mega
                    if(!f.isEjected && !f.isMega) {
                        food.push({ x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, id: Math.random(), color: `hsl(${Math.random()*360}, 100%, 50%)` });
                    }
                }
            }

            viruses.forEach(v => {
                let d = Math.sqrt((cell.x-v.x)**2 + (cell.y-v.y)**2);
                if (d < cell.size && cell.size > v.size * 1.15) {
                    if (p.cells.length < 16) {
                        io.to(id).emit('virusHit');
                        let pieces = 4;
                        let areaPiece = (cell.size * cell.size) / (pieces + 1);
                        cell.size = Math.sqrt(areaPiece);
                        for(let k=0; k<pieces; k++) {
                            p.cells.push({
                                x: cell.x, y: cell.y, size: cell.size,
                                boostX: (Math.random()-0.5)*60, boostY: (Math.random()-0.5)*60,
                                splitTimer: Date.now() + 10000
                            });
                        }
                        v.x = Math.random()*MAP_SIZE; v.y = Math.random()*MAP_SIZE;
                    }
                }
            });

            totalMassArea += (cell.size * cell.size);
        });

        for(let i=0; i<p.cells.length; i++) {
            for(let j=i+1; j<p.cells.length; j++) {
                let c1 = p.cells[i]; let c2 = p.cells[j];
                let d = Math.sqrt((c2.x-c1.x)**2 + (c2.y-c1.y)**2);
                let minDist = c1.size + c2.size;
                if (d < minDist) {
                    if (Date.now() > c1.splitTimer && Date.now() > c2.splitTimer) {
                        let newArea = (c1.size * c1.size) + (c2.size * c2.size);
                        c1.size = Math.sqrt(newArea);
                        p.cells.splice(j, 1); j--;
                    } else {
                        let force = (minDist - d) / 10;
                        let angle = Math.atan2(c2.y - c1.y, c2.x - c1.x);
                        c1.x -= Math.cos(angle) * force; c1.y -= Math.sin(angle) * force;
                        c2.x += Math.cos(angle) * force; c2.y += Math.sin(angle) * force;
                    }
                }
            }
        }
        p.score = Math.floor(totalMassArea / 100);
    }

    let ids = Object.keys(players);
    for(let i=0; i<ids.length; i++) {
        for(let j=0; j<ids.length; j++) {
            if(i === j) continue;
            let p1 = players[ids[i]]; let p2 = players[ids[j]];
            p1.cells.forEach(c1 => {
                for(let k=p2.cells.length-1; k>=0; k--) {
                    let c2 = p2.cells[k];
                    let d = Math.sqrt((c1.x-c2.x)**2 + (c1.y-c2.y)**2);
                    if(d < c1.size - c2.size/2 && c1.size > c2.size * 1.15) {
                        let newArea = (c1.size * c1.size) + (c2.size * c2.size);
                        c1.size = Math.sqrt(newArea);
                        p2.cells.splice(k, 1);
                        if(p2.cells.length === 0) {
                            io.to(ids[j]).emit('gameOver');
                            delete players[ids[j]];
                        }
                    }
                }
            });
        }
    }
}

setInterval(() => {
    updatePhysics();
    let leaderboard = Object.values(players)
        .map(p => ({ name: p.name, score: p.score }))
        .sort((a,b) => b.score - a.score).slice(0, 10);
    io.emit('gameState', { players, food, viruses, leaderboard, mapSize: MAP_SIZE });
}, 1000/60);

http.listen(3000, '0.0.0.0', () => { console.log('AGAR PI NEON MEGA RUNNING ON PORT 3000'); });
