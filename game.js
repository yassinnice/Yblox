/** 
 * MULTIPLAYER 2D ENGINE 
 * Handles Lobby state, WebSockets, Canvas Rendering, and Input 
 */

// --- 1. GLOBAL STATE & CONFIG ---
const AVATARS = [
    { name: 'Bacon Hair', head: '#f3d1b0', torso: '#3498db', legs: '#2c3e50', aura: null, hat: 'bacon' },
    { name: 'Cyber Ninja', head: '#111111', torso: '#00d2d3', legs: '#222f3e', aura: '#00d2d3', hat: 'visor' },
    { name: 'Dominus King', head: '#1e272e', torso: '#f1c40f', legs: '#2f3640', aura: '#f1c40f', hat: 'crown' },
    { name: 'Inferno Demon', head: '#c0392b', torso: '#2c2c54', legs: '#111111', aura: '#ff3f34', hat: 'horns' },
    { name: 'Neon Valkyrie', head: '#f8a5c2', torso: '#9b59b6', legs: '#303952', aura: '#e056fd', hat: 'valk' }
];

const baconImg = new Image();
baconImg.crossOrigin = 'anonymous';
baconImg.src = 'https://static.wikia.nocookie.net/roblox/images/a/a2/Pal_Hair.png';

let currentServer = 'PUBLIC';
let otherPlayers = {};
let ws = null;
let localChannel = null;
let isGameRunning = false;

// Local Player State
let player = {
    id: 'plr_' + Math.random().toString(36).substring(2, 10),
    username: localStorage.getItem('rbx_username') || 'Guest_' + Math.floor(Math.random() * 999),
    avatarId: parseInt(localStorage.getItem('rbx_avatar') || '0', 10),
    x: 0, y: 0, vx: 0, vy: 0, speed: 6.5, width: 64, height: 76, walkFrame: 0
};

// --- 2. DOM ELEMENTS ---
const screens = {
    lobby: document.getElementById('lobby-screen'),
    game: document.getElementById('game-screen')
};

const lobbyUI = {
    username: document.getElementById('lobby-username'),
    avatarBtns: document.querySelectorAll('.avatar-btn'),
    joinCode: document.getElementById('lobby-join-code'),
    btnPublic: document.getElementById('btn-play-public'),
    btnPrivate: document.getElementById('btn-play-private'),
    btnJoin: document.getElementById('btn-play-join')
};

const gameUI = {
    canvas: document.getElementById('gameCanvas'),
    ctx: document.getElementById('gameCanvas').getContext('2d'),
    serverBadge: document.getElementById('server-badge'),
    btnOpenServer: document.getElementById('open-server-btn'),
    onlineCount: document.getElementById('online-count'),
    btnPrank: document.getElementById('top-logo')
};

const modals = {
    server: document.getElementById('server-modal'),
    disconnect: document.getElementById('roblox-disconnect'),
    lblCurrentServer: document.getElementById('modal-current-server'),
    btnCopy: document.getElementById('btn-copy-code'),
    btnLeave: document.getElementById('btn-return-lobby'),
    btnClose: document.getElementById('btn-close-modal')
};

// --- 3. LOBBY LOGIC ---
function initLobby() {
    lobbyUI.username.value = player.username;
    
    lobbyUI.avatarBtns.forEach(btn => {
        if (parseInt(btn.dataset.id) === player.avatarId) btn.classList.add('selected');
        else btn.classList.remove('selected');
        
        btn.onclick = () => {
            lobbyUI.avatarBtns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            player.avatarId = parseInt(btn.dataset.id);
            localStorage.setItem('rbx_avatar', player.avatarId);
        };
    });

    lobbyUI.username.addEventListener('input', () => {
        player.username = lobbyUI.username.value.trim() || 'Guest';
        localStorage.setItem('rbx_username', player.username);
    });

    lobbyUI.btnPublic.onclick = () => startGame('PUBLIC');
    
    lobbyUI.btnPrivate.onclick = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for(let i=0; i<5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
        startGame(code);
    };

    lobbyUI.btnJoin.onclick = () => {
        const code = lobbyUI.joinCode.value.trim().toUpperCase();
        if (code) startGame(code);
        else alert('Enter a valid room code!');
    };
}

function startGame(serverCode) {
    currentServer = serverCode;
    screens.lobby.style.opacity = '0';
    setTimeout(() => {
        screens.lobby.style.display = 'none';
        screens.game.style.display = 'block';
        resizeCanvas();
        
        player.x = gameUI.canvas.width / 2;
        player.y = gameUI.canvas.height / 2;
        
        updateServerUI();
        connectNetwork();
        
        if (!isGameRunning) {
            isGameRunning = true;
            gameLoop();
        }
    }, 500);
}

function exitToLobby() {
    sendLeaveMessage();
    isGameRunning = false;
    modals.server.style.display = 'none';
    screens.game.style.display = 'none';
    screens.lobby.style.display = 'flex';
    setTimeout(() => { screens.lobby.style.opacity = '1'; }, 50);
}

// --- 4. GAME UI & MODALS LOGIC ---
gameUI.btnPrank.onclick = () => { modals.disconnect.style.display = 'flex'; };

