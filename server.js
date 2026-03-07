const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

let players = {};
let food = [];
let viruses = [];
const MAP_SIZE = 15000;
const BANNED_WORDS = ['puta', 'pendejo', 'mierda', 'cabron', 'zorra', 'idiota', 'estupido']; 

function initMap() {
    for(let i=0; i<1500; i++) food.push({ x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, id: Math.random(), color: `hsl(${Math.random()*360}, 100%, 50%)` });
    for(let i=0; i<30; i++) food.push({ x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, id: Math.random(), color: '#ffffff', isMega: true, val: 100 });
    for(let i=0; i<40; i++) viruses.push({ x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, size: 100, shots: 0 });
}
initMap();

function spawnPlayer(socketId, name, skin) {
    players[socketId] = {
        name: name || "Astronauta",
        color: `hsl(${Math.random() * 360}, 100%, 60%)`,
        skin: skin || null,
        cells: [{ x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, size: 40, boostX: 0, boostY: 0, splitTimer: 0 }],
        targetX: MAP_SIZE/2, targetY: MAP_SIZE/2,
        score: 16
    };
}

io.on('connection', (socket) => {
    socket.on('joinGame', (data) => {
        spawnPlayer(socket.id, data.name, data.skin);
    });

    socket.on('updatePos', (data) => {
        if(players[socket.id]) { 
            players[socket.id].targetX = Math.max(0, Math.min(MAP_SIZE, data.x)); 
            players[socket.id].targetY = Math.max(0, Math.min(MAP_SIZE, data.y)); 
        }
    });

    socket.on('split', () => {
        let p = players[socket.id];
        if (!p || p.cells.length >= 16) return;
        let newCells = [];
        p.cells.forEach(cell => {
            if (cell.size >= 60 && p.cells.length + newCells.length < 16) {
                cell.size /= 1.4142;
                let dx = p.targetX - cell.x, dy = p.targetY - cell.y, dist = Math.sqrt(dx*dx + dy*dy) || 1;
                newCells.push({ x: cell.x, y: cell.y, size: cell.size, boostX: (dx/dist) * 45, boostY: (dy/dist) * 45, splitTimer: Date.now() + 10000 });
            }
        });
        p.cells.push(...newCells);
    });

    socket.on('ejectMass', () => {
        let p = players[socket.id];
        if (!p) return;
        p.cells.forEach(cell => {
            if (cell.size > 55) {
                cell.size = Math.sqrt(cell.size * cell.size - 400);
                let dx = p.targetX - cell.x, dy = p.targetY - cell.y, dist = Math.sqrt(dx*dx + dy*dy) || 1;
                let fx = cell.x + (dx/dist) * (cell.size + 30);
                let fy = cell.y + (dy/dist) * (cell.size + 30);
                // CORRECCIÓN LÍMITES MASA EYECTADA
                fx = Math.max(20, Math.min(MAP_SIZE - 20, fx));
                fy = Math.max(20, Math.min(MAP_SIZE - 20, fy));
                food.push({ x: fx, y: fy, id: Math.random(), val: 18, boostX: (dx/dist) * 25, boostY: (dy/dist) * 25, isEjected: true, color: p.color });
            }
        });
    });

    socket.on('chatMessage', (msg) => {
        if(!players[socket.id]) return;
        let cleanMsg = msg.substring(0, 50);
        BANNED_WORDS.forEach(word => {
            let reg = new RegExp(word, 'gi');
            cleanMsg = cleanMsg.replace(reg, '***');
        });
        io.emit('chatUpdate', { name: players[socket.id].name, msg: cleanMsg, color: players[socket.id].color });
    });

    socket.on('disconnect', () => { delete players[socket.id]; });
});

