// Combate: bolinhas de tinta que voam em 3D (com altura), passam por cima de paredes baixas,
// batem nas paredes, no chão e acertam jogadores. Lógica pura (sem DOM), testável.
//
// O mapa é visto de cima (x, y) e cada bolinha tem também uma altura `z` (0 = chão). Ela sobe ou
// desce em linha reta conforme a inclinação do tiro (`pitch`).
import { CONFIG } from './config.js';
import { raycast, rayCircleSpan } from './physics.js';

export class Paintball {
    /**
     * @param {number} x posição de saída (mapa visto de cima)
     * @param {number} y
     * @param {number} angle direção horizontal do tiro (radianos)
     * @param {object} owner quem atirou (nunca se acerta)
     * @param {string} color cor da tinta (hex)
     * @param {{z?:number, pitch?:number}} [shot] altura de saída e inclinação (+ = para cima)
     */
    constructor(x, y, angle, owner, color, { z = CONFIG.COMBAT.muzzleHeight, pitch = 0 } = {}) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.angle = angle;
        this.pitch = pitch;
        this.speed = CONFIG.COMBAT.paintballSpeed;
        this.hSpeed = this.speed * Math.cos(pitch); // velocidade no mapa visto de cima
        this.slope = Math.tan(pitch); // quanto sobe (ou desce) por unidade andada no mapa
        this.owner = owner;
        this.color = color;
        this.life = CONFIG.COMBAT.paintballLife;
        this.alive = true;
    }
}

/**
 * Procura a primeira parede que a bolinha realmente atinge: se ela passa POR CIMA da parede
 * (mais alta que ela naquele ponto), segue em frente e testa a próxima.
 */
function firstWallHit(world, ball, maxLen) {
    const dx = Math.cos(ball.angle);
    const dy = Math.sin(ball.angle);
    let travelled = 0;
    for (let i = 0; i < 8 && travelled < maxLen; i++) {
        const hit = raycast(world, ball.x + dx * travelled, ball.y + dy * travelled, ball.angle, maxLen - travelled);
        if (!hit) return null;
        const s = travelled + hit.dist;
        const z = ball.z + ball.slope * s;
        const wallHeight = hit.obj && hit.obj.height !== undefined ? hit.obj.height : Infinity;
        if (z <= wallHeight) return { s, z, hit };
        travelled = s + 0.05; // passou por cima: continua depois dessa parede
    }
    return null;
}

/**
 * Avança a bolinha `dt` segundos e diz o que aconteceu:
 *   { type: 'hit',    target, x, y, z }            acertou um jogador
 *   { type: 'wall',   obj, nx, ny, x, y, z }       bateu numa parede ou tambor (z = altura do respingo)
 *   { type: 'ground', x, y }                       bateu no chão
 *   { type: 'expired' }                            ficou sem energia e caiu
 *   null                                           continua voando
 * Chão, paredes e jogadores são testados no mesmo trecho: vale o que estiver mais perto.
 */
export function stepPaintball(world, ball, dt, targets) {
    const len = ball.hSpeed * dt;
    const dx = Math.cos(ball.angle);
    const dy = Math.sin(ball.angle);
    let best = { s: len, type: null };

    // chão
    if (ball.z <= 0) best = { s: 0, type: 'ground' };
    else if (ball.slope < 0) {
        const s = ball.z / -ball.slope;
        if (s <= best.s) best = { s, type: 'ground' };
    }

    // paredes (só as que a bolinha não passa por cima)
    const wall = firstWallHit(world, ball, best.s);
    if (wall) best = { s: wall.s, type: 'wall', hit: wall.hit, z: wall.z };

    // jogadores: precisam estar no caminho E a bolinha tem que estar na altura do corpo (0 até a altura)
    for (const t of targets) {
        if (!t.alive || t === ball.owner) continue;
        const span = rayCircleSpan(ball.x, ball.y, dx, dy, best.s, t.x, t.y, t.radius);
        if (!span) continue;
        const top = t.height !== undefined ? t.height : CONFIG.COMBAT.entityHeight;
        // trecho do caminho em que a altura da bolinha fica entre 0 e `top`
        let lo = span[0];
        let hi = span[1];
        if (Math.abs(ball.slope) < 1e-9) {
            if (ball.z < 0 || ball.z > top) continue;
        } else {
            const s0 = (0 - ball.z) / ball.slope;
            const s1 = (top - ball.z) / ball.slope;
            lo = Math.max(lo, Math.min(s0, s1));
            hi = Math.min(hi, Math.max(s0, s1));
            if (lo > hi) continue;
        }
        if (lo < best.s || best.type === null) {
            best = { s: lo, type: 'hit', target: t, z: ball.z + ball.slope * lo };
        }
    }

    // aplica o movimento
    const x = ball.x + dx * best.s;
    const y = ball.y + dy * best.s;
    const z = ball.z + ball.slope * best.s;
    if (best.type === null) {
        ball.x = x;
        ball.y = y;
        ball.z = z;
        ball.life -= dt;
        if (ball.life <= 0) {
            ball.alive = false;
            return { type: 'expired' };
        }
        return null;
    }
    ball.alive = false;
    ball.x = x;
    ball.y = y;
    ball.z = Math.max(0, z);
    if (best.type === 'hit') return { type: 'hit', target: best.target, x, y, z };
    if (best.type === 'ground') return { type: 'ground', x, y };
    return { type: 'wall', obj: best.hit.obj, nx: best.hit.nx, ny: best.hit.ny, x, y, z };
}
