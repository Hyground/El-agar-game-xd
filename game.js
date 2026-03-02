const socket = io();
console.log("AGAR PI: Motor Iniciado");

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const mCanvas = document.getElementById('minimap');
const mctx = mCanvas.getContext('2d');
const fpsDisplay = document.getElementById('fpsCounter');

let gameStarted = false;
let selectedSkin = null;
const skinCache = {};
let currentZoom = 1.0;
let camera = { x: 0, y: 0 };
let gameState = { players: {}, food: [], viruses: [], lootHoles: [], leaderboard: [], mapSize: 15000 };

// SISTEMA DE GRÁFICOS
let gfxMode = 'ultra';
function setGfx(mode) {
    console.log("Cambiando modo gráfico a:", mode);
    gfxMode = mode;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    if(mode === 'ultra') document.getElementById('modeUltra')?.classList.add('active');
    if(mode === 'comp') document.getElementById('modeComp')?.classList.add('active');
    if(mode === 'perf') document.getElementById('modePerf')?.classList.add('active');
}
window.setGfx = setGfx;

// WEB AUDIO
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let lastSoundTime = 0;
function playSynthSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    if (Date.now() - lastSoundTime < 50) return;
    lastSoundTime = Date.now();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    if (type === 'eat') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(150, now); osc.frequency.exponentialRampToValueAtTime(300, now + 0.08);
        gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        osc.start(now); osc.stop(now + 0.08);
    } else if (type === 'split') {
        osc.type = 'triangle'; osc.frequency.setValueAtTime(400, now); osc.frequency.exponentialRampToValueAtTime(100, now + 0.15);
        gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now); osc.stop(now + 0.15);
    } else if (type === 'pop') {
        osc.type = 'square'; osc.frequency.setValueAtTime(100, now); osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
        gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
    }
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

// CORRECCIÓN DEL CROP SYSTEM
const fileInput = document.getElementById('fileInput');
const customBtn = document.getElementById('customBtn');
const cropModal = document.getElementById('cropModal');
const cropCanvas = document.getElementById('cropCanvas');
const confirmCrop = document.getElementById('confirmCrop');

let cropState = { x1: 50, y1: 50, x2: 250, y2: 250, active: false, img: null };

if(customBtn && fileInput) {
    customBtn.onclick = () => { fileInput.click(); };
    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.src = ev.target.result;
            img.onload = () => {
                cropState.img = img;
                if(cropModal) cropModal.style.display = 'block';
                drawCropUI();
            };
        };
        reader.readAsDataURL(file);
    };
}

function drawCropUI() {
    if(!cropState.img) return;
    const cctx = cropCanvas.getContext('2d');
    cctx.fillStyle = '#000'; cctx.fillRect(0,0,300,300);
    
    let r = Math.min(300 / cropState.img.width, 300 / cropState.img.height);
    let nw = cropState.img.width * r;
    let nh = cropState.img.height * r;
    cctx.drawImage(cropState.img, (300-nw)/2, (300-nh)/2, nw, nh);
    
    // Dibujar área de selección
    cctx.strokeStyle = '#00ffff'; cctx.lineWidth = 2;
    cctx.strokeRect(cropState.x1, cropState.y1, cropState.x2 - cropState.x1, cropState.y2 - cropState.y1);
    cctx.fillStyle = 'rgba(0, 255, 255, 0.1)';
    cctx.fillRect(cropState.x1, cropState.y1, cropState.x2 - cropState.x1, cropState.y2 - cropState.y1);
}

if(cropCanvas) {
    cropCanvas.onmousedown = (e) => {
        const rect = cropCanvas.getBoundingClientRect();
        cropState.x1 = e.clientX - rect.left;
        cropState.y1 = e.clientY - rect.top;
        cropState.active = true;
    };
    cropCanvas.onmousemove = (e) => {
        if(!cropState.active) return;
        const rect = cropCanvas.getBoundingClientRect();
        cropState.x2 = e.clientX - rect.left;
        cropState.y2 = e.clientY - rect.top;
        drawCropUI();
    };
    cropCanvas.onmouseup = () => { cropState.active = false; };
}

if(confirmCrop) {
    confirmCrop.onclick = () => {
        const width = Math.abs(cropState.x2 - cropState.x1);
        const height = Math.abs(cropState.y2 - cropState.y1);
        const size = Math.min(width, height);
        if(size < 5) return;

        const temp = document.createElement('canvas'); temp.width = 200; temp.height = 200;
        const tctx = temp.getContext('2d');
        tctx.beginPath(); tctx.arc(100,100,100,0,Math.PI*2); tctx.clip();
        
        let r = Math.min(300 / cropState.img.width, 300 / cropState.img.height);
        let offsetX = (300 - cropState.img.width*r)/2;
        let offsetY = (300 - cropState.img.height*r)/2;
        
        let sourceX = (Math.min(cropState.x1, cropState.x2) - offsetX) / r;
        let sourceY = (Math.min(cropState.y1, cropState.y2) - offsetY) / r;
        let sourceSize = size / r;

        tctx.drawImage(cropState.img, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 200, 200);
        selectedSkin = temp.toDataURL();
        cropModal.style.display = 'none';
        console.log("Skin personalizada cargada con éxito");
        if(customBtn) customBtn.innerText = "✅ NAVE CONFIGURADA";
    };
}

// INICIAR PARTIDA
const playBtn = document.getElementById('playBtn');
if(playBtn) {
    playBtn.onclick = () => {
        console.log("Iniciando misión...");
        audioCtx.resume();
        const name = document.getElementById('playerName').value.trim();
        socket.emit('joinGame', { name, skin: selectedSkin });
        document.getElementById('menu').style.display = 'none';
        document.getElementById('gameUI').style.display = 'block';
        gameStarted = true;
    };
}

// MOTOR DE JUEGO
function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resize); resize();

window.addEventListener('keydown', (e) => {
    if(!gameStarted) return;
    if(e.code === 'Space') { socket.emit('split'); playSynthSound('split'); }
    if(e.code === 'KeyW') { socket.emit('ejectMass'); playSynthSound('pop'); }
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

socket.on('virusHit', () => playSynthSound('pop'));
socket.on('gameOver', () => { 
    gameStarted = false; 
    document.getElementById('menu').style.display = 'flex'; 
    document.getElementById('gameUI').style.display = 'none'; 
});

let lastLoop = performance.now();
function animate() {
    let thisLoop = performance.now();
    let fps = Math.round(1000 / (thisLoop - lastLoop)); lastLoop = thisLoop;
    if(Math.random() < 0.1 && fpsDisplay) fpsDisplay.innerText = `FPS: ${fps}`;

    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (gameStarted && gameState.players[socket.id]) {
        const myPlayer = gameState.players[socket.id];
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, maxCellSize = 0;
        myPlayer.cells.forEach(c => { minX = Math.min(minX, c.x); minY = Math.min(minY, c.y); maxX = Math.max(maxX, c.x); maxY = Math.max(maxY, c.y); if(c.size > maxCellSize) maxCellSize = c.size; });
        camera.x += (((minX + maxX) / 2) - camera.x) * 0.1; camera.y += (((minY + maxY) / 2) - camera.y) * 0.1;
        let spread = Math.max(maxX - minX, maxY - minY, maxCellSize * 2.5);
        let targetZoom = Math.pow(Math.min(1.0, (canvas.height / (spread + 800))), 0.7);
        currentZoom += (targetZoom - currentZoom) * 0.05;

        if(gfxMode !== 'perf') {
            const step = 100; ctx.strokeStyle = 'rgba(0, 255, 255, 0.05)'; ctx.lineWidth = 1; ctx.beginPath();
            let startX = ((-camera.x * currentZoom + canvas.width/2) % (step * currentZoom));
            for (let x = startX; x < canvas.width; x += step * currentZoom) { ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); }
            let startY = ((-camera.y * currentZoom + canvas.height/2) % (step * currentZoom));
            for (let y = startY; y < canvas.height; y += step * currentZoom) { ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); }
            ctx.stroke();
        }

        mctx.clearRect(0,0,150,150); mctx.fillStyle = '#00ffff';
        myPlayer.cells.forEach(c => { mctx.beginPath(); mctx.arc((c.x / gameState.mapSize) * 150, (c.y / gameState.mapSize) * 150, 2, 0, Math.PI*2); mctx.fill(); });

        ctx.save(); ctx.translate(canvas.width/2, canvas.height/2); ctx.scale(currentZoom, currentZoom); ctx.translate(-camera.x, -camera.y);
        if(gfxMode !== 'perf') { ctx.strokeStyle = '#ff00ff'; ctx.lineWidth = 15; ctx.strokeRect(0, 0, gameState.mapSize, gameState.mapSize); }

        gameState.food.forEach(f => {
            ctx.beginPath(); let radius = f.isMega ? 35 : (f.isEjected ? f.val : 12); ctx.arc(f.x, f.y, radius, 0, Math.PI*2);
            ctx.fillStyle = f.color || '#00ffff';
            if(gfxMode === 'ultra' && (f.isMega || f.isEjected)) { ctx.shadowBlur = 15; ctx.shadowColor = f.color; ctx.fill(); ctx.shadowBlur = 0; } else { ctx.fill(); }
        });

        gameState.viruses.forEach(v => {
            ctx.beginPath(); ctx.arc(v.x, v.y, v.size, 0, Math.PI*2);
            ctx.fillStyle = gfxMode === 'perf' ? '#0f0' : 'rgba(0, 255, 0, 0.2)';
            ctx.strokeStyle = '#00ff00'; ctx.lineWidth = (gfxMode === 'perf' ? 2 : 8);
            ctx.stroke(); ctx.fill();
        });

        for (let id in gameState.players) {
            let p = gameState.players[id];
            p.cells.forEach(cell => {
                ctx.save();
                if(gfxMode !== 'perf') {
                    let sX = 1, sY = 1;
                    if(cell.x < cell.size + 10 || cell.x > gameState.mapSize - cell.size - 10) { sX = 0.85; sY = 1.15; }
                    if(cell.y < cell.size + 10 || cell.y > gameState.mapSize - cell.size - 10) { sX = 1.15; sY = 0.85; }
                    ctx.translate(cell.x, cell.y); ctx.scale(sX, sY); ctx.translate(-cell.x, -cell.y);
                }
                ctx.beginPath(); ctx.arc(cell.x, cell.y, cell.size, 0, Math.PI*2); ctx.clip();
                if (p.skin && gfxMode !== 'perf') {
                    if(!skinCache[p.skin]) { skinCache[p.skin] = new Image(); skinCache[p.skin].src = p.skin; }
                    if(skinCache[p.skin].complete) ctx.drawImage(skinCache[p.skin], cell.x-cell.size, cell.y-cell.size, cell.size*2, cell.size*2);
                } else { ctx.fillStyle = p.color; ctx.fill(); }
                ctx.restore();
                
                if(gfxMode !== 'perf') {
                    ctx.beginPath(); ctx.arc(cell.x, cell.y, cell.size, 0, Math.PI*2);
                    ctx.strokeStyle = (id === socket.id) ? '#fff' : p.color; ctx.lineWidth = (gfxMode === 'ultra' ? 6 : 3);
                    if(gfxMode === 'ultra' && id === socket.id) { ctx.shadowBlur = 15; ctx.shadowColor = '#00ffff'; }
                    ctx.stroke(); ctx.shadowBlur = 0;
                }

                let fontSize = Math.max(14, cell.size / 3);
                ctx.fillStyle = '#fff'; ctx.font = `bold ${fontSize}px Orbitron`; ctx.textAlign = 'center';
                ctx.fillText(p.name, cell.x, cell.y);
                if(gfxMode !== 'perf') ctx.fillText(Math.floor(cell.size*cell.size/100), cell.x, cell.y + fontSize);
            });
        }
        ctx.restore();
        const mx = (window.event?.clientX || canvas.width/2), my = (window.event?.clientY || canvas.height/2);
        socket.emit('updatePos', { x: camera.x + (mx - canvas.width/2) / currentZoom, y: camera.y + (my - canvas.height/2) / currentZoom });
    }
    requestAnimationFrame(animate);
}
animate();
window.onmousemove = (e) => { window.event = e; };
