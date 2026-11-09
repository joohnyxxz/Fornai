// Campo de paintball: bunkers infláveis, painéis e tambores que servem de cobertura.
// Cada objeto é geometria de verdade (paredes e cilindros com física), não uma imagem.
// Lógica pura (sem DOM), para poder ser testada.
import { isFree } from './physics.js';

// Cores dos infláveis (base) e da faixa de destaque (accent)
export const PALETTE = [
    { name: 'amarelo', base: '#ffd60a', accent: '#232323' },
    { name: 'laranja', base: '#ff7a1a', accent: '#ffffff' },
    { name: 'azul', base: '#1f7bff', accent: '#ffffff' },
    { name: 'vermelho', base: '#e53a3a', accent: '#ffffff' },
    { name: 'verde', base: '#2fc45a', accent: '#232323' },
    { name: 'ciano', base: '#19c3e6', accent: '#232323' },
    { name: 'branco', base: '#f2f2f2', accent: '#e53a3a' },
];

export const TEXTURE_VARIANTS = 3; // variações de respingos de tinta por cor

function addBox(segments, obj) {
    const cos = Math.cos(obj.yaw);
    const sin = Math.sin(obj.yaw);
    const hw = obj.w / 2;
    const hd = obj.d / 2;
    const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, ly]) => ({
        x: obj.x + lx * cos - ly * sin,
        y: obj.y + lx * sin + ly * cos,
    }));
    for (let i = 0; i < 4; i++) {
        const a = corners[i];
        const b = corners[(i + 1) % 4];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        segments.push({
            x1: a.x, y1: a.y, x2: b.x, y2: b.y, len,
            nx: (b.y - a.y) / len, ny: -(b.x - a.x) / len, // normal para fora (cantos em sentido horário)
            obj,
        });
    }
}

/**
 * Gera o campo. Devolve:
 *   obstacles: lista de objetos { id, kind, x, y, yaw, w, d, r, height, radius, color, variant }
 *   segments, circles: colisores para a física (ver physics.js)
 */
export function generateWorld(rng, mapSize, counts, minGap = 120, margin = 150) {
    const plan = [
        ...Array(counts.panels).fill('panel'),
        ...Array(counts.boxes).fill('box'),
        ...Array(counts.drums).fill('drum'),
    ];
    const obstacles = [];
    const segments = [];
    const circles = [];

    for (const kind of plan) {
        const obj = { id: obstacles.length, kind, yaw: rng() * Math.PI, color: 0, variant: 0 };
        if (kind === 'box') {
            obj.w = 70 + rng() * 60;
            obj.d = 70 + rng() * 60;
            obj.height = 75 + rng() * 25;
            obj.radius = Math.hypot(obj.w, obj.d) / 2;
        } else if (kind === 'panel') {
            obj.w = 150 + rng() * 110; // comprimento
            obj.d = 14; // espessura
            obj.height = 100 + rng() * 20;
            obj.radius = Math.hypot(obj.w, obj.d) / 2;
        } else {
            obj.r = 24 + rng() * 18;
            obj.height = 62 + rng() * 30;
            obj.radius = obj.r;
        }
        obj.color = Math.floor(rng() * PALETTE.length);
        obj.variant = Math.floor(rng() * TEXTURE_VARIANTS);

        for (let attempt = 0; attempt < 40; attempt++) {
            const x = margin + rng() * (mapSize - margin * 2);
            const y = margin + rng() * (mapSize - margin * 2);
            const free = obstacles.every(
                (o) => Math.hypot(o.x - x, o.y - y) >= o.radius + obj.radius + minGap
            );
            if (free) {
                obj.x = x;
                obj.y = y;
                obstacles.push(obj);
                if (kind === 'drum') circles.push({ x, y, r: obj.r, obj });
                else addBox(segments, obj);
                break;
            }
        }
    }

    return { mapSize, obstacles, segments, circles };
}

/** Sorteia um ponto livre na região central do mapa (para nascer o jogador). */
export function findFreeSpot(rng, world, radius) {
    const size = world.mapSize;
    for (let attempt = 0; attempt < 300; attempt++) {
        const x = size * 0.2 + rng() * size * 0.6;
        const y = size * 0.2 + rng() * size * 0.6;
        if (isFree(world, x, y, radius + 30)) return { x, y };
    }
    return { x: size / 2, y: size / 2 };
}
