// --- 1. PRANK LOGIC ---
document.getElementById('top-logo').onclick = () => {
    document.getElementById('roblox-disconnect').style.display = 'flex';
};

// --- 2. CANVAS SETUP ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// --- 3. AVATAR PRESETS & BACON IMAGE ---
const baconImg = new Image();
baconImg.crossOrigin = 'anonymous';
baconImg.src = 'https://static.wikia.nocookie.net/roblox/images/a/a2/Pal_Hair.png';

const AVATARS = [
    { name: 'Bacon Hair', head: '#f3d1b0', torso: '#3498db', legs: '#2c3e50', aura: null, hat: 'bacon' },
    { name: 'Cyber Ninja', head: '#111111', torso: '#00d2d3', legs: '#222f3e', aura: '#00d2d3', hat: 'visor' },
    { name: 'Dominus King', head: '#1e272e', torso: '#f1c40f', legs: '#2f3640', aura: '#f1c40f', hat: 'crown' },
    { name: 'Inferno Demon', head: '#c0392b', torso: '#2c2c54', legs: '#111111', aura: '#ff3f34', hat: 'horns' },
    { name: 'Neon Valkyrie', head: '#f8a5c2', torso: '#9b59b6', legs: '#303952', aura: '#e056fd', hat: 'valk' }
];

// --- 4. LOCAL PLAYER & URL PARAMS (FROM YOUR MENU HREF) ---
const urlParams = new URLSearchParams(window.location.search);
const initialName = urlParams.get('username') || localStorage.getItem('rbx_username') || 'Player_' + Math.floor(100 + Math.random() * 900);
const initialAvatar = parseInt(urlParams.get('avatar') || localStorage.getItem('rbx_avatar') || '0', 10);

const myId = 'plr_' + Math.random().toString(36).substring(2, 10);

let player = {
    id: myId,
    username: initialName,
    avatarId: isNaN(initialAvatar) ? 0 : Math.min(Math.max(initialAvatar, 0), AVATARS.length - 1),
    x: canvas.width / 2,
    y: canvas.height / 2,
    vx: 0,
    vy: 0,
    speed: 6,
    width: 64,
    height: 76,
    walkFrame: 0
};

// Sync UI inputs
const usernameInput = document.getElementById('username-input');
const avatarSelect = document.getElementById('avatar-select');
const onlineCountEl = document.getElementById('online-count');

usernameInput.value = player.username;
avatarSelect.value = player.avatarId;

usernameInput.addEventListener('input', () => {
    player.username = usernameInput.value.trim() || 'Guest';
    localStorage.setItem('rbx_username', player.username);
    broadcastState();
});

avatarSelect.addEventListener('change', () => {
    player.avatarId = parseInt(avatarSelect.value, 10);
    localStorage.setItem('rbx_avatar', player.avatarId);
    broadcastState();
});

// --- 5. MULTIPLAYER NETWORKING (TAB SYNC + INTERNET WEBSOCKET RELAY) ---
const otherPlayers = {}; // id -> player object

// A. Local Tab-to-Tab Multiplayer (BroadcastChannel)
const localChannel = new BroadcastChannel('roblox_2d_multiplayer_v1');
localChannel.onmessage = (event) => handleNetworkMessage(event.data);

// B. Cross-Device Public WebSocket Relay (PieSocket / Echo Broadcast fallback)
let ws = null;
function connectWebSocket() {
    try {
        ws = new WebSocket('wss://free.blr2.piesocket.com/v3/roblox-2d-kit-room?api_key=VCXCEuvhGcBDP7XhiJJUDvR1e1D3eiVjgZ9VRiaV&notify_self=0');
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleNetworkMessage(data);
            } catch (e) {}
        };
        ws.onclose = () => setTimeout(connectWebSocket, 5000);
    } catch (e) {}
}
connectWebSocket();

function handleNetworkMessage(data) {
    if (!data || data.id === myId) return;

    if (data.type === 'update') {
        otherPlayers[data.id] = {
            ...data,
            lastSeen: Date.now()
        };
    } else if (data.type === 'leave') {
        delete otherPlayers[data.id];
    }
}

