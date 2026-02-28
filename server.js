const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

let players = {};
let food = [];
let blackHoles = [];

let lootHoles = [];
const MAP_SIZE = 8000;

// Generar comida inicial
for(let i=0; i<300; i++) { // Más comida para mapa más grande
    food.push({ x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, id: i });
}

// Generar agujeros negros estáticos
for(let i=0; i < 15; i++) {
    blackHoles.push({ x: Math.random() * MAP_SIZE, y: Math.random() * MAP_SIZE, size: 90 });
}

for(let i=0; i < 8; i++) {
    lootHoles.push({ x: Math.random() * MAP_SIZE, y: Math.random() * MAP_SIZE, size: 60 });
}

io.on('connection', (socket) => {
    players[socket.id] = {
        x: MAP_SIZE / 2, y: MAP_SIZE / 2,
        size: 50, // Inicio un poco más grande
        color: `hsl(${Math.random() * 360}, 100%, 60%)`
    };

    socket.on('updatePos', (data) => {
        let p = players[socket.id];
        if(!p) return;

        p.x = Math.max(0, Math.min(MAP_SIZE, data.x));
        p.y = Math.max(0, Math.min(MAP_SIZE, data.y));

        // 1. COLISIÓN CON COMIDA (Puntos más grandes)
        for (let i = food.length - 1; i >= 0; i--) {
            let f = food[i];
            let dist = Math.sqrt((p.x-f.x)**2 + (p.y-f.y)**2);
            if (dist < p.size) {
                // Si la comida tiene valor especial (suelta por choque), da más
                p.size += f.val || 2; 
                food.splice(i, 1);
                if(!f.val) food.push({ x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, id: Date.now()+i });
            }
        }

        // 2. COLISIÓN CON AGUJEROS NEGROS (Morados - Daño)
        blackHoles.forEach(bh => {
            let dx = p.x - bh.x; let dy = p.y - bh.y;
            let dist = Math.sqrt(dx*dx + dy*dy);
            if(dist < bh.size + p.size/2) {
                if(p.size > 30) {
                    p.size -= 2; // Pierdes masa rápido
                    // SOLTAR PUNTOS GRANDES al chocar
                    if(Math.random() > 0.8) {
                        food.push({ x: p.x + (Math.random()-0.5)*100, y: p.y + (Math.random()-0.5)*100, val: 10, isSpecial: true });
                    }
                }
                p.x += dx * 0.1; p.y += dy * 0.1; // Rebote
            }
        });

        // 3. COLISIÓN CON AGUJEROS CELESTES (Recompensa)
        lootHoles.forEach((lh, index) => {
            let dist = Math.sqrt((p.x-lh.x)**2 + (p.y-lh.y)**2);
            if(dist < lh.size + p.size/2) {
                let gain = Math.floor(Math.random() * (70 - 40 + 1)) + 40;
                p.size += gain;
                // Respawn del agujero celeste en otro lado
                lootHoles[index] = { x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, size: 60 };
            }
        });
    });
});

function updateBlackHoles() {
    blackHoles.forEach(bh => {
        for(let id in players) {
            let p = players[id];
            let dx = p.x - bh.x;
            let dy = p.y - bh.y;
            let dist = Math.sqrt(dx*dx + dy*dy);

            if(dist < bh.size + p.size/2) {
                if(p.size > 20) p.size -= 0.3; // Succión de masa
                p.x += dx * 0.05; // Empuje de rebote
                p.y += dy * 0.05;
            }
        }
    });
}

setInterval(() => { 
    io.emit('gameState', { players, food, blackHoles, lootHoles }); 
}, 1000 / 60);

http.listen(3000, () => { console.log('¡Servidor Espacial en puerto 3000!'); });