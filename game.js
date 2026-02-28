const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let gameState = { players: {}, food: [], blackHoles: [] };
let mouse = { x: 0, y: 0 };
let currentZoom = 1.5;

window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX - canvas.width / 2;
    mouse.y = e.clientY - canvas.height / 2;
});

socket.on('gameState', (data) => { gameState = data; });

function draw() {
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const me = gameState.players[socket.id];
    if (me) {
        let speedMultiplier = Math.max(0.05, 2.5 / (me.size * 0.1));
        socket.emit('updatePos', { x: me.x + mouse.x * speedMultiplier, y: me.y + mouse.y * speedMultiplier });

        ctx.save();
        
        // LÓGICA DE ZOOM: Se aleja conforme creces
        // Objetivo: Que el zoom base sea 1.0 y baje a 0.3 según el tamaño
        let targetZoom = Math.max(0.3, 1.5 - (me.size / 500));
        currentZoom += (targetZoom - currentZoom) * 0.1; // Transición suave

        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(currentZoom, currentZoom);
        ctx.translate(-me.x, -me.y);

        // DIBUJAR COMIDA (Normal y Especial)
        gameState.food.forEach(f => {
            ctx.beginPath();
            let r = f.isSpecial ? 15 : 8; // Puntos soltados son más grandes
            ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
            ctx.fillStyle = f.isSpecial ? '#fff' : '#00f2ff';
            ctx.shadowBlur = 15;
            ctx.shadowColor = ctx.fillStyle;
            ctx.fill();
        });

        if(gameState.lootHoles) {
            gameState.lootHoles.forEach(lh => {
                ctx.beginPath();
                ctx.arc(lh.x, lh.y, lh.size, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0, 255, 255, 0.2)';
                ctx.strokeStyle = '#00ffff';
                ctx.lineWidth = 5;
                ctx.shadowBlur = 30;
                ctx.shadowColor = '#00ffff';
                ctx.fill();
                ctx.stroke();
            });
        }

        // DIBUJAR AGUJEROS NEGROS (Dentro de la cámara)
        gameState.blackHoles.forEach(bh => {
            let pulse = Math.sin(Date.now() / 150) * 8;
            ctx.beginPath();
            ctx.arc(bh.x, bh.y, bh.size + pulse, 0, Math.PI * 2);
            let grad = ctx.createRadialGradient(bh.x, bh.y, 5, bh.x, bh.y, bh.size + pulse);
            grad.addColorStop(0, 'black');
            grad.addColorStop(1, '#ff00ff');
            ctx.fillStyle = grad;
            ctx.shadowBlur = 30;
            ctx.shadowColor = '#ff00ff';
            ctx.fill();
        });

        // DIBUJAR JUGADORES
        for (let id in gameState.players) {
            let p = gameState.players[id];
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.shadowBlur = 15;
            ctx.shadowColor = p.color;
            ctx.fill();
            
            if(id === socket.id) {
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 3;
                ctx.stroke();
            }
        }
        ctx.restore();
    }
    requestAnimationFrame(draw);
}
draw();