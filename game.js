const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let gameStarted = false;

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.position = 'fixed';
    canvas.style.zIndex = '0';
}
window.addEventListener('resize', resize);
resize();

// Escuchar BARRA ESPACIADORA para dividir
window.addEventListener('keydown', (e) => {
    if(e.code === 'Space' && gameStarted) {
        socket.emit('split');
    }
});

document.getElementById('playBtn').onclick = () => {
    const name = document.getElementById('playerName').value.trim() || "Astronauta";
    socket.emit('joinGame', { name });
    document.getElementById('menu').style.display = 'none';
    gameStarted = true;
};

let gameState = { players: {}, food: [], blackHoles: [], lootHoles: [], leaderboard: [] };
let mouseWorldPos = { x: 0, y: 0 };
let currentZoom = 1.0;

window.addEventListener('mousemove', (e) => {
    // Calculamos la posición del mouse respecto al centro de la pantalla
    mouseWorldPos.x = e.clientX;
    mouseWorldPos.y = e.clientY;
});

socket.on('gameState', (data) => {
    gameState = data;
    if(data.leaderboard) {
        let html = "";
        data.leaderboard.forEach((entry, i) => {
            html += `<div style="display:flex; justify-content:space-between"><span>${i+1}.${entry.name}</span><span>${entry.score}</span></div>`;
        });
        document.getElementById('scores').innerHTML = html;
    }
});

function draw() {
    ctx.fillStyle = '#020202';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!gameStarted) {
        requestAnimationFrame(draw);
        return;
    }

    const player = gameState.players[socket.id];
    if (player && player.cells.length > 0) {
        // Calculamos el centro promedio de todas nuestras células para la cámara
        let avgX = player.cells.reduce((s, c) => s + c.x, 0) / player.cells.length;
        let avgY = player.cells.reduce((s, c) => s + c.y, 0) / player.cells.length;
        let totalSize = player.cells.reduce((s, c) => s + c.size, 0);

        // Enviamos al servidor la posición del mouse relativa al centro del jugador
        socket.emit('updatePos', { 
            x: avgX + (mouseWorldPos.x - canvas.width/2) / currentZoom, 
            y: avgY + (mouseWorldPos.y - canvas.height/2) / currentZoom
        });

        ctx.save();
        
        // Zoom dinámico basado en la masa total
        let targetZoom = Math.pow(120 / (totalSize / player.cells.length + 50), 0.6);
        currentZoom += (targetZoom - currentZoom) * 0.05;

        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(currentZoom, currentZoom);
        ctx.translate(-avgX, -avgY);

        // Dibujar comida
        gameState.food.forEach(f => {
            ctx.beginPath();
            ctx.arc(f.x, f.y, f.isSpecial ? 35 : 22, 0, Math.PI * 2);
            ctx.fillStyle = f.isSpecial ? '#fff' : '#00f2ff';
            ctx.shadowBlur = 15;
            ctx.shadowColor = ctx.fillStyle;
            ctx.fill();
        });

        // Dibujar jugadores y sus células
        for (let id in gameState.players) {
            let p = gameState.players[id];
            p.cells.forEach(cell => {
                ctx.beginPath();
                ctx.arc(cell.x, cell.y, cell.size, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.shadowBlur = 20;
                ctx.shadowColor = p.color;
                ctx.fill();
                
                if(id === socket.id) {
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = 4;
                    ctx.stroke();
                }
            });

            // Nombre sobre la célula más grande o el promedio
            ctx.fillStyle = "white";
            ctx.font = `bold 25px Courier New`;
            ctx.textAlign = "center";
            ctx.fillText(p.name, p.cells[0].x, p.cells[0].y - p.cells[0].size - 10);
        }
        
        // Dibujar Agujeros Negros
        gameState.blackHoles.forEach(bh => {
            ctx.beginPath();
            let p = Math.sin(Date.now() / 200) * 10;
            ctx.arc(bh.x, bh.y, bh.size + p, 0, Math.PI * 2);
            ctx.fillStyle = "#000";
            ctx.strokeStyle = "#ff00ff";
            ctx.lineWidth = 10;
            ctx.stroke();
            ctx.fill();
        });

        ctx.restore();
    }
    requestAnimationFrame(draw);
}
draw();