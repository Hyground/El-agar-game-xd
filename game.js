const socket = io();
console.log("AGAR PI: Motor Senior Neon Iniciado");

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const mCanvas = document.getElementById('minimap');
const mctx = mCanvas.getContext('2d');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');

let gameStarted = false;
let selectedSkin = null;
const skinCache = {};
let currentZoom = 1.0;
let camera = { x: 0, y: 0 };
let gameState = { players: {}, food: [], viruses: [], leaderboard: [], mapSize: 15000 };

// SISTEMA DE ESTELAS (Particles)
let particles = [];
function addParticle(x, y, color) {
    if(particles.length > 100) return;
    particles.push({ x, y, size: Math.random()*5+2, color, life: 1.0 });
}

// WEB AUDIO
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSynthSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    if (type === 'eat') {
        osc.frequency.setValueAtTime(200, now); osc.frequency.exponentialRampToValueAtTime(400, now + 0.1);
        gain.gain.setValueAtTime(0.05, now); gain.gain.linearRampToValueAtTime(0, now + 0.1);
    } else {
        osc.frequency.setValueAtTime(100, now); osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
        gain.gain.setValueAtTime(0.05, now); gain.gain.linearRampToValueAtTime(0, now + 0.1);
    }
    osc.start(now); osc.stop(now + 0.1);
}

// CHAT PRESETS
const CHAT_PRESETS = {
    'Digit1': '¡Hola a todos!',
    'Digit2': '¡Buena partida!',
    'Digit3': '¡Casi me tienes!',
    'Digit4': '¡Team?'
};

// MOTOR DE JUEGO
function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resize); resize();

window.addEventListener('keydown', (e) => {
    if(!gameStarted) return;
    
    // LOGICA PROFESIONAL DE ENTER PARA CHAT
    if(e.code === 'Enter') {
        if(document.activeElement === chatInput) {
            const val = chatInput.value.trim();
            if(val) socket.emit('chatMessage', val);
            chatInput.value = '';
            chatInput.blur();
            canvas.focus();
        } else {
            chatInput.focus();
        }
        return;
    }

    // Bloquear otras teclas si se está escribiendo
    if(document.activeElement === chatInput) return;

    if(CHAT_PRESETS[e.code]) { socket.emit('chatMessage', CHAT_PRESETS[e.code]); return; }
    if(e.code === 'Space') { socket.emit('split'); playSynthSound('split'); }
    if(e.code === 'KeyW') { socket.emit('ejectMass'); playSynthSound('pop'); }
});

function sendQuick(num) {
    const key = `Digit${num}`;
    if(CHAT_PRESETS[key]) socket.emit('chatMessage', CHAT_PRESETS[key]);
}
window.sendQuick = sendQuick;

