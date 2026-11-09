// Personagens de paintball desenhados por código (sem nenhuma imagem externa).
// Cada cor de time vira uma "folha" com todas as poses, vistas de frente e de costas.
import { PALETTE } from './world.js';

export const FRAME_W = 128;
export const FRAME_H = 256;
export const GROUND_Y = 248; // linha do chão dentro do quadro (onde ficam as botas)
export const POSES = ['idle', 'walkA', 'walkB', 'shoot', 'hit', 'dead'];

const OUT = '#141a2c'; // contorno
const PANTS = '#2b3558';
const SKIN_GLOVE = '#1b2036';
const METAL = '#9aa7bd';

// ---------- utilidades de cor e forma ----------

function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const c = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
    return `rgb(${c((n >> 16) & 255)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
}

/** Gradiente horizontal: claro à esquerda, escuro à direita (luz vindo de cima-esquerda). */
function sideGradient(ctx, x0, x1, hex) {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, shade(hex, 1.22));
    g.addColorStop(0.45, shade(hex, 1.0));
    g.addColorStop(1, shade(hex, 0.7));
    return g;
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function paint(ctx, fill, lineWidth = 4) {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = OUT;
    ctx.stroke();
}

function splat(ctx, x, y, r, color) {
    ctx.fillStyle = color;
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2;
    const blobs = [[0, 0, r], [r * 0.9, -r * 0.4, r * 0.45], [-r * 0.8, r * 0.5, r * 0.4], [r * 0.2, r * 1.0, r * 0.3], [-r * 0.2, -r * 1.05, r * 0.28]];
    for (const [dx, dy, br] of blobs) {
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, br, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.25, 0, Math.PI * 2);
    ctx.fill();
}

// ---------- partes do corpo ----------

function leg(ctx, x, lift) {
    const top = 152;
    const bottom = GROUND_Y - lift;
    roundRect(ctx, x, top, 22, bottom - top - 10, 6);
    paint(ctx, sideGradient(ctx, x, x + 22, PANTS));
    // joelheira
    roundRect(ctx, x + 1, 192 - lift * 0.5, 20, 16, 5);
    paint(ctx, sideGradient(ctx, x, x + 22, '#1a2038'), 3);
    // bota
    roundRect(ctx, x - 4, bottom - 18, 30, 18, 6);
    paint(ctx, sideGradient(ctx, x - 4, x + 26, '#141a2c'));
}

function arm(ctx, color, x0, y0, x1, y1, width = 17) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = OUT;
    ctx.lineWidth = width + 6;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.strokeStyle = shade(color, 1.05);
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    // luva
    ctx.fillStyle = SKIN_GLOVE;
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x1, y1, width * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
}

function torso(ctx, color, view) {
    ctx.beginPath();
    ctx.moveTo(32, 68);
    ctx.quadraticCurveTo(64, 60, 96, 68);
    ctx.lineTo(90, 158);
    ctx.lineTo(38, 158);
    ctx.closePath();
    paint(ctx, sideGradient(ctx, 32, 96, color));

    // faixa do time
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fillRect(30, 100, 70, 11);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(30, 111, 70, 3);
    ctx.restore();

    if (view === 'front') {
        // colete: alças e cinto com cargas de bolinhas
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(44, 66); ctx.lineTo(50, 150);
        ctx.moveTo(84, 66); ctx.lineTo(78, 150);
        ctx.stroke();
        for (const px of [42, 74]) {
            roundRect(ctx, px, 138, 14, 22, 4);
            paint(ctx, sideGradient(ctx, px, px + 14, '#3a4468'), 3);
        }
    } else {
        // tanque de ar nas costas, com a cor do time
        roundRect(ctx, 50, 78, 28, 70, 12);
        paint(ctx, sideGradient(ctx, 50, 78, METAL));
        ctx.fillStyle = color;
        ctx.fillRect(50, 112, 28, 12);
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 3;
        ctx.strokeRect(50, 112, 28, 12);
        roundRect(ctx, 58, 68, 12, 14, 3);
        paint(ctx, '#d9b64a', 3);
    }
}

function head(ctx, color, view, tilt = 0) {
    ctx.save();
    ctx.translate(64, 52);
    ctx.rotate(tilt);
    ctx.translate(-64, -52);

    // pescoço
    roundRect(ctx, 54, 54, 20, 18, 5);
    paint(ctx, shade('#1c2338', 1.1), 3);

    // capacete
    ctx.beginPath();
    ctx.arc(64, 36, 29, 0, Math.PI * 2);
    paint(ctx, sideGradient(ctx, 35, 93, color));
    // faixa do capacete
    ctx.save();
    ctx.beginPath();
    ctx.arc(64, 36, 27, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(58, 0, 12, 40);
    ctx.restore();

    if (view === 'front') {
        // máscara: protetor do rosto + óculos
        roundRect(ctx, 41, 30, 46, 34, 14);
        paint(ctx, sideGradient(ctx, 41, 87, '#1c2338'));
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.lineWidth = 2;
        for (const vy of [50, 55, 60]) {
            ctx.beginPath();
            ctx.moveTo(50, vy);
            ctx.lineTo(78, vy);
            ctx.stroke();
        }
        // lente
        roundRect(ctx, 38, 20, 52, 24, 11);
        const lens = ctx.createLinearGradient(38, 20, 90, 44);
        lens.addColorStop(0, '#79e6ff');
        lens.addColorStop(0.55, '#1b8fc4');
        lens.addColorStop(1, '#0c3f66');
        paint(ctx, lens);
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(48, 36); ctx.lineTo(60, 25);
        ctx.stroke();
    } else {
        // costas do capacete: tiras
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(40, 40); ctx.lineTo(88, 40);
        ctx.moveTo(44, 54); ctx.lineTo(84, 54);
        ctx.stroke();
    }
    ctx.restore();
}

function marker(ctx, x, y, angle, hopperColor, length = 66) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    roundRect(ctx, -length / 2, -7, length, 14, 5);
    paint(ctx, sideGradient(ctx, -length / 2, length / 2, '#4b556e'), 3);
    // cano
    roundRect(ctx, length / 2 - 4, -4, 22, 8, 3);
    paint(ctx, '#222a3f', 2);
    // depósito de bolinhas (hopper)
    roundRect(ctx, -8, -22, 20, 17, 6);
    paint(ctx, shade(hopperColor, 1.1), 3);
    ctx.restore();
}

function muzzleFlash(ctx, x, y) {
    const g = ctx.createRadialGradient(x, y, 2, x, y, 34);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,224,90,0.95)');
    g.addColorStop(1, 'rgba(255,160,30,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const r = i % 2 === 0 ? 34 : 15;
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
}

// ---------- um personagem completo ----------

/**
 * Desenha um personagem em (0, 0) .. (FRAME_W, FRAME_H).
 * @param {string} color cor do time (hex)
 * @param {'front'|'back'} view
 * @param {'idle'|'walkA'|'walkB'|'shoot'|'hit'|'dead'} pose
 */
function drawCharacter(ctx, color, view, pose) {
    ctx.save();
    ctx.lineJoin = 'round';

    // pernas (alternam ao andar)
    let liftL = 0;
    let liftR = 0;
    if (pose === 'walkA') { liftL = 12; liftR = 0; }
    if (pose === 'walkB') { liftL = 0; liftR = 12; }
    const crouch = pose === 'dead' ? 6 : 0;
    if (pose === 'hit') {
        ctx.translate(64, GROUND_Y);
        ctx.rotate(-0.07);
        ctx.translate(-64, -GROUND_Y);
    }
    ctx.translate(0, crouch);

    leg(ctx, 40, liftL);
    leg(ctx, 66, liftR);

    // braço de trás do corpo (em vista de costas, desenha-se por cima do tanque)
    const swing = pose === 'walkA' ? 10 : pose === 'walkB' ? -10 : 0;

    if (view === 'front') {
        torso(ctx, color, 'front');
        head(ctx, color, 'front', pose === 'hit' ? 0.12 : 0);

        if (pose === 'dead') {
            // mãos para cima, marcador erguido: "estou fora!"
            arm(ctx, color, 38, 76, 30, 28);
            arm(ctx, color, 90, 76, 98, 28);
            marker(ctx, 64, 16, 0, color, 74);
        } else if (pose === 'shoot') {
            // marcador apontado para quem olha: cano de frente + clarão
            arm(ctx, color, 38, 78, 56, 112);
            arm(ctx, color, 90, 78, 72, 112);
            ctx.save();
            roundRect(ctx, 50, 90, 28, 26, 8);
            paint(ctx, sideGradient(ctx, 50, 78, '#4b556e'), 3);
            ctx.beginPath();
            ctx.arc(64, 106, 9, 0, Math.PI * 2);
            paint(ctx, '#0b0f1c', 3);
            roundRect(ctx, 54, 70, 20, 22, 7);
            paint(ctx, shade(color, 1.1), 3);
            ctx.restore();
            muzzleFlash(ctx, 64, 106);
        } else {
            // posição de patrulha: marcador cruzado no peito
            arm(ctx, color, 38, 78, 30, 124 + swing * 0.5);
            arm(ctx, color, 90, 78, 70, 116);
            marker(ctx, 62, 112, -0.38, color);
        }
        if (pose === 'hit' || pose === 'dead') splat(ctx, 66, 126, 11, pose === 'hit' ? '#c6ff00' : '#ff4fa3');
    } else {
        // vista de costas
        arm(ctx, color, 38, 78, 30, 126 + swing);
        arm(ctx, color, 90, 78, 98, 126 - swing);
        torso(ctx, color, 'back');
        head(ctx, color, 'back', pose === 'hit' ? 0.12 : 0);
        if (pose === 'dead') {
            arm(ctx, color, 38, 76, 30, 28);
            arm(ctx, color, 90, 76, 98, 28);
            marker(ctx, 64, 16, 0, color, 74);
        }
        if (pose === 'hit' || pose === 'dead') splat(ctx, 70, 104, 10, pose === 'hit' ? '#c6ff00' : '#ff4fa3');
    }
    ctx.restore();
}

/**
 * Cria a folha de sprites de uma cor: 6 poses (colunas) x 2 vistas (linhas: frente e costas).
 * @returns {HTMLCanvasElement}
 */
export function buildCharacterSheet(color) {
    const c = document.createElement('canvas');
    c.width = FRAME_W * POSES.length;
    c.height = FRAME_H * 2;
    const ctx = c.getContext('2d');
    ['front', 'back'].forEach((view, row) => {
        POSES.forEach((pose, col) => {
            ctx.save();
            ctx.translate(col * FRAME_W, row * FRAME_H);
            ctx.beginPath();
            ctx.rect(0, 0, FRAME_W, FRAME_H);
            ctx.clip();
            drawCharacter(ctx, color, view, pose);
            ctx.restore();
        });
    });
    return c;
}

/** Folhas para todas as cores da paleta (e a do jogador, que é amarela). Chave = cor em hex. */
export function buildAllSheets() {
    const sheets = new Map();
    for (const { base } of PALETTE) sheets.set(base, buildCharacterSheet(base));
    return sheets;
}


// ---------- Arma do jogador (aparece no canto direito da tela, como em qualquer FPS) ----------

export const WEAPON_W = 900;
export const WEAPON_H = 700;
export const WEAPON_TIP = { x: 90, y: 90 }; // onde fica a boca do cano dentro da imagem
export const WEAPON_ANGLE = 0.62; // inclinação do cano (radianos, de cima-esquerda para baixo-direita)

/** O marcador de paintball visto por trás e pela direita, com o antebraço do jogador. */
export function buildWeaponSprite(color = '#ffd60a') {
    const c = document.createElement('canvas');
    c.width = WEAPON_W;
    c.height = WEAPON_H;
    const ctx = c.getContext('2d');
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.translate(WEAPON_TIP.x, WEAPON_TIP.y);
    ctx.rotate(WEAPON_ANGLE);

    // antebraço (manga na cor do time, com faixa branca), sai pelo canto da tela
    const arm = (width, style) => {
        ctx.strokeStyle = style;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(250, 76);
        ctx.lineTo(1300, 190);
        ctx.stroke();
    };
    arm(132, OUT);
    const sleeve = ctx.createLinearGradient(0, 30, 0, 150);
    sleeve.addColorStop(0, shade(color, 1.25));
    sleeve.addColorStop(0.55, color);
    sleeve.addColorStop(1, shade(color, 0.72));
    arm(120, sleeve);
    ctx.setLineDash([24, 1000]);
    ctx.lineDashOffset = -190;
    arm(120, 'rgba(255,255,255,0.92)'); // faixa branca na manga
    ctx.setLineDash([]);

    // cabo (empunhadura)
    roundRect(ctx, 196, 30, 66, 112, 16);
    paint(ctx, sideGradient(ctx, 196, 262, '#2b3248'), 5);

    // corpo do marcador
    roundRect(ctx, 96, -44, 210, 98, 22);
    paint(ctx, sideGradient(ctx, 96, 306, '#56617d'), 5);
    ctx.save();
    roundRect(ctx, 96, -44, 210, 98, 22);
    ctx.clip();
    ctx.fillStyle = color; // faixa de destaque
    ctx.fillRect(96, -8, 210, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(96, -44, 210, 14);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(96, 34, 210, 20);
    ctx.restore();

    // cano com a boca na ponta
    roundRect(ctx, 0, -12, 130, 24, 10);
    paint(ctx, (() => {
        const g = ctx.createLinearGradient(0, -12, 0, 12);
        g.addColorStop(0, '#8b95ad');
        g.addColorStop(1, '#2a3148');
        return g;
    })(), 5);
    roundRect(ctx, -12, -19, 46, 38, 12);
    paint(ctx, '#1b2036', 5);
    ctx.fillStyle = '#0b0f1c';
    ctx.beginPath();
    ctx.ellipse(-4, 0, 6, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    // depósito de bolinhas (hopper): bolinhas coloridas dentro de uma caixa translúcida
    const balls = ['#ff7a1a', '#1f7bff', '#e53a3a', '#2fc45a', '#ffd60a', '#19c3e6', '#ff4fa3', '#f2f2f2'];
    balls.forEach((b, i) => {
        const bx = 150 + (i % 4) * 25;
        const by = -92 + Math.floor(i / 4) * 27;
        ctx.fillStyle = b;
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(bx, by, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath();
        ctx.arc(bx - 4, by - 5, 4, 0, Math.PI * 2);
        ctx.fill();
    });
    roundRect(ctx, 128, -116, 118, 80, 18);
    ctx.fillStyle = 'rgba(160, 220, 255, 0.28)';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = OUT;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(142, -102);
    ctx.lineTo(142, -58);
    ctx.stroke();
    roundRect(ctx, 160, -42, 62, 16, 6); // base do depósito
    paint(ctx, '#2b3248', 4);

    // luva segurando o cabo
    roundRect(ctx, 176, 22, 116, 112, 38);
    paint(ctx, sideGradient(ctx, 176, 292, SKIN_GLOVE), 5);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 4;
    for (const fx of [206, 234, 262]) {
        ctx.beginPath();
        ctx.moveTo(fx, 40);
        ctx.lineTo(fx, 100);
        ctx.stroke();
    }
    return c;
}