function broadcastState() {
    const payload = {
        type: 'update',
        id: player.id,
        username: player.username,
        avatarId: player.avatarId,
        x: Math.round(player.x),
        y: Math.round(player.y),
        vx: player.vx,
        vy: player.vy,
        walkFrame: player.walkFrame
    };

    localChannel.postMessage(payload);
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
    }
}

window.addEventListener('beforeunload', () => {
    const leaveMsg = { type: 'leave', id: myId };
    localChannel.postMessage(leaveMsg);
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(leaveMsg));
    }
});

// Broadcast position 20 times per second
setInterval(broadcastState, 50);

// Clean up disconnected players every second
setInterval(() => {
    const now = Date.now();
    for (const id in otherPlayers) {
        if (now - otherPlayers[id].lastSeen > 4000) {
            delete otherPlayers[id];
        }
    }
    const count = 1 + Object.keys(otherPlayers).length;
    onlineCountEl.textContent = `● ${count} Online`;
}, 1000);

// --- 6. JOYSTICK & KEYBOARD CONTROLS ---
const joyBase = document.getElementById('joy-base');
const joyStick = document.getElementById('joy-stick');
let isDragging = false, joyX = 0, joyY = 0;

joyBase.addEventListener('pointerdown', e => { isDragging = true; drag(e); });
window.addEventListener('pointermove', drag);
window.addEventListener('pointerup', () => {
    isDragging = false;
    joyX = 0; joyY = 0;
    joyStick.style.transform = `translate(0px, 0px)`;
});

function drag(e) {
    if (!isDragging) return;
    const rect = joyBase.getBoundingClientRect();
    const maxDist = rect.width / 2 - joyStick.clientWidth / 2;
    let dx = e.clientX - (rect.left + rect.width / 2);
    let dy = e.clientY - (rect.top + rect.height / 2);
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > maxDist) {
        dx = (dx / dist) * maxDist;
        dy = (dy / dist) * maxDist;
    }

    joyX = dx / maxDist;
    joyY = dy / maxDist;
    joyStick.style.transform = `translate(${dx}px, ${dy}px)`;
}

// Keyboard WASD / Arrow Keys Support
const keys = {};
window.addEventListener('keydown', e => {
    if (document.activeElement === usernameInput) return;
    keys[e.key.toLowerCase()] = true;
});
window.addEventListener('keyup', e => {
    keys[e.key.toLowerCase()] = false;
});

