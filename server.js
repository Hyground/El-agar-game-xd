const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

// Servir archivos estáticos desde la carpeta actual
app.use(express.static(__dirname));

let players = {};
let food = [];
let blackHoles = [];
let lootHoles = [];
const MAP_SIZE = 20000;

// Configuración inicial del mundo
// Generamos 800 estrellas normales
for (let i = 0; i < 800; i++) {
    food.push({ x: Math.random() * MAP_SIZE, y: Math.random() * MAP_SIZE, id: i });
}

// Generamos 40 agujeros negros (morados) que dividen al jugador
for (let i = 0; i < 40; i++) {
    blackHoles.push({ x: Math.random() * MAP_SIZE, y: Math.random() * MAP_SIZE, size: 100 });
}

// Generamos 15 agujeros de botín (celestes) que dan muchos puntos
for (let i = 0; i < 15; i++) {
    lootHoles.push({ x: Math.random() * MAP_SIZE, y: Math.random() * MAP_SIZE, size: 70 });
}

io.on('connection', (socket) => {
    // Al unirse al juego
    socket.on('joinGame', (data) => {
        players[socket.id] = {
            name: data.name || "Astronauta",
            color: `hsl(${Math.random() * 360}, 100%, 60%)`,
            cells: [{ x: Math.random() * MAP_SIZE, y: Math.random() * MAP_SIZE, size: 50 }]
        };
    });

    // Lógica de División (Split) con Barra Espaciadora
    socket.on('split', () => {
        let p = players[socket.id];
        if (!p) return;

        let newCells = [];
        p.cells.forEach(cell => {
            // Requisito: Masa mínima de 300 y que la mitad sea al menos 100
            if (cell.size >= 300) {
                let halfMass = cell.size / 2;
                if (halfMass >= 100) {
                    cell.size = halfMass;
                    // Creamos la nueva célula (el cliente la moverá por inercia)
                    newCells.push({ 
                        x: cell.x, 
                        y: cell.y, 
                        size: halfMass,
                        splitTimer: Date.now() 
                    });
                }
            }
        });
        if (newCells.length > 0) p.cells.push(...newCells);
    });

    socket.on('updatePos', (data) => {
        let p = players[socket.id];
        if (!p) return;

        // Actualizamos cada pedazo del jugador
        p.cells.forEach(cell => {
            let dx = data.x - cell.x;
            let dy = data.y - cell.y;
            let dist = Math.sqrt(dx * dx + dy * dy);
            
            // Velocidad inversamente proporcional al tamaño
            let speed = Math.max(0.5, 12 / (1 + cell.size * 0.015));
            
            if (dist > 5) {
                cell.x += (dx / dist) * speed;
                cell.y += (dy / dist) * speed;
            }

            // Colisión con comida
            for (let i = food.length - 1; i >= 0; i--) {
                let f = food[i];
                let fDist = Math.sqrt((cell.x - f.x) ** 2 + (cell.y - f.y) ** 2);
                if (fDist < cell.size) {
                    cell.size += (f.val || 2.5);
                    food.splice(i, 1);
                    // Respawn si es comida normal
                    if (!f.val) {
                        food.push({ x: Math.random() * MAP_SIZE, y: Math.random() * MAP_SIZE, id: Date.now() + i });
                    }
                }
            }

            // Colisión con Agujeros Celestes (Loot)
            lootHoles.forEach((lh, idx) => {
                let lhDist = Math.sqrt((cell.x - lh.x) ** 2 + (cell.y - lh.y) ** 2);
                if (lhDist < cell.size + lh.size) {
                    cell.size += Math.floor(Math.random() * 31) + 40; // 40-70 puntos
                    lootHoles[idx] = { x: Math.random() * MAP_SIZE, y: Math.random() * MAP_SIZE, size: 70 };
                }
            });
        });
    });

    socket.on('disconnect', () => { delete players[socket.id]; });
});

function updateWorld() {
    for (let id in players) {
        let p = players[id];
        p.cells.forEach((cell, cellIdx) => {
            // Colisión con Agujeros Negros (Morados)
            blackHoles.forEach(bh => {
                let dx = cell.x - bh.x;
                let dy = cell.y - bh.y;
                let dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < bh.size + cell.size) {
                    // Si tienes 300+ EXPLOTAS en varios pedazos
                    if (cell.size >= 300) {
                        let pieces = 4; 
                        // Regla del 20%: recuperas poco de lo que tenías
                        let pieceSize = (cell.size * 0.2) / pieces; 
                        cell.size = pieceSize;
                        
                        for (let i = 0; i < pieces - 1; i++) {
                            p.cells.push({ 
                                x: cell.x + (Math.random() - 0.5) * 200, 
                                y: cell.y + (Math.random() - 0.5) * 200, 
                                size: pieceSize 
                            });
                        }
                    } else if (cell.size > 20) {
                        // Si eres pequeño, solo te drena un poco de masa
                        cell.size -= 0.5;
                        // Soltar masa especial (20% de lo perdido)
                        if (Math.random() > 0.9) {
                            food.push({ 
                                x: cell.x + (Math.random() - 0.5) * 150, 
                                y: cell.y + (Math.random() - 0.5) * 150, 
                                val: 5, 
                                isSpecial: true 
                            });
                        }
                    }
                    // Empuje de rebote
                    cell.x += dx * 0.05;
                    cell.y += dy * 0.05;
                }
            });
        });
    }
}

// Bucle principal del servidor (60 FPS)
setInterval(() => { 
    updateWorld();
    
    // Generar tabla de posiciones sumando todas las células del jugador
    let leaderboard = Object.values(players)
        .map(p => ({ 
            name: p.name, 
            score: Math.floor(p.cells.reduce((sum, c) => sum + c.size, 0)) 
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

    io.emit('gameState', { players, food, blackHoles, lootHoles, leaderboard }); 
}, 1000 / 60);

// Escuchar en todas las interfaces de red para permitir conexiones WiFi
const PORT = 3000;
http.listen(PORT, '0.0.0.0', () => {
    console.log('=========================================');
    console.log(`¡SERVIDOR ESPACIAL ENCENDIDO!`);
    console.log(`Puerto: ${PORT}`);
    console.log(`Acceso local: http://localhost:${PORT}`);
    console.log(`Acceso WiFi: Usa tu dirección IP IPv4`);
    console.log('=========================================');
});