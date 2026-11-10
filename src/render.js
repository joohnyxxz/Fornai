// Renderização 3D "estilo Doom": céu, chão em perspectiva, paredes do campo (raycasting),
// parede da tempestade.
import { CONFIG } from './config.js';
import { PALETTE, TEXTURE_VARIANTS } from './world.js';
import { raycast } from './physics.js';
import { createRng } from './rng.js';
import { angleDiff } from './util.js';
import {
    buildAllSheets, buildWeaponSprite, FRAME_W, FRAME_H, GROUND_Y, POSES,
    WEAPON_W, WEAPON_H, WEAPON_TIP, WEAPON_ANGLE,
} from './sprites.js';

// Paleta "dia ensolarado" (estética dos primeiros capítulos)
const SKY_TOP = [38, 142, 255];
const SKY_HORIZON = [208, 236, 255];
const FOG = SKY_HORIZON;
const GRASS = [[116, 204, 44], [94, 180, 36], [142, 224, 62]];
const SAND = [238, 214, 140];
const WATER = [46, 128, 214];
const STORM = [126, 52, 226];
const STORM_GLOW = [236, 170, 255];

const WALL_STEP = 2; // largura (px) de cada coluna da parede da tempestade

function hash2(ix, iy) {
    let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function rgb(c) {
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

// ---------- Paredes do campo: texturas de inflável geradas por código ----------

const TEX_W = 256;
const TEX_H = 128;
const TEX_SS = 2; // a textura é desenhada em 2x a resolução (bordas e respingos nítidos de perto)
const TEX_WORLD = 90; // unidades do mundo cobertas pela largura da textura (um "painel" inflado)
const LIGHT = [-0.6, -0.8]; // direção de onde vem a luz (no plano do mapa)

function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixHex(hex, other, t) {
    const a = hexToRgb(hex);
    const b = hexToRgb(other);
    const m = (i) => Math.round(a[i] + (b[i] - a[i]) * t);
    return `rgb(${m(0)}, ${m(1)}, ${m(2)})`;
}

// Mancha de tinta: círculo central e gotas ao redor, com sombra e um brilho
function splat(ctx, x, y, r, color, seed) {
    const rng = createRng(seed);
    const drops = 5 + Math.floor(rng() * 5);
    const parts = [[x, y, r]];
    for (let i = 0; i < drops; i++) {
        const ang = rng() * Math.PI * 2;
        const dist = r * (0.9 + rng() * 1.3);
        parts.push([x + Math.cos(ang) * dist, y + Math.sin(ang) * dist, r * (0.12 + rng() * 0.28)]);
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    for (const [px, py, pr] of parts) {
        ctx.beginPath();
        ctx.arc(px + 1.2, py + 1.6, pr + 1, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.fillStyle = color;
    for (const [px, py, pr] of parts) {
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
}

/** Textura de um bunker inflável: gomos, costuras, faixa de destaque e respingos de tinta. */
function buildBunkerTexture(colorIndex, variant) {
    const { base, accent } = PALETTE[colorIndex];
    const c = document.createElement('canvas');
    c.width = TEX_W * TEX_SS;
    c.height = TEX_H * TEX_SS;
    const ctx = c.getContext('2d');
    ctx.scale(TEX_SS, TEX_SS); // o código abaixo continua usando coordenadas de 256x128
    const rng = createRng(colorIndex * 977 + variant * 131 + 7);

    // base: mais clara em cima, mais escura embaixo
    const g = ctx.createLinearGradient(0, 0, 0, TEX_H);
    g.addColorStop(0, mixHex(base, '#ffffff', 0.2));
    g.addColorStop(0.5, base);
    g.addColorStop(1, mixHex(base, '#000000', 0.3));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, TEX_W, TEX_H);

    // dois gomos inflados por textura: luz no meio, sombra nas costuras
    for (let panel = 0; panel < 2; panel++) {
        const x0 = (panel * TEX_W) / 2;
        const gx = ctx.createLinearGradient(x0, 0, x0 + TEX_W / 2, 0);
        gx.addColorStop(0, 'rgba(0, 0, 0, 0.34)');
        gx.addColorStop(0.2, 'rgba(0, 0, 0, 0)');
        gx.addColorStop(0.5, 'rgba(255, 255, 255, 0.22)');
        gx.addColorStop(0.8, 'rgba(0, 0, 0, 0)');
        gx.addColorStop(1, 'rgba(0, 0, 0, 0.34)');
        ctx.fillStyle = gx;
        ctx.fillRect(x0, 0, TEX_W / 2, TEX_H);
    }

    // faixa de destaque (uma cor contrastante) no meio da altura
    ctx.fillStyle = accent;
    ctx.fillRect(0, TEX_H * 0.58, TEX_W, TEX_H * 0.13);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(0, TEX_H * 0.58, TEX_W, 2);
    ctx.fillRect(0, TEX_H * 0.71 - 2, TEX_W, 2);

    // respingos de tinta (também deslocados de um lado a outro, para a textura repetir sem emenda)
    const colors = PALETTE.map((p) => p.base).filter((b) => b !== base);
    const splats = 9 + Math.floor(rng() * 4);
    for (let i = 0; i < splats; i++) {
        const sx = rng() * TEX_W;
        const sy = TEX_H * (0.08 + rng() * 0.72);
        const sr = 3 + rng() * 9;
        const color = colors[Math.floor(rng() * colors.length)];
        const seed = Math.floor(rng() * 1e9);
        for (const dx of [-TEX_W, 0, TEX_W]) splat(ctx, sx + dx, sy, sr, color, seed);
    }

    // costuras entre os gomos
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    for (const x of [0, TEX_W / 2]) ctx.fillRect(x - 2, 0, 4, TEX_H);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    for (const x of [0, TEX_W / 2]) ctx.fillRect(x + 2, 0, 1.5, TEX_H);

    // sombra de contato na base (oclusão ambiente) e bainha no topo
    const ao = ctx.createLinearGradient(0, TEX_H * 0.72, 0, TEX_H);
    ao.addColorStop(0, 'rgba(10, 20, 5, 0)');
    ao.addColorStop(1, 'rgba(10, 20, 5, 0.55)');
    ctx.fillStyle = ao;
    ctx.fillRect(0, TEX_H * 0.72, TEX_W, TEX_H * 0.28);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.fillRect(0, 0, TEX_W, 3);

    return c;
}

function buildBunkerTextures() {
    return PALETTE.map((_, ci) => Array.from({ length: TEXTURE_VARIANTS }, (_v, v) => buildBunkerTexture(ci, v)));
}

// ---------- Textura do chão (assets/ground/grass.jpg) ----------

const GROUND_TILE = 320; // tamanho, em unidades do mundo, de uma repetição da textura

/**
 * Carrega a textura de grama e gera versões menores (mipmaps) para evitar serrilhado ao longe.
 * Devolve null se falhar (o chão cai para uma grama lisa).
 */
export async function loadGround() {
    try {
        const img = await new Promise((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = reject;
            i.src = 'assets/ground/grass.jpg';
        });
        const mips = [];
        let size = img.width;
        let source = img;
        while (size >= 8) {
            const c = document.createElement('canvas');
            c.width = size;
            c.height = size;
            const cx = c.getContext('2d', { willReadFrequently: true });
            cx.imageSmoothingQuality = 'high';
            cx.drawImage(source, 0, 0, size, size);
            mips.push({ size, data: cx.getImageData(0, 0, size, size).data });
            source = c;
            size >>= 1;
        }
        return mips;
    } catch {
        console.warn('Textura do chão não carregou: usando grama lisa');
        return null;
    }
}

// Ruído suave (interpolado) para variar o tom da grama sem "quadrados"
function smoothNoise(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const a = hash2(ix, iy);
    const b = hash2(ix + 1, iy);
    const c = hash2(ix, iy + 1);
    const d = hash2(ix + 1, iy + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}


// ---------- Renderizador ----------

export class Renderer {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {{size:number,data:Uint8ClampedArray}[]|null} ground mipmaps de loadGround() (ou null)
     */
    constructor(canvas, ground = null) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.ground = ground;
        this.textures = buildBunkerTextures();
        this.sheets = buildAllSheets(); // personagens de cada cor
        this.weapon = buildWeaponSprite(); // a arma do jogador, no canto da tela
        this.wp = { bob: 0, swayX: 0, swayY: 0, lastX: 0, lastY: 0, lastRot: 0, lastPitch: 0 };
        this.scratch = document.createElement('canvas'); // folha temporária para tingir um personagem
        this.scratch.width = FRAME_W;
        this.scratch.height = FRAME_H;
        this.floorCanvas = document.createElement('canvas');
        this.floorCtx = this.floorCanvas.getContext('2d');
        this.wallZ = [];
        this.clouds = Array.from({ length: 14 }, (_, i) => ({
            angle: (i / 14) * Math.PI * 2 + (hash2(i, 7) - 0.5) * 0.4,
            y: 0.12 + hash2(i, 3) * 0.55,
            size: 0.7 + hash2(i, 5) * 0.9,
        }));
        this.resize(canvas.width || window.innerWidth, canvas.height || window.innerHeight);
    }

    resize(width, height) {
        // Proteção: em janelas ainda sem tamanho (0), usa um mínimo para não quebrar
        width = Math.max(320, Math.floor(width) || 0);
        height = Math.max(240, Math.floor(height) || 0);
        this.canvas.width = width;
        this.canvas.height = height;
        this.w = width;
        this.h = height;
        this.f = (width / 2) / Math.tan(CONFIG.FOV / 2);
        // Olhar para cima/baixo move o horizonte (o "deslocamento" nunca passa de 42% da altura)
        this.maxShift = Math.round(height * 0.42);
        this.horizon = Math.round(height / 2);

        // O chão é calculado em resolução reduzida (mais rápido) e depois esticado
        // (1 pixel por pixel até ~1000px de largura; 2x em telas maiores)
        this.floorScale = Math.max(1, Math.ceil(width / 1000));
        this.floorW = Math.ceil(width / this.floorScale);
        // o buffer cabe o chão mais alto possível (horizonte no ponto mais alto); a cada quadro usa-se só a parte necessária
        this.floorMaxH = Math.ceil((height / 2 + this.maxShift) / this.floorScale);
        this.floorH = Math.ceil((height - this.horizon) / this.floorScale);
        this.floorCanvas.width = this.floorW;
        this.floorCanvas.height = this.floorMaxH;
        this.floorImage = this.floorCtx.createImageData(this.floorW, this.floorMaxH);
        this.cols = Math.ceil(width / WALL_STEP);
        this.wallZ = new Array(this.cols).fill(Infinity); // profundidade da parede da tempestade
        this.depth = new Float32Array(this.cols).fill(Infinity); // profundidade das paredes do campo
        this.wallTop = new Float32Array(this.cols).fill(0); // altura (px) do topo da parede do campo
    }

    render({ player, zone, world, time, bots = [], balls = [], decals = [] }) {
        const { ctx } = this;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Inclinação vertical da câmera: desloca o horizonte (técnica clássica de "y-shearing")
        const shift = Math.max(-this.maxShift, Math.min(this.maxShift, this.f * Math.tan(player.pitch || 0)));
        this.horizon = Math.round(this.h / 2 + shift);
        this.floorH = Math.max(1, Math.ceil((this.h - this.horizon) / this.floorScale));

        this._drawSky(player, time);
        this._drawFloor(player, zone, time);
        this._drawObstacles(player, world);
        this._computeWall(player, zone);
        this._drawWall(time);
        this._drawEntities(player, { bots, balls, decals });
        if (player.alive !== false) this._drawWeapon(player, time);
    }

    // ----- céu -----
    _drawSky(player, time) {
        const { ctx, w, horizon } = this;
        const g = ctx.createLinearGradient(0, 0, 0, horizon);
        g.addColorStop(0, rgb(SKY_TOP));
        g.addColorStop(1, rgb(SKY_HORIZON));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, horizon);

        const pxPerRad = w / CONFIG.FOV;
        for (const cloud of this.clouds) {
            let diff = cloud.angle + time * 0.012 - player.rotation;
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));
            const x = w / 2 + diff * pxPerRad;
            const y = cloud.y * horizon;
            const s = cloud.size * (w / 9);
            if (x < -s * 2 || x > w + s * 2) continue;
            ctx.fillStyle = 'rgba(255,255,255,0.92)';
            ctx.beginPath();
            ctx.ellipse(x, y, s, s * 0.28, 0, 0, Math.PI * 2);
            ctx.ellipse(x - s * 0.55, y + s * 0.06, s * 0.55, s * 0.22, 0, 0, Math.PI * 2);
            ctx.ellipse(x + s * 0.6, y + s * 0.05, s * 0.6, s * 0.24, 0, 0, Math.PI * 2);
            ctx.ellipse(x + s * 0.05, y - s * 0.16, s * 0.5, s * 0.22, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(170,205,245,0.55)';
            ctx.beginPath();
            ctx.ellipse(x, y + s * 0.18, s * 0.95, s * 0.1, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ----- chão (projeção em perspectiva, pixel a pixel) -----
    _drawFloor(player, zone, time) {
        const { floorW, floorH, floorScale: scale, f, w } = this;
        const data = this.floorImage.data;
        const cosR = Math.cos(player.rotation);
        const sinR = Math.sin(player.rotation);
        const cam = CONFIG.CAMERA_HEIGHT * f;
        const map = CONFIG.MAP_SIZE;
        const zc = zone.current;
        const ground = this.ground;
        let i = 0;

        for (let row = 0; row < floorH; row++) {
            const z = cam / ((row + 0.5) * scale);
            const fog = Math.min(1, Math.pow(z / CONFIG.FOG_DISTANCE, 1.6));
            const bx = player.x + cosR * z;
            const by = player.y + sinR * z;
            const latStep = (scale / f) * z;
            let lat = ((0.5 * scale - w / 2) / f) * z;

            // Escolhe o nível de detalhe (mipmap) pelo tamanho de um pixel da tela no chão:
            // longe, vários texels cabem num pixel, então usa-se uma versão menor (sem serrilhado)
            let tex = null;
            let texK = 0;
            let texMask = 0;
            if (ground) {
                const footprint = Math.max((z * scale) / f, (z * z * scale) / cam) * (ground[0].size / GROUND_TILE);
                const level = Math.min(ground.length - 1, Math.max(0, Math.round(Math.log2(Math.max(1, footprint)))));
                tex = ground[level];
                texK = tex.size / GROUND_TILE;
                texMask = tex.size - 1;
            }

            for (let col = 0; col < floorW; col++) {
                const wx = bx - sinR * lat;
                const wy = by + cosR * lat;
                lat += latStep;

                let r, g, b;
                const edge = Math.min(wx, wy, map - wx, map - wy);
                if (edge < 0) {
                    const k = (Math.floor((wx + wy) / 70 + time * 0.8) & 1) ? 1.07 : 1;
                    r = WATER[0] * k; g = WATER[1] * k; b = WATER[2] * k;
                } else if (edge < 70) {
                    const k = 0.95 + hash2(Math.floor(wx / 30), Math.floor(wy / 30)) * 0.1;
                    r = SAND[0] * k; g = SAND[1] * k; b = SAND[2] * k;
                } else if (tex) {
                    // Textura real de grama (interpolação bilinear, com repetição)
                    const u = wx * texK - 0.5;
                    const v = wy * texK - 0.5;
                    const x0 = Math.floor(u);
                    const y0 = Math.floor(v);
                    const fx = u - x0;
                    const fy = v - y0;
                    const xa = x0 & texMask;
                    const xb = (x0 + 1) & texMask;
                    const ya = (y0 & texMask) * tex.size;
                    const yb = ((y0 + 1) & texMask) * tex.size;
                    const i00 = (ya + xa) * 4;
                    const i10 = (ya + xb) * 4;
                    const i01 = (yb + xa) * 4;
                    const i11 = (yb + xb) * 4;
                    const w00 = (1 - fx) * (1 - fy);
                    const w10 = fx * (1 - fy);
                    const w01 = (1 - fx) * fy;
                    const w11 = fx * fy;
                    const td = tex.data;
                    // Variação de tom em larga escala: esconde a repetição da textura
                    const macro = 0.84 + smoothNoise(wx / 650, wy / 650) * 0.32;
                    r = (td[i00] * w00 + td[i10] * w10 + td[i01] * w01 + td[i11] * w11) * macro;
                    g = (td[i00 + 1] * w00 + td[i10 + 1] * w10 + td[i01 + 1] * w01 + td[i11 + 1] * w11) * macro;
                    b = (td[i00 + 2] * w00 + td[i10 + 2] * w10 + td[i01 + 2] * w01 + td[i11 + 2] * w11) * macro;
                } else {
                    // Sem textura (falha ao carregar): grama lisa com tom suave
                    const n = smoothNoise(wx / 260, wy / 260);
                    const lo = n < 0.5 ? GRASS[1] : GRASS[0];
                    const hi = n < 0.5 ? GRASS[0] : GRASS[2];
                    const t = n < 0.5 ? n * 2 : (n - 0.5) * 2;
                    // Xadrez sutil, que some com a distância (evita serrilhado/moiré)
                    const checker = ((Math.floor(wx / 60) + Math.floor(wy / 60)) & 1) ? 1 : 0.94;
                    const k = 1 - (1 - checker) * (1 - fog);
                    r = (lo[0] + (hi[0] - lo[0]) * t) * k;
                    g = (lo[1] + (hi[1] - lo[1]) * t) * k;
                    b = (lo[2] + (hi[2] - lo[2]) * t) * k;
                }

                // Fora da zona segura: chão tingido de roxo; borda com brilho
                const dx = wx - zc.x;
                const dy = wy - zc.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > zc.r) {
                    r = r * 0.45 + STORM[0] * 0.55;
                    g = g * 0.45 + STORM[1] * 0.55;
                    b = b * 0.45 + STORM[2] * 0.55;
                }
                const nearEdge = Math.abs(dist - zc.r);
                if (nearEdge < 14) {
                    const k = 1 - nearEdge / 14;
                    r += (STORM_GLOW[0] - r) * k * 0.85;
                    g += (STORM_GLOW[1] - g) * k * 0.85;
                    b += (STORM_GLOW[2] - b) * k * 0.85;
                }

                // Neblina de distância
                data[i++] = r + (FOG[0] - r) * fog;
                data[i++] = g + (FOG[1] - g) * fog;
                data[i++] = b + (FOG[2] - b) * fog;
                data[i++] = 255;
            }
        }

        this.floorCtx.putImageData(this.floorImage, 0, 0, 0, 0, floorW, floorH);
        this.ctx.drawImage(
            this.floorCanvas, 0, 0, floorW, floorH,
            0, this.horizon, floorW * scale, floorH * scale
        );
    }

    // ----- parede da tempestade -----
    _computeWall(player, zone) {
        const { f, w } = this;
        const zc = zone.current;
        const ocx = player.x - zc.x;
        const ocy = player.y - zc.y;
        const cc = ocx * ocx + ocy * ocy - zc.r * zc.r;

        for (let c = 0; c < this.wallZ.length; c++) {
            const sx = c * WALL_STEP + WALL_STEP / 2;
            const a = Math.atan((sx - w / 2) / f);
            const ang = player.rotation + a;
            const dx = Math.cos(ang);
            const dy = Math.sin(ang);
            const b = ocx * dx + ocy * dy;
            const disc = b * b - cc;
            let depth = Infinity;
            if (disc >= 0) {
                const root = Math.sqrt(disc);
                const t1 = -b - root;
                const t2 = -b + root;
                const t = t1 > 1 ? t1 : t2 > 1 ? t2 : Infinity;
                if (t < 4500) depth = t * Math.cos(a);
            }
            this.wallZ[c] = depth;
        }
    }

    _drawWall(time) {
        const { ctx, f, horizon } = this;
        const camF = CONFIG.CAMERA_HEIGHT * f;
        for (let c = 0; c < this.wallZ.length; c++) {
            const z = this.wallZ[c];
            if (!isFinite(z) || z < 1) continue;
            const bottom = horizon + camF / z;
            const top = Math.max(0, bottom - (CONFIG.STORM_WALL_HEIGHT * f) / z);
            // Se uma parede do campo está na frente, a tempestade só aparece ACIMA do topo dela
            const covered = this.depth[c] < z;
            const visibleBottom = covered ? Math.min(bottom, this.wallTop[c]) : bottom;
            if (visibleBottom <= top) continue;
            const x = c * WALL_STEP;
            const fade = 1 - Math.min(1, z / 4500) * 0.55;
            const shimmer = 0.5 + 0.12 * Math.sin(time * 2.2 + c * 0.18);

            const g = ctx.createLinearGradient(0, top, 0, bottom);
            g.addColorStop(0, `rgba(${STORM[0]}, ${STORM[1]}, ${STORM[2]}, ${0.18 * fade})`);
            g.addColorStop(1, `rgba(${STORM[0]}, ${STORM[1]}, ${STORM[2]}, ${shimmer * fade})`);
            ctx.fillStyle = g;
            ctx.fillRect(x, top, WALL_STEP, visibleBottom - top);

            if (!covered) {
                ctx.fillStyle = `rgba(${STORM_GLOW[0]}, ${STORM_GLOW[1]}, ${STORM_GLOW[2]}, ${0.85 * fade})`;
                ctx.fillRect(x, bottom - Math.max(2, 40 / z * f * 0.1), WALL_STEP, Math.max(2, 40 / z * f * 0.1));
            }
        }
    }

    // ----- paredes do campo (raycasting): uma coluna da tela por raio -----
    _drawObstacles(player, world) {
        const { ctx, f, w, horizon, cols } = this;
        const camF = CONFIG.CAMERA_HEIGHT * f;
        const maxDist = CONFIG.FOG_DISTANCE * 1.25;
        let prevObj = null;
        let prevNx = 0;
        let prevNy = 0;

        for (let c = 0; c < cols; c++) {
            const sx = c * WALL_STEP + WALL_STEP / 2;
            const a = Math.atan((sx - w / 2) / f);
            const hit = raycast(world, player.x, player.y, player.rotation + a, maxDist);
            if (!hit) {
                this.depth[c] = Infinity;
                prevObj = null;
                continue;
            }

            // z = distância perpendicular à tela (evita o efeito "olho de peixe")
            const z = Math.max(6, hit.dist * Math.cos(a));
            this.depth[c] = z;
            const obj = hit.obj;
            const x = c * WALL_STEP;
            const bottom = horizon + camF / z;
            const top = bottom - (obj.height * f) / z;
            const height = bottom - top;
            this.wallTop[c] = top;

            // textura: pega a "fatia" de pixels correspondente a esta coluna
            // (várias fatias viram uma só ao longe, para não cintilar)
            const tex = this.textures[obj.color][obj.variant];
            const texelsPerCol = ((WALL_STEP * z) / f) * (TEX_W / TEX_WORLD);
            const srcW = Math.min(24, Math.max(1, texelsPerCol));
            let u = ((((hit.u / TEX_WORLD) % 1) + 1) % 1) * TEX_W;
            if (u + srcW > TEX_W) u = TEX_W - srcW;
            ctx.drawImage(tex, u * TEX_SS, 0, srcW * TEX_SS, TEX_H * TEX_SS, x, top, WALL_STEP, height);

            // luz: faces viradas para a luz ficam mais claras
            const facing = hit.nx * LIGHT[0] + hit.ny * LIGHT[1];
            const dark = 0.38 * (1 - (0.5 + 0.5 * facing));
            if (dark > 0.01) {
                ctx.fillStyle = `rgba(8, 14, 34, ${dark})`;
                ctx.fillRect(x, top, WALL_STEP, height);
            }

            // quinas: linha escura onde muda de objeto ou de face
            if (prevObj !== obj || Math.abs(hit.nx - prevNx) + Math.abs(hit.ny - prevNy) > 0.05) {
                ctx.fillStyle = 'rgba(8, 14, 34, 0.55)';
                ctx.fillRect(x, top, 1, height);
            }
            prevObj = obj;
            prevNx = hit.nx;
            prevNy = hit.ny;

            // neblina de distância (mesma do chão, para o pé da parede se misturar com a grama)
            const fog = Math.min(1, Math.pow(z / CONFIG.FOG_DISTANCE, 1.6)) * 0.97;
            if (fog > 0.01) {
                ctx.fillStyle = `rgba(${FOG[0]}, ${FOG[1]}, ${FOG[2]}, ${fog})`;
                ctx.fillRect(x, top, WALL_STEP, height);
            }
        }
    }

    // ----- jogadores, bolinhas de tinta e respingos (desenhados por distância, de longe para perto) -----
    _drawEntities(player, { bots, balls, decals }) {
        const { f, w, horizon } = this;
        const cosR = Math.cos(player.rotation);
        const sinR = Math.sin(player.rotation);
        const camF = CONFIG.CAMERA_HEIGHT * f;
        const maxZ = CONFIG.FOG_DISTANCE * 1.25;
        const list = [];

        const project = (x, y) => {
            const dx = x - player.x;
            const dy = y - player.y;
            const z = dx * cosR + dy * sinR;
            if (z < 8 || z > maxZ) return null;
            return { z, sx: w / 2 + ((-dx * sinR + dy * cosR) / z) * f };
        };

        for (const b of bots) {
            if (!b.alive && b.deadTimer > CONFIG.MATCH.deadLinger) continue;
            const p = project(b.x, b.y);
            if (p) list.push({ kind: 'bot', ref: b, ...p });
        }
        for (const ball of balls) {
            const p = project(ball.x, ball.y);
            if (p) list.push({ kind: 'ball', ref: ball, ...p });
        }
        for (const d of decals) {
            const p = project(d.x, d.y);
            if (p) list.push({ kind: 'decal', ref: d, ...p });
        }
        list.sort((a, b) => b.z - a.z);

        for (const item of list) {
            const fog = Math.min(1, Math.pow(item.z / CONFIG.FOG_DISTANCE, 1.6)) * 0.97;
            if (item.kind === 'bot') this._drawBot(player, item, fog, camF, horizon);
            else if (item.kind === 'ball') this._drawBall(item, fog, camF, horizon);
            else this._drawDecal(item, fog, camF, horizon);
        }
    }

    /** A coluna `col` da tela está livre (sem parede do campo na frente) para algo a distância z? */
    _columnOpen(col, z, tolerance = 0) {
        const c = Math.max(0, Math.min(this.cols - 1, col));
        return this.depth[c] >= z - tolerance;
    }

    _drawBot(player, item, fog, camF, horizon) {
        const { ctx, f } = this;
        const bot = item.ref;
        const sheet = this.sheets.get(bot.color);
        if (!sheet) return;

        const z = item.z;
        const hPx = (CONFIG.COMBAT.entityHeight * f) / z;
        const wPx = hPx * (FRAME_W / FRAME_H);
        const x = item.sx - wPx / 2;
        const bottom = horizon + camF / z;
        const y = bottom - hPx * (GROUND_Y / FRAME_H);
        if (x + wPx < 0 || x > this.w) return;

        // qual pose e qual lado (frente ou costas) a câmera enxerga
        let pose = 'idle';
        if (!bot.alive) pose = 'dead';
        else if (bot.hitTimer > 0) pose = 'hit';
        else if (bot.shootTimer > 0) pose = 'shoot';
        else if (bot.moving) pose = Math.floor(bot.walkPhase) % 2 === 0 ? 'walkA' : 'walkB';
        const toCamera = Math.atan2(player.y - bot.y, player.x - bot.x);
        const facingCamera = Math.cos(angleDiff(bot.rotation, toCamera)) >= -0.15;
        const view = facingCamera || !bot.alive ? 0 : 1;
        const col = POSES.indexOf(pose);

        // sombra no chão
        if (this._columnOpen(Math.floor(item.sx / WALL_STEP), z)) {
            ctx.fillStyle = `rgba(8, 24, 4, ${0.4 * (1 - fog)})`;
            ctx.beginPath();
            ctx.ellipse(item.sx, bottom, wPx * 0.38, Math.max(2, hPx * 0.045), 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // quadro numa folha temporária, já com neblina e clarão vermelho de "levou tinta"
        const s = this.scratch;
        const sc = s.getContext('2d');
        sc.globalCompositeOperation = 'source-over';
        sc.clearRect(0, 0, FRAME_W, FRAME_H);
        sc.drawImage(sheet, col * FRAME_W, view * FRAME_H, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H);
        sc.globalCompositeOperation = 'source-atop';
        if (bot.hitTimer > 0) {
            sc.fillStyle = `rgba(255, 40, 70, ${0.55 * (bot.hitTimer / 0.28)})`;
            sc.fillRect(0, 0, FRAME_W, FRAME_H);
        }
        if (fog > 0.02) {
            sc.fillStyle = `rgba(${FOG[0]}, ${FOG[1]}, ${FOG[2]}, ${fog})`;
            sc.fillRect(0, 0, FRAME_W, FRAME_H);
        }
        sc.globalCompositeOperation = 'source-over';

        // eliminado some devagar
        const fade = bot.alive ? 1 : Math.min(1, (CONFIG.MATCH.deadLinger - bot.deadTimer) / 0.5);
        ctx.globalAlpha = Math.max(0, fade);

        // desenha só as colunas que não estão atrás de uma parede
        const c0 = Math.max(0, Math.floor(x / WALL_STEP));
        const c1 = Math.min(this.cols - 1, Math.floor((x + wPx) / WALL_STEP));
        let runStart = -1;
        for (let c = c0; c <= c1 + 1; c++) {
            const open = c <= c1 && this.depth[c] >= z;
            if (open && runStart < 0) runStart = c;
            if (!open && runStart >= 0) {
                const dx0 = Math.max(x, runStart * WALL_STEP);
                const dx1 = Math.min(x + wPx, c * WALL_STEP);
                if (dx1 > dx0) {
                    const sx0 = ((dx0 - x) / wPx) * FRAME_W;
                    const sx1 = ((dx1 - x) / wPx) * FRAME_W;
                    ctx.drawImage(s, sx0, 0, sx1 - sx0, FRAME_H, dx0, y, dx1 - dx0, hPx);
                }
                runStart = -1;
            }
        }
        ctx.globalAlpha = 1;
    }

    _drawBall(item, fog, camF, horizon) {
        const { ctx, f } = this;
        if (!this._columnOpen(Math.floor(item.sx / WALL_STEP), item.z)) return;
        const ball = item.ref;
        const y = horizon + ((CONFIG.CAMERA_HEIGHT - ball.z) * f) / item.z; // na altura em que a bolinha está
        const r = Math.max(2, (3.2 * f) / item.z);
        ctx.globalAlpha = 1 - fog;
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.arc(item.sx + r * 0.25, y + r * 0.3, r * 1.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = ball.color;
        ctx.beginPath();
        ctx.arc(item.sx, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = Math.max(1, r * 0.25);
        ctx.strokeStyle = 'rgba(10, 20, 40, 0.75)';
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath();
        ctx.arc(item.sx - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    // respingo de tinta numa parede (mancha com gotas ao redor)
    _drawDecal(item, fog, camF, horizon) {
        const { ctx, f } = this;
        const d = item.ref;
        if (!this._columnOpen(Math.floor(item.sx / WALL_STEP), item.z, 8)) return;
        const y = horizon + ((CONFIG.CAMERA_HEIGHT - d.h) * f) / item.z;
        const r = (d.size * f) / item.z;
        if (r < 0.8) return;
        if (d.floor) {
            // mancha no chão: vista de cima fica achatada pela perspectiva
            ctx.globalAlpha = Math.min(1, d.life / 4) * (1 - fog) * 0.9;
            const ry = Math.max(0.8, (d.size * 1.6 * camF) / (item.z * item.z));
            ctx.fillStyle = d.color;
            ctx.strokeStyle = 'rgba(10, 20, 40, 0.45)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.ellipse(item.sx, y, r * 1.6, ry, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.globalAlpha = 1;
            return;
        }
        ctx.globalAlpha = Math.min(1, d.life / 4) * (1 - fog) * 0.95;
        ctx.fillStyle = d.color;
        ctx.strokeStyle = 'rgba(10, 20, 40, 0.5)';
        ctx.lineWidth = Math.max(0.6, r * 0.14);
        const seed = Math.floor(d.x * 7 + d.y * 13);
        const blobs = [[0, 0, 1], [0.95, -0.35, 0.42], [-0.85, 0.4, 0.36], [0.15, 0.95, 0.3], [-0.25, -0.9, 0.26]];
        blobs.forEach(([bx, by, br], i) => {
            const k = 0.8 + (((seed >> i) & 3) / 3) * 0.4;
            ctx.beginPath();
            ctx.arc(item.sx + bx * r * k, y + by * r * k, br * r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        });
        ctx.globalAlpha = 1;
    }

    // ----- arma na tela (viewmodel): fica no canto direito, balança, recua e dá clarão ao atirar -----
    _drawWeapon(player, time) {
        const { ctx, f, w, h } = this;
        const wp = this.wp;

        // balanço ao andar (suavizado) e atraso ao girar a câmera
        const walked = Math.hypot(player.x - wp.lastX, player.y - wp.lastY);
        wp.bob += (Math.min(1, walked / 2.5) - wp.bob) * 0.15;
        const dRot = angleDiff(player.rotation, wp.lastRot);
        const dPitch = (player.pitch || 0) - wp.lastPitch;
        wp.swayX += (Math.max(-45, Math.min(45, -dRot * f * 0.7)) - wp.swayX) * 0.25;
        wp.swayY += (Math.max(-45, Math.min(45, dPitch * f * 0.7)) - wp.swayY) * 0.25;
        wp.lastX = player.x;
        wp.lastY = player.y;
        wp.lastRot = player.rotation;
        wp.lastPitch = player.pitch || 0;

        // a boca do cano fica onde a tinta nasce: um pouco à frente, à direita e abaixo da câmera
        const cfg = CONFIG.COMBAT;
        const sc = h * 0.0016;
        const tipX = w / 2 + (f * cfg.muzzleRight) / cfg.muzzleForward;
        const tipY = h / 2 + (f * cfg.muzzleDrop) / cfg.muzzleForward;

        const recoil = Math.max(0, player.shootTimer) / 0.15; // 1 no tiro, vai a 0
        const axis = { x: Math.cos(WEAPON_ANGLE), y: Math.sin(WEAPON_ANGLE) };
        const kick = recoil * 22 * sc;
        const bobX = Math.cos(time * 5) * 5 * sc * wp.bob;
        const bobY = Math.abs(Math.sin(time * 5)) * 7 * sc * wp.bob;

        const x = tipX - WEAPON_TIP.x * sc + wp.swayX + bobX + axis.x * kick;
        const y = tipY - WEAPON_TIP.y * sc + wp.swayY + bobY + axis.y * kick;
        ctx.drawImage(this.weapon, x, y, WEAPON_W * sc, WEAPON_H * sc);

        // clarão e respingo na boca do cano
        if (recoil > 0.45) {
            const fx = tipX + wp.swayX + bobX + axis.x * kick;
            const fy = tipY + wp.swayY + bobY + axis.y * kick;
            const r = 46 * sc * recoil;
            const g = ctx.createRadialGradient(fx, fy, 2, fx, fy, r);
            g.addColorStop(0, 'rgba(255,255,255,1)');
            g.addColorStop(0.4, 'rgba(255,225,90,0.95)');
            g.addColorStop(1, 'rgba(255,150,30,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            for (let i = 0; i < 14; i++) {
                const a = (i / 14) * Math.PI * 2;
                const rr = i % 2 === 0 ? r : r * 0.45;
                ctx.lineTo(fx + Math.cos(a) * rr, fy + Math.sin(a) * rr);
            }
            ctx.closePath();
            ctx.fill();
        }
    }
}