function updatePhysics() {
    food.forEach(f => {
        if (f.boostX || f.boostY) { 
            f.x += f.boostX; f.y += f.boostY; 
            f.boostX *= 0.9; f.boostY *= 0.9; 
            // Clamp al rebotar/moverse
            f.x = Math.max(10, Math.min(MAP_SIZE - 10, f.x));
            f.y = Math.max(10, Math.min(MAP_SIZE - 10, f.y));
        }
    });

    for (let id in players) {
        let p = players[id], totalArea = 0;
        p.cells.forEach((cell, i) => {
            let dx = p.targetX - cell.x, dy = p.targetY - cell.y, dist = Math.sqrt(dx*dx + dy*dy);
            let speed = Math.max(1.2, (35 / Math.pow(cell.size, 0.35)));
            if (dist > 1) { cell.x += (dx/dist) * speed; cell.y += (dy/dist) * speed; }
            if (cell.boostX || cell.boostY) { cell.x += cell.boostX; cell.y += cell.boostY; cell.boostX *= 0.92; cell.boostY *= 0.92; }
            cell.x = Math.max(cell.size, Math.min(MAP_SIZE - cell.size, cell.x));
            cell.y = Math.max(cell.size, Math.min(MAP_SIZE - cell.size, cell.y));

            for (let j = food.length - 1; j >= 0; j--) {
                let f = food[j], d = Math.sqrt((cell.x-f.x)**2 + (cell.y-f.y)**2);
                if (d < cell.size) {
                    cell.size = Math.sqrt(cell.size * cell.size + (f.isMega ? 10000 : (f.val || 12)**2));
                    food.splice(j, 1);
                    if(!f.isEjected && !f.isMega) food.push({ x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, id: Math.random(), color: `hsl(${Math.random()*360}, 100%, 50%)` });
                }
            }

            viruses.forEach(v => {
                let d = Math.sqrt((cell.x-v.x)**2 + (cell.y-v.y)**2);
                if (d < cell.size && cell.size > v.size * 1.15 && p.cells.length < 16) {
                    io.to(id).emit('virusHit');
                    cell.size = Math.sqrt((cell.size * cell.size) / 5);
                    for(let k=0; k<4; k++) p.cells.push({ x: cell.x, y: cell.y, size: cell.size, boostX: (Math.random()-0.5)*60, boostY: (Math.random()-0.5)*60, splitTimer: Date.now() + 10000 });
                    v.x = Math.random()*MAP_SIZE; v.y = Math.random()*MAP_SIZE;
                }
            });
            totalArea += (cell.size * cell.size);
        });

        for(let i=0; i<p.cells.length; i++) {
            for(let j=i+1; j<p.cells.length; j++) {
                let c1 = p.cells[i], c2 = p.cells[j], d = Math.sqrt((c2.x-c1.x)**2 + (c2.y-c1.y)**2), minDist = c1.size + c2.size;
                if (d < minDist) {
                    if (Date.now() > c1.splitTimer && Date.now() > c2.splitTimer) { c1.size = Math.sqrt(c1.size**2 + c2.size**2); p.cells.splice(j, 1); j--; }
                    else { let force = (minDist - d) / 10, angle = Math.atan2(c2.y - c1.y, c2.x - c1.x); c1.x -= Math.cos(angle) * force; c1.y -= Math.sin(angle) * force; c2.x += Math.cos(angle) * force; c2.y += Math.sin(angle) * force; }
                }
            }
        }
        p.score = Math.floor(totalArea / 100);
    }

    let ids = Object.keys(players);
    for(let i=0; i<ids.length; i++) {
        for(let j=0; j<ids.length; j++) {
            if(i === j) continue;
            let p1 = players[ids[i]], p2 = players[ids[j]];
            p1.cells.forEach(c1 => {
                for(let k=p2.cells.length-1; k>=0; k--) {
                    let c2 = p2.cells[k], d = Math.sqrt((c1.x-c2.x)**2 + (c1.y-c2.y)**2);
                    // REGLA AGAR.IO: Diferencia de 50 puntos para comer
                    let s1 = (c1.size * c1.size) / 100;
                    let s2 = (c2.size * c2.size) / 100;
                    if(d < c1.size - c2.size/2 && s1 >= s2 + 50) { 
                        c1.size = Math.sqrt(c1.size**2 + c2.size**2); 
                        p2.cells.splice(k, 1); 
                        if(p2.cells.length === 0) {
                            // RESPAWN AUTOMÁTICO
                            let oldName = p2.name, oldSkin = p2.skin;
                            spawnPlayer(ids[j], oldName, oldSkin);
                        }
                    }
                }
            });
        }
    }
}

setInterval(() => {
    updatePhysics();
    let leaderboard = Object.values(players).map(p => ({ name: p.name, score: p.score })).sort((a,b) => b.score - a.score).slice(0, 10);
    io.emit('gameState', { players, food, viruses, leaderboard, mapSize: MAP_SIZE });
}, 1000/60);

http.listen(3000, '0.0.0.0', () => { console.log('SERVER NEON SENIOR RUNNING ON PORT 3000'); });
