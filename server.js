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

// Generar comida inicial
for(let i=0; i<400; i++) { 
    food.push({ x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, id: i });
}

// Generar agujeros negros (morados)
for(let i=0; i < 20; i++) {
    blackHoles.push({ x: Math.random() * MAP_SIZE, y: Math.random() * MAP_SIZE, size: 90 });
}

// Generar agujeros de botín (celestes)
for(let i=0; i < 10; i++) {
    lootHoles.push({ x: Math.random() * MAP_SIZE, y: Math.random() * MAP_SIZE, size: 60 });
}

io.on('connection', (socket) => {
    // Al unirse con nombre
    socket.on('joinGame', (data) => {
        players[socket.id] = {
            x: MAP_SIZE / 2,
            y: MAP_SIZE / 2,
            size: 50,
            name: data.name,
            color: `hsl(${Math.random() * 360}, 100%, 60%)`
        };
    });

    socket.on('updatePos', (data) => {
        let p = players[socket.id];
        if(!p) return;

        p.x = Math.max(0, Math.min(MAP_SIZE, data.x));
        p.y = Math.max(0, Math.min(MAP_SIZE, data.y));

        // Colisión con comida
        for (let i = food.length - 1; i >= 0; i--) {
            let f = food[i];
            let dist = Math.sqrt((p.x-f.x)**2 + (p.y-f.y)**2);
            if (dist < p.size) {
                p.size += f.val || 2; 
                food.splice(i, 1);
                if(!f.val) food.push({ x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, id: Date.now()+i });
            }
        }

        // Colisión con Agujeros Celestes (Loot)
        lootHoles.forEach((lh, index) => {
            let dist = Math.sqrt((p.x-lh.x)**2 + (p.y-lh.y)**2);
            if(dist < lh.size + p.size/2) {
                p.size += Math.floor(Math.random() * 31) + 40; // 40-70 puntos
                lootHoles[index] = { x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, size: 60 };
            }
        });
    });

    socket.on('disconnect', () => { delete players[socket.id]; });
});

function updateBlackHoles() {
    blackHoles.forEach(bh => {
        for(let id in players) {
            let p = players[id];
            let dx = p.x - bh.x;
            let dy = p.y - bh.y;
            let dist = Math.sqrt(dx*dx + dy*dy);

            if(dist < bh.size + p.size/2) {
                if(p.size > 20) {
                    p.size -= 0.5; // Te quita masa
                    if(Math.random() > 0.9) { // Suelta masa grande
                        food.push({ x: p.x + (Math.random()-0.5)*200, y: p.y + (Math.random()-0.5)*200, val: 10, isSpecial: true });
                    }
                }
                p.x += dx * 0.1; // Empuje
                p.y += dy * 0.1;
            }
        }
    });
}

setInterval(() => { 
    updateBlackHoles();
    let leaderboard = Object.values(players)
        .filter(p => p.name)
        .map(p => ({ name: p.name, score: Math.floor(p.size) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

    io.emit('gameState', { players, food, blackHoles, lootHoles, leaderboard }); 
}, 1000 / 60);

http.listen(3000, '0.0.0.0', () => { // El '0.0.0.0' permite conexiones externas
    console.log('¡SERVIDOR ESPACIAL ONLINE! IP local: http://192.168.1.14:3000');
});