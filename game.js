const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let gameStarted = false;

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
}
window.addEventListener('resize', resize);
resize();

window.addEventListener('keydown', (e) => {
    if(e.code === 'Space' && gameStarted) socket.emit('split');
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
    mouseWorldPos.x = e.clientX;
    mouseWorldPos.y = e.clientY;
});

socket.on('gameState', (data) => {
    gameState = data;
    if(data.leaderboard) {
        let html = "";
        data.leaderboard.forEach((entry, i) => {
            html += `<div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(0,255,255,0.2); padding:2px 0;">
                        <span>${i+1}.${entry.name}</span>
                        <span style="color:#fff">${entry.score}</span>
                     </div>`;
        });
        document.getElementById('scores').innerHTML = html;
    }
});

function draw() {
    ctx.fillStyle = '#020202';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!gameStarted) { requestAnimationFrame(draw); return; }

    const player = gameState.players[socket.id];
    if (player && player.cells.length > 0) {
        let avgX = player.cells.reduce((s, c) => s + c.x, 0) / player.cells.length;
        let avgY = player.cells.reduce((s, c) => s + c.y, 0) / player.cells.length;
        let totalSize = player.cells.reduce((s, c) => s + c.size, 0);

        socket.emit('updatePos', { 
            x: avgX + (mouseWorldPos.x - canvas.width/2) / currentZoom, 
            y: avgY + (mouseWorldPos.y - canvas.height/2) / currentZoom
        });

        ctx.save();
        // Zoom dinámico fluido
        let targetZoom = Math.pow(120 / (totalSize / player.cells.length + 60), 0.65);
        currentZoom += (targetZoom - currentZoom) * 0.05;

        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(currentZoom, currentZoom);
        ctx.translate(-avgX, -avgY);

        // Comida
        gameState.food.forEach(f => {
            ctx.beginPath();
            ctx.arc(f.x, f.y, f.isSpecial ? 35 : 22, 0, Math.PI * 2);
            ctx.fillStyle = f.isSpecial ? '#fff' : '#00f2ff';
            ctx.shadowBlur = 10; ctx.shadowColor = ctx.fillStyle;
            ctx.fill();
        });

        // Loot Celestes
        gameState.lootHoles.forEach(lh => {
            ctx.beginPath();
            ctx.arc(lh.x, lh.y, lh.size, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,255,255,0.1)';
            ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 10;
            ctx.stroke(); ctx.fill();
        });

        // Jugadores
        for (let id in gameState.players) {
            let p = gameState.players[id];
            p.cells.forEach(cell => {
                ctx.beginPath();
                ctx.arc(cell.x, cell.y, cell.size, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.shadowBlur = 15; ctx.shadowColor = p.color;
                ctx.fill();
                if(id === socket.id) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke(); }
            });
            ctx.fillStyle = "#fff"; ctx.font = "bold 25px Courier New"; ctx.textAlign = "center";
            ctx.fillText(p.name, p.cells[0].x, p.cells[0].y - p.cells[0].size - 15);
        }
        
        // Agujeros Negros
        gameState.blackHoles.forEach(bh => {
            ctx.beginPath();
            let p = Math.sin(Date.now()/200)*8;
            ctx.arc(bh.x, bh.y, bh.size + p, 0, Math.PI * 2);
            ctx.fillStyle = "#000"; ctx.strokeStyle = "#ff00ff"; ctx.lineWidth = 12;
            ctx.stroke(); ctx.fill();
        });

        ctx.restore();
    }
    requestAnimationFrame(draw);
}
draw();