// --- 7. AVATAR & BACKGROUND DRAWING ---
function drawGrid() {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 2;
    const gridSize = 60;

    for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

function drawCharacter(p, isLocal) {
    const style = AVATARS[p.avatarId] || AVATARS[0];
    const x = p.x;
    const y = p.y;
    const swing = Math.sin(p.walkFrame) * 6;

    ctx.save();

    // 1. Ground Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y + 34, 24, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Cool Glowing Aura
    if (style.aura) {
        ctx.shadowColor = style.aura;
        ctx.shadowBlur = 18;
    }

    // 3. Legs (R6 Blocky Style with Walk Swing)
    ctx.fillStyle = style.legs;
    ctx.fillRect(x - 13, y + 10 + swing, 11, 22);
    ctx.fillRect(x + 2, y + 10 - swing, 11, 22);

    // 4. Arms
    ctx.fillStyle = style.head;
    ctx.fillRect(x - 24, y - 14 - swing, 9, 22);
    ctx.fillRect(x + 15, y - 14 + swing, 9, 22);

    // 5. Torso
    ctx.fillStyle = style.torso;
    ctx.fillRect(x - 14, y - 14, 28, 25);

    // 6. Head
    ctx.fillStyle = style.head;
    ctx.beginPath();
    ctx.roundRect(x - 12, y - 38, 24, 23, 5);
    ctx.fill();

    ctx.shadowBlur = 0; // Reset glow for face details

    // 7. Face / Eyes
    ctx.fillStyle = style.hat === 'visor' ? '#00ffff' : '#111';
    if (style.hat === 'visor') {
        ctx.fillRect(x - 10, y - 30, 20, 6);
    } else {
        ctx.fillRect(x - 6, y - 29, 3, 4);
        ctx.fillRect(x + 3, y - 29, 3, 4);
        ctx.beginPath();
        ctx.arc(x, y - 22, 4, 0.1 * Math.PI, 0.9 * Math.PI);
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    // 8. Hats & Accessories
    if (style.hat === 'bacon') {
        if (baconImg.complete && baconImg.naturalWidth > 0) {
            ctx.drawImage(baconImg, x - 20, y - 50, 40, 32);
        } else {
            ctx.fillStyle = '#8b4513';
            ctx.fillRect(x - 14, y - 42, 28, 9);
        }
    } else if (style.hat === 'crown') {
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath();
        ctx.moveTo(x - 13, y - 37);
        ctx.lineTo(x - 13, y - 48);
        ctx.lineTo(x - 5, y - 41);
        ctx.lineTo(x, y - 50);
        ctx.lineTo(x + 5, y - 41);
        ctx.lineTo(x + 13, y - 48);
        ctx.lineTo(x + 13, y - 37);
        ctx.closePath();
        ctx.fill();
    } else if (style.hat === 'horns') {
        ctx.fillStyle = '#ff3f34';
        ctx.beginPath();
        ctx.moveTo(x - 10, y - 36);
        ctx.lineTo(x - 20, y - 50);
        ctx.lineTo(x - 4, y - 38);
        ctx.moveTo(x + 10, y - 36);
        ctx.lineTo(x + 20, y - 50);
        ctx.lineTo(x + 4, y - 38);
        ctx.fill();
    } else if (style.hat === 'valk') {
        ctx.fillStyle = '#e056fd';
        ctx.beginPath();
        ctx.moveTo(x - 12, y - 35);
        ctx.lineTo(x - 26, y - 52);
        ctx.lineTo(x - 10, y - 42);
        ctx.moveTo(x + 12, y - 35);
        ctx.lineTo(x + 26, y - 52);
        ctx.lineTo(x + 10, y - 42);
        ctx.fill();
    }

    // 9. Username Tag Above Head
    ctx.font = 'bold 13px sans-serif';
    const label = p.username || 'Player';
    const textWidth = ctx.measureText(label).width;
    const tagPadding = 8;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.beginPath();
    ctx.roundRect(x - textWidth / 2 - tagPadding, y - 68, textWidth + tagPadding * 2, 20, 6);
    ctx.fill();

    ctx.fillStyle = isLocal ? '#00ff9d' : '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y - 54);

    ctx.restore();
}

// --- 8. MAIN GAME LOOP ---
function gameLoop() {
    // Combine Joystick + Keyboard input
    let moveX = joyX;
    let moveY = joyY;

    if (keys['w'] || keys['arrowup']) moveY = -1;
    if (keys['s'] || keys['arrowdown']) moveY = 1;
    if (keys['a'] || keys['arrowleft']) moveX = -1;
    if (keys['d'] || keys['arrowright']) moveX = 1;

    // Normalize diagonal keyboard speed
    if (!isDragging && moveX !== 0 && moveY !== 0) {
        moveX *= 0.7071;
        moveY *= 0.7071;
    }

    player.vx = moveX * player.speed;
    player.vy = moveY * player.speed;

    player.x += player.vx;
    player.y += player.vy;

    if (Math.abs(player.vx) > 0.1 || Math.abs(player.vy) > 0.1) {
        player.walkFrame += 0.22;
    } else {
        player.walkFrame = 0;
    }

    // Keep player inside screen bounds
    player.x = Math.max(player.width / 2, Math.min(canvas.width - player.width / 2, player.x));
    player.y = Math.max(player.height / 2 + 25, Math.min(canvas.height - player.height / 2, player.y));

    // Clear & Draw Background Grid
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid();

    // Draw Remote Players (with smooth interpolation)
    for (const id in otherPlayers) {
        const op = otherPlayers[id];
        op.x += (op.vx || 0) * 0.5;
        op.y += (op.vy || 0) * 0.5;
        drawCharacter(op, false);
    }

    // Draw Local Player
    drawCharacter(player, true);

    requestAnimationFrame(gameLoop);
}

// Start the game
gameLoop();