socket.on('chatUpdate', (data) => {
    const div = document.createElement('div');
    div.innerHTML = `<b style="color:${data.color}">${data.name}:</b> ${data.msg}`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

let lastScore = 0;
socket.on('gameState', (data) => {
    const me = data.players[socket.id];
    if(gameStarted && me && me.score > lastScore) { playSynthSound('eat'); lastScore = me.score; }
    gameState = data;
    const scores = document.getElementById('scores');
    if(scores) {
        let html = "";
        data.leaderboard.forEach((p, i) => { html += `<div style="display:flex; justify-content:space-between; font-size:12px; color:${i<3?'#00ffff':'#ccc'}"><span>${i+1}. ${p.name || "ID"}</span><span>${p.score}</span></div>`; });
        scores.innerHTML = html;
    }
});

function returnToMenu() {
    gameStarted = false;
    document.getElementById('menu').style.display = 'flex';
    document.getElementById('gameUI').style.display = 'none';
    socket.emit('disconnect'); // Opcional, forzar reconexión al jugar de nuevo
}
window.returnToMenu = returnToMenu;

function animate() {
    // 1. DIBUJAR FONDO PARALLAX
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Estrellas lejanas (Parallax)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    for(let i=0; i<100; i++) {
        let x = (i * 12345 % canvas.width) - (camera.x * 0.02 % canvas.width);
        let y = (i * 67890 % canvas.height) - (camera.y * 0.02 % canvas.height);
        if(x < 0) x += canvas.width; if(y < 0) y += canvas.height;
        ctx.fillRect(x, y, 2, 2);
    }

    if (gameStarted && gameState.players[socket.id]) {
        const myPlayer = gameState.players[socket.id];
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, maxCellSize = 0;
        myPlayer.cells.forEach(c => { minX = Math.min(minX, c.x); minY = Math.min(minY, c.y); maxX = Math.max(maxX, c.x); maxY = Math.max(maxY, c.y); if(c.size > maxCellSize) maxCellSize = c.size; });
        
        camera.x += (((minX + maxX) / 2) - camera.x) * 0.1;
        camera.y += (((minY + maxY) / 2) - camera.y) * 0.1;
        
        let spread = Math.max(maxX - minX, maxY - minY, maxCellSize * 2.5);
        let targetZoom = Math.pow(Math.min(1.0, (canvas.height / (spread + 800))), 0.7);
        currentZoom += (targetZoom - currentZoom) * 0.05;

        // Minimapa
        mctx.clearRect(0,0,150,150); mctx.fillStyle = '#00ffff';
        myPlayer.cells.forEach(c => { mctx.beginPath(); mctx.arc((c.x / gameState.mapSize) * 150, (c.y / gameState.mapSize) * 150, 2, 0, Math.PI*2); mctx.fill(); });

        ctx.save(); ctx.translate(canvas.width/2, canvas.height/2); ctx.scale(currentZoom, currentZoom); ctx.translate(-camera.x, -camera.y);
        
        // Borde neón pulsante
        let pulse = Math.sin(Date.now() / 500) * 5 + 10;
        ctx.strokeStyle = '#ff00ff'; ctx.lineWidth = pulse; ctx.strokeRect(0, 0, gameState.mapSize, gameState.mapSize);

        // Estelas
        for(let i=particles.length-1; i>=0; i--) {
            let p = particles[i]; p.life -= 0.02;
            if(p.life <= 0) { particles.splice(i, 1); continue; }
            ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
        }
        ctx.globalAlpha = 1.0;

        // Comida
        gameState.food.forEach(f => {
            ctx.beginPath(); ctx.arc(f.x, f.y, f.isMega ? 35 : (f.isEjected ? f.val : 12), 0, Math.PI*2);
            ctx.fillStyle = f.color || '#00ffff'; ctx.fill();
        });

        // Virus
        gameState.viruses.forEach(v => {
            ctx.beginPath(); ctx.arc(v.x, v.y, v.size, 0, Math.PI*2);
            ctx.fillStyle = 'rgba(0, 255, 0, 0.2)'; ctx.strokeStyle = '#00ff00'; ctx.lineWidth = 4;
            ctx.stroke(); ctx.fill();
        });

        // JUGADORES (Z-ORDER POR TAMAÑO)
        let allCells = [];
        for(let id in gameState.players) {
            gameState.players[id].cells.forEach(cell => { allCells.push({...cell, playerId: id, color: gameState.players[id].color, name: gameState.players[id].name, skin: gameState.players[id].skin}); });
        }
        allCells.sort((a, b) => a.size - b.size);

        allCells.forEach(cell => {
            // Añadir estela si se mueve rápido (opcional)
            if(Math.random() < 0.1) addParticle(cell.x, cell.y, cell.color);

            ctx.save();
            ctx.beginPath(); ctx.arc(cell.x, cell.y, cell.size, 0, Math.PI*2); ctx.clip();
            if (cell.skin) {
                if(!skinCache[cell.skin]) { skinCache[cell.skin] = new Image(); skinCache[cell.skin].src = cell.skin; }
                if(skinCache[cell.skin].complete) ctx.drawImage(skinCache[cell.skin], cell.x-cell.size, cell.y-cell.size, cell.size*2, cell.size*2);
            } else { ctx.fillStyle = cell.color; ctx.fill(); }
            ctx.restore();
            
            ctx.beginPath(); ctx.arc(cell.x, cell.y, cell.size, 0, Math.PI*2);
            ctx.strokeStyle = (cell.playerId === socket.id) ? '#fff' : cell.color; ctx.lineWidth = 4;
            ctx.stroke();

            let fontSize = Math.max(14, cell.size / 3);
            ctx.fillStyle = '#fff'; ctx.font = `bold ${fontSize}px Orbitron`; ctx.textAlign = 'center';
            ctx.fillText(cell.name, cell.x, cell.y);
            ctx.fillText(Math.floor(cell.size*cell.size/100), cell.x, cell.y + fontSize);
        });

        ctx.restore();
        const mx = (window.event?.clientX || canvas.width/2), my = (window.event?.clientY || canvas.height/2);
        socket.emit('updatePos', { x: camera.x + (mx - canvas.width/2) / currentZoom, y: camera.y + (my - canvas.height/2) / currentZoom });
    }
    requestAnimationFrame(animate);
}

// PLANETAS PRE-CARGADOS
const PLANETS = [
    { name: 'Mercurio', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Mercury_in_true_color.jpg/200px-Mercury_in_true_color.jpg' },
    { name: 'Venus', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Venus_from_Mariner_10.jpg/200px-Venus_from_Mariner_10.jpg' },
    { name: 'Tierra', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/The_Earth_seen_from_Apollo_17.jpg/200px-The_Earth_seen_from_Apollo_17.jpg' },
    { name: 'Marte', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/OSIRIS_Mars_true_color.jpg/200px-OSIRIS_Mars_true_color.jpg' },
    { name: 'Júpiter', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Jupiter_and_its_shrunken_Great_Red_Spot.jpg/200px-Jupiter_and_its_shrunken_Great_Red_Spot.jpg' },
    { name: 'Saturno', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Saturn_during_Equinox.jpg/200px-Saturn_during_Equinox.jpg' },
    { name: 'Urano', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Uranus2.jpg/200px-Uranus2.jpg' },
    { name: 'Neptuno', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Neptune_Full.jpg/200px-Neptune_Full.jpg' }
];

const skinSelector = document.getElementById('skinSelector');
if(skinSelector) {
    PLANETS.forEach(p => {
        const div = document.createElement('div'); div.className = 'skin-item'; div.style.backgroundImage = `url(${p.url})`;
        div.onclick = () => { document.querySelectorAll('.skin-item').forEach(el => el.classList.remove('active')); div.classList.add('active'); selectedSkin = p.url; };
        skinSelector.appendChild(div);
    });
}

const fileInput = document.getElementById('fileInput');
const customBtn = document.getElementById('customBtn');
const cropModal = document.getElementById('cropModal');
const cropCanvas = document.getElementById('cropCanvas');
const confirmCrop = document.getElementById('confirmCrop');
let cropState = { x1: 50, y1: 50, x2: 250, y2: 250, active: false, img: null };

if(customBtn && fileInput) {
    customBtn.onclick = () => fileInput.click();
    fileInput.onchange = (e) => {
        const file = e.target.files[0]; if(!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image(); img.src = ev.target.result;
            img.onload = () => { cropState.img = img; if(cropModal) cropModal.style.display = 'block'; drawCropUI(); };
        };
        reader.readAsDataURL(file);
    };
}

function drawCropUI() {
    if(!cropState.img) return;
    const cctx = cropCanvas.getContext('2d');
    cctx.fillStyle = '#000'; cctx.fillRect(0,0,300,300);
    let r = Math.min(300 / cropState.img.width, 300 / cropState.img.height);
    let nw = cropState.img.width * r, nh = cropState.img.height * r;
    cctx.drawImage(cropState.img, (300-nw)/2, (300-nh)/2, nw, nh);
    cctx.strokeStyle = '#00ffff'; cctx.strokeRect(cropState.x1, cropState.y1, cropState.x2 - cropState.x1, cropState.y2 - cropState.y1);
}

if(cropCanvas) {
    cropCanvas.onmousedown = (e) => { const rect = cropCanvas.getBoundingClientRect(); cropState.x1 = e.clientX - rect.left; cropState.y1 = e.clientY - rect.top; cropState.active = true; };
    cropCanvas.onmousemove = (e) => { if(!cropState.active) return; const rect = cropCanvas.getBoundingClientRect(); cropState.x2 = e.clientX - rect.left; cropState.y2 = e.clientY - rect.top; drawCropUI(); };
    cropCanvas.onmouseup = () => cropState.active = false;
}

if(confirmCrop) {
    confirmCrop.onclick = () => {
        const size = Math.min(Math.abs(cropState.x2 - cropState.x1), Math.abs(cropState.y2 - cropState.y1));
        if(size < 5) return;
        const temp = document.createElement('canvas'); temp.width = 200; temp.height = 200;
        const tctx = temp.getContext('2d');
        tctx.beginPath(); tctx.arc(100,100,100,0,Math.PI*2); tctx.clip();
        let r = Math.min(300 / cropState.img.width, 300 / cropState.img.height);
        let offsetX = (300 - cropState.img.width*r)/2, offsetY = (300 - cropState.img.height*r)/2;
        let sourceX = (Math.min(cropState.x1, cropState.x2) - offsetX) / r, sourceY = (Math.min(cropState.y1, cropState.y2) - offsetY) / r;
        tctx.drawImage(cropState.img, sourceX, sourceY, size/r, size/r, 0, 0, 200, 200);
        selectedSkin = temp.toDataURL(); cropModal.style.display = 'none';
        if(customBtn) customBtn.innerText = "✅ NAVE CONFIGURADA";
    };
}

const playBtn = document.getElementById('playBtn');
if(playBtn) {
    playBtn.onclick = () => {
        audioCtx.resume();
        const name = document.getElementById('playerName').value.trim();
        socket.emit('joinGame', { name, skin: selectedSkin });
        document.getElementById('menu').style.display = 'none';
        document.getElementById('gameUI').style.display = 'block';
        gameStarted = true;
    };
}

animate();
window.onmousemove = (e) => { window.event = e; };
