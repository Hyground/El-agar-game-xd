const socket = io('http://192.168.1.14:3000');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let gameStarted = false;

// Al pulsar Play
document.getElementById('playBtn').onclick = () => {
    const name = document.getElementById('playerName').value || "Astronauta";
    socket.emit('joinGame', { name });
    document.getElementById('menu').style.display = 'none';
    gameStarted = true;
};

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let gameState = { players: {}, food: [], blackHoles: [], lootHoles: [] };
let mouse = { x: 0, y: 0 };
let currentZoom = 2.5; // Empezamos muy cerca

window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX - canvas.width / 2;
    mouse.y = e.clientY - canvas.height / 2;
});

socket.on('gameState', (data) => {
    gameState = data;
    
    // Actualizar la tabla de posiciones en el HTML
    if(data.leaderboard) {
        let html = "";
        data.leaderboard.forEach((entry, i) => {
            html += `<div>${i+1}. ${entry.name}: ${entry.score}</div>`;
        });
        document.getElementById('scores').innerHTML = html;
    }
});

function draw() {
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!gameStarted) {
        requestAnimationFrame(draw);
        return;
    }

    const me = gameState.players[socket.id];
    if (me) {
        // --- VELOCIDAD MUCHO MÁS LENTA ---
        // Reduje el multiplicador base de 2.5 a 0.8 y aumentamos la división por masa
        let speedMultiplier = Math.max(0.02, 0.4 / (1 + me.size * 0.02));
        
        socket.emit('updatePos', { 
            x: me.x + mouse.x * speedMultiplier, 
            y: me.y + mouse.y * speedMultiplier 
        });

        ctx.save();
        let targetZoom = Math.max(0.2, 1.8 - (me.size / 400));
        currentZoom += (targetZoom - currentZoom) * 0.05;

        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(currentZoom, currentZoom);
        ctx.translate(-me.x, -me.y);

        // --- COMIDA MÁS GRANDE ---
        gameState.food.forEach(f => {
            ctx.beginPath();
            // Comida normal ahora tiene radio 25 (casi como el player inicial 40-50)
            let r = f.isSpecial ? 40 : 25; 
            ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
            ctx.fillStyle = f.isSpecial ? '#fff' : '#00f2ff';
            ctx.shadowBlur = 15;
            ctx.shadowColor = ctx.fillStyle;
            ctx.fill();
        });

        // Dibujar Agujeros Celestes (Loot)
        gameState.lootHoles.forEach(lh => {
            ctx.beginPath();
            ctx.arc(lh.x, lh.y, lh.size, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 255, 255, 0.1)';
            ctx.strokeStyle = '#00ffff';
            ctx.lineWidth = 10;
            ctx.stroke();
        });

        // Dibujar Jugadores
        for (let id in gameState.players) {
            let p = gameState.players[id];
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();
            
            // Mostrar nombre arriba del planeta
            ctx.fillStyle = "white";
            ctx.font = "bold 20px Courier New";
            ctx.textAlign = "center";
            ctx.fillText(p.name || "...", p.x, p.y - p.size - 10);
            
            if(id === socket.id) {
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 5;
                ctx.stroke();
            }
        }
        
        // Dibujar Agujeros Negros
        gameState.blackHoles.forEach(bh => {
            ctx.beginPath();
            ctx.arc(bh.x, bh.y, bh.size, 0, Math.PI * 2);
            ctx.fillStyle = "black";
            ctx.strokeStyle = "#ff00ff";
            ctx.lineWidth = 8;
            ctx.stroke();
            ctx.fill();
        });

        ctx.restore();
    }
    requestAnimationFrame(draw);
}
draw();