gameUI.btnOpenServer.onclick = () => {
    modals.lblCurrentServer.textContent = currentServer;
    modals.server.style.display = 'flex';
};

modals.btnClose.onclick = () => { modals.server.style.display = 'none'; };
modals.btnLeave.onclick = () => exitToLobby();

modals.btnCopy.onclick = () => {
    navigator.clipboard?.writeText(currentServer);
    modals.btnCopy.textContent = '✅ Copied!';
    setTimeout(() => { modals.btnCopy.textContent = '📋 Copy Invite Code'; }, 2000);
};

gameUI.serverBadge.onclick = () => {
    navigator.clipboard?.writeText(currentServer);
    gameUI.serverBadge.textContent = '✅ COPIED';
    setTimeout(updateServerUI, 2000);
};

function updateServerUI() {
    if (currentServer === 'PUBLIC') {
        gameUI.serverBadge.textContent = '🌐 PUBLIC';
        gameUI.serverBadge.style.color = 'var(--accent-blue)';
        gameUI.serverBadge.style.borderColor = 'var(--accent-blue)';
    } else {
        gameUI.serverBadge.textContent = `🔑 ${currentServer}`;
        gameUI.serverBadge.style.color = 'var(--accent-gold)';
        gameUI.serverBadge.style.borderColor = 'var(--accent-gold)';
    }
}

// --- 5. NETWORKING ---
function connectNetwork() {
    if (localChannel) localChannel.close();
    localChannel = new BroadcastChannel('room_' + currentServer);
    localChannel.onmessage = (e) => handleNetworkMessage(e.data);

    if (ws) ws.close();
    otherPlayers = {};
    
    try {
        ws = new WebSocket(`wss://free.blr2.piesocket.com/v3/rbx-room-${currentServer}?api_key=VCXCEuvhGcBDP7XhiJJUDvR1e1D3eiVjgZ9VRiaV&notify_self=0`);
        ws.onopen = () => broadcastState();
        ws.onmessage = (e) => { try { handleNetworkMessage(JSON.parse(e.data)); } catch(err){} };
    } catch(err){}
}

function handleNetworkMessage(data) {
    if (!data || data.id === player.id || data.server !== currentServer) return;
    if (data.type === 'update') {
        otherPlayers[data.id] = { ...data, lastSeen: Date.now() };
    } else if (data.type === 'leave') {
        delete otherPlayers[data.id];
    }
    updateOnlineCount();
}

function broadcastState() {
    if (!isGameRunning) return;
    const payload = {
        type: 'update', server: currentServer, id: player.id,
        username: player.username, avatarId: player.avatarId,
        x: Math.round(player.x), y: Math.round(player.y),
        vx: player.vx, vy: player.vy, walkFrame: player.walkFrame
    };
    if (localChannel) localChannel.postMessage(payload);
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function sendLeaveMessage() {
    const payload = { type: 'leave', server: currentServer, id: player.id };
    if (localChannel) localChannel.postMessage(payload);
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function updateOnlineCount() {
    gameUI.onlineCount.textContent = `● ${1 + Object.keys(otherPlayers).length}`;
}

// Network Loops
setInterval(broadcastState, 50);
setInterval(() => {
    const now = Date.now();
    for (const id in otherPlayers) {
        if (now - otherPlayers[id].lastSeen > 4000) delete otherPlayers[id];
    }
    updateOnlineCount();
}, 1000);
window.addEventListener('beforeunload', sendLeaveMessage);

// --- 6. INPUT (JOYSTICK & KEYBOARD) ---
const joyBase = document.getElementById('joy-base');
const joyStick = document.getElementById('joy-stick');
let joyX = 0, joyY = 0, isDragging = false;
const keys = {};

joyBase.addEventListener('pointerdown', e => { isDragging = true; dragJoy(e); });
window.addEventListener('pointermove', dragJoy);
window.addEventListener('pointerup', () => {
    isDragging = false; joyX = 0; joyY = 0;
    joyStick.style.transform = `translate(0px, 0px)`;
});

function dragJoy(e) {
    if (!isDragging) return;
    const rect = joyBase.getBoundingClientRect();
    const max = rect.width / 2 - joyStick.clientWidth / 2;
    let dx = e.clientX - (rect.left + rect.width / 2);
    let dy = e.clientY - (rect.top + rect.height / 2);
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist > max) { dx = (dx/dist)*max; dy = (dy/dist)*max; }
    joyX = dx / max; joyY = dy / max;
    joyStick.style.transform = `translate(${dx}px, ${dy}px)`;
}

window.addEventListener('keydown', e => {
    if (document.activeElement.tagName === 'INPUT') return;
    keys[e.key.toLowerCase()] = true; 
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

// --- 7. RENDERING ENGINE ---
function resizeCanvas() {
    gameUI.canvas.width = window.innerWidth;
    gameUI.canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);

function drawGrid(ctx, w, h) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 2;
    for (let x = 0; x < w; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
}

function drawCharacter(ctx, p, isLocal) {
    const style = AVATARS[p.avatarId] || AVATARS[0];
    const x = p.x, y = p.y, swing = Math.sin(p.walkFrame) * 6;
    ctx.save();

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(x, y + 34, 24, 9, 0, 0, Math.PI * 2); ctx.fill();

    if (style.aura) { ctx.shadowColor = style.aura; ctx.shadowBlur = 20; }

    // Body parts
    ctx.fillStyle = style.legs;
    ctx.fillRect(x - 13, y + 10 + swing, 11, 22);
    ctx.fillRect(x + 2, y + 10 - swing, 11, 22);

    ctx.fillStyle = style.head;
    ctx.fillRect(x - 24, y - 14 - swing, 9, 22);
    ctx.fillRect(x + 15, y - 14 + swing, 9, 22);

    ctx.fillStyle = style.torso;
    ctx.fillRect(x - 14, y - 14, 28, 25);

    ctx.fillStyle = style.head;
    ctx.beginPath(); ctx.roundRect(x - 12, y - 38, 24, 23, 5); ctx.fill();
    ctx.shadowBlur = 0; // stop glow for face

    // Face
    ctx.fillStyle = style.hat === 'visor' ? '#00ffff' : '#111';
    if (style.hat === 'visor') {
        ctx.fillRect(x - 10, y - 30, 20, 6);
    } else {
        ctx.fillRect(x - 6, y - 29, 3, 4);
        ctx.fillRect(x + 3, y - 29, 3, 4);
        ctx.beginPath(); ctx.arc(x, y - 22, 4, 0.1 * Math.PI, 0.9 * Math.PI);
        ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5; ctx.stroke();
    }

    // Hats
    if (style.hat === 'bacon') {
        if (baconImg.complete && baconImg.naturalWidth > 0) ctx.drawImage(baconImg, x - 20, y - 50, 40, 32);
        else { ctx.fillStyle = '#8b4513'; ctx.fillRect(x - 14, y - 42, 28, 9); }
    } else if (style.hat === 'crown') {
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath(); ctx.moveTo(x - 13, y - 37); ctx.lineTo(x - 13, y - 48); ctx.lineTo(x - 5, y - 41);
        ctx.lineTo(x, y - 50); ctx.lineTo(x + 5, y - 41); ctx.lineTo(x + 13, y - 48); ctx.lineTo(x + 13, y - 37); ctx.fill();
    } else if (style.hat === 'horns') {
        ctx.fillStyle = '#ff3f34';
        ctx.beginPath(); ctx.moveTo(x - 10, y - 36); ctx.lineTo(x - 20, y - 50); ctx.lineTo(x - 4, y - 38);
        ctx.moveTo(x + 10, y - 36); ctx.lineTo(x + 20, y - 50); ctx.lineTo(x + 4, y - 38); ctx.fill();
    } else if (style.hat === 'valk') {
        ctx.fillStyle = '#e056fd';
        ctx.beginPath(); ctx.moveTo(x - 12, y - 35); ctx.lineTo(x - 26, y - 52); ctx.lineTo(x - 10, y - 42);
        ctx.moveTo(x + 12, y - 35); ctx.lineTo(x + 26, y - 52); ctx.lineTo(x + 10, y - 42); ctx.fill();
    }

    // Nametag
    ctx.font = 'bold 13px sans-serif';
    const tagW = ctx.measureText(p.username).width;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath(); ctx.roundRect(x - tagW/2 - 8, y - 68, tagW + 16, 20, 6); ctx.fill();
    ctx.fillStyle = isLocal ? '#00ff9d' : '#ffffff';
    ctx.textAlign = 'center'; ctx.fillText(p.username, x, y - 54);
    ctx.restore();
}

function gameLoop() {
    if (!isGameRunning) return;

    let mx = joyX, my = joyY;
    if (keys['w'] || keys['arrowup']) my = -1;
    if (keys['s'] || keys['arrowdown']) my = 1;
    if (keys['a'] || keys['arrowleft']) mx = -1;
    if (keys['d'] || keys['arrowright']) mx = 1;

    if (!isDragging && mx !== 0 && my !== 0) { mx *= 0.707; my *= 0.707; }

    player.vx = mx * player.speed;
    player.vy = my * player.speed;
    player.x += player.vx;
    player.y += player.vy;

    if (Math.abs(player.vx) > 0.1 || Math.abs(player.vy) > 0.1) player.walkFrame += 0.25;
    else player.walkFrame = 0;

    const cw = gameUI.canvas.width, ch = gameUI.canvas.height;
    player.x = Math.max(player.width/2, Math.min(cw - player.width/2, player.x));
    player.y = Math.max(player.height/2 + 30, Math.min(ch - player.height/2, player.y));

    gameUI.ctx.clearRect(0, 0, cw, ch);
    drawGrid(gameUI.ctx, cw, ch);

    for (const id in otherPlayers) {
        const op = otherPlayers[id];
        op.x += (op.vx || 0) * 0.5;
        op.y += (op.vy || 0) * 0.5;
        drawCharacter(gameUI.ctx, op, false);
    }
    
    drawCharacter(gameUI.ctx, player, true);
    requestAnimationFrame(gameLoop);
}

// Start in Lobby
initLobby();
