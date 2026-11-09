// A partida inteira: mundo, zona, jogador, bots, tiros, dano e fim de jogo.
// Lógica pura (sem DOM): main.js só liga isso à tela. Por isso dá para testar tudo no Node.
import { CONFIG } from './config.js';
import { createRng } from './rng.js';
import { Zone } from './zone.js';
import { generateWorld, PALETTE } from './world.js';
import { isFree, resolveCircle, raycast } from './physics.js';
import { Player } from './player.js';
import { Bot } from './bot.js';
import { Paintball, stepPaintball } from './combat.js';

const MAX_DECALS = 90; // respingos de tinta que ficam nas paredes
const DECAL_LIFE = 40; // segundos

/** Pontos de nascimento: livres, longe das paredes e afastados entre si. */
export function generateSpawns(rng, world, count, minDistance) {
    const size = world.mapSize;
    const margin = 260;
    const spawns = [];
    let need = minDistance;
    for (let attempt = 0; spawns.length < count && attempt < 6000; attempt++) {
        if (attempt > 0 && attempt % 1500 === 0) need *= 0.8; // se o mapa estiver apertado, afrouxa
        const x = margin + rng() * (size - margin * 2);
        const y = margin + rng() * (size - margin * 2);
        if (!isFree(world, x, y, 50)) continue;
        if (spawns.every((s) => Math.hypot(s.x - x, s.y - y) >= need)) spawns.push({ x, y });
    }
    return spawns;
}

export function createMatch({ seed = (Math.random() * 2 ** 32) >>> 0 } = {}) {
    const rng = createRng(seed);
    const world = generateWorld(rng, CONFIG.MAP_SIZE, CONFIG.WORLD, CONFIG.WORLD.minGap, CONFIG.WORLD.margin);
    const zone = new Zone(CONFIG.ZONE, CONFIG.MAP_SIZE, rng);
    const total = CONFIG.MATCH.bots + 1;
    const spawns = generateSpawns(rng, world, total, CONFIG.MATCH.spawnMinDistance);

    const middle = CONFIG.MAP_SIZE / 2;
    const player = new Player(spawns[0].x, spawns[0].y);
    player.rotation = Math.atan2(middle - player.y, middle - player.x); // começa olhando para o centro

    const bots = [];
    for (let i = 1; i < total; i++) {
        const sp = spawns[i] ?? spawns[i % spawns.length];
        // cada bot veste uma cor da paleta (a do jogador é amarela, então começa em outra)
        const color = PALETTE[(i + 1) % PALETTE.length].base;
        bots.push(new Bot(i, sp.x, sp.y, color, rng));
    }

    return {
        seed, rng, world, zone, player, bots,
        balls: [], // bolinhas de tinta voando
        decals: [], // respingos nas paredes { x, y, h, color, size, life }
        events: [], // { type: 'kill', victim, killer }
        state: 'countdown', // countdown -> playing -> over
        countdown: CONFIG.MATCH.countdown,
        time: 0,
        kills: 0,
        hitMarker: 0, // por quanto tempo mostrar o "X" de acerto na mira
        result: null, // { victory, reason, killer }
    };
}

export const aliveBots = (m) => m.bots.filter((b) => b.alive);

/** Aplica dano de tinta, marca quem levou e registra a eliminação. */
export function applyHit(m, victim, source) {
    if (!victim.alive) return;
    victim.health = Math.max(0, victim.health - CONFIG.COMBAT.damage);
    victim.hitTimer = 0.28;
    if (source && source.alive !== undefined) {
        victim.threat = { x: source.x, y: source.y, t: 0 }; // sabe de onde veio o tiro
    }
    if (source === m.player) m.hitMarker = 0.3;
    if (victim.health <= 0) eliminate(m, victim, source);
}

function eliminate(m, victim, killer) {
    if (victim.kind === 'bot') victim.alive = false; // o jogador "morre" quando health chega a 0
    if (killer === m.player) m.kills += 1;
    m.events.push({ type: 'kill', victim, killer });
}

/** A tempestade tira vida continuamente (sem o efeito de "levou tinta"). */
function stormDamage(m, entity, amount) {
    if (!entity.alive) return;
    entity.health = Math.max(0, entity.health - amount);
    if (entity.health <= 0) eliminate(m, entity, 'storm');
}

/** Solta uma bolinha da boca do marcador de `shooter`, na direção `angle` e inclinação `pitch`. */
function spawnBall(m, shooter, angle, pitch = 0) {
    const cfg = CONFIG.COMBAT;
    // a boca do marcador fica um pouco à frente do jogador
    const mx = shooter.x + Math.cos(angle) * 14;
    const my = shooter.y + Math.sin(angle) * 14;
    m.balls.push(new Paintball(mx, my, angle, shooter, shooter.color, { z: cfg.muzzleHeight, pitch }));
    shooter.shootTimer = 0.15;
}

/**
 * Tiro do jogador: a bolinha sai da arma (um pouco à frente, à direita e abaixo da câmera) e
 * é apontada para o ponto que a mira, no centro da tela, enxerga a `convergence` unidades.
 * Assim a tinta acompanha a câmera (inclusive para cima e para baixo) e cruza a mira.
 */
export function fireFromPlayer(m, spread = 0, vSpread = 0) {
    const p = m.player;
    const cfg = CONFIG.COMBAT;
    const cosR = Math.cos(p.rotation);
    const sinR = Math.sin(p.rotation);
    const cosP = Math.cos(p.pitch);
    const sinP = Math.sin(p.pitch);

    // A boca do marcador acompanha a câmera (inclusive a inclinação): à frente, à direita e abaixo do olho.
    // Base da câmera: frente = (cosP cosR, cosP sinR, sinP), direita = (-sinR, cosR, 0), cima = (-sinP cosR, -sinP sinR, cosP)
    let mx = p.x + cosP * cosR * cfg.muzzleForward - sinR * cfg.muzzleRight + sinP * cosR * cfg.muzzleDrop;
    let my = p.y + cosP * sinR * cfg.muzzleForward + cosR * cfg.muzzleRight + sinP * sinR * cfg.muzzleDrop;
    const mz = CONFIG.CAMERA_HEIGHT + sinP * cfg.muzzleForward - cosP * cfg.muzzleDrop;
    // encostado numa parede: a boca ficaria do outro lado dela, então o tiro sai do próprio corpo
    const toMuzzle = Math.atan2(my - p.y, mx - p.x);
    if (raycast(m.world, p.x, p.y, toMuzzle, Math.hypot(mx - p.x, my - p.y))) {
        mx = p.x;
        my = p.y;
    }

    const yaw = p.rotation + spread;
    const pit = p.pitch + vSpread;
    const d = cfg.convergence;
    const aimX = p.x + Math.cos(yaw) * Math.cos(pit) * d;
    const aimY = p.y + Math.sin(yaw) * Math.cos(pit) * d;
    const aimZ = CONFIG.CAMERA_HEIGHT + Math.sin(pit) * d;

    const dx = aimX - mx;
    const dy = aimY - my;
    const angle = Math.atan2(dy, dx);
    const pitch = Math.atan2(aimZ - mz, Math.hypot(dx, dy));
    const ball = new Paintball(mx, my, angle, p, p.color, { z: mz, pitch });
    m.balls.push(ball);
    p.shootTimer = 0.15;
    return ball;
}

/** Empurra jogadores que estão se sobrepondo (e depois tira de dentro de paredes). */
function separate(m, entities) {
    for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
            const a = entities[i];
            const b = entities[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const d = Math.hypot(dx, dy);
            const min = a.radius + b.radius;
            if (d < min && d > 1e-6) {
                const push = (min - d) / 2;
                const nx = dx / d;
                const ny = dy / d;
                const pa = resolveCircle(a.x - nx * push, a.y - ny * push, a.radius, m.world);
                const pb = resolveCircle(b.x + nx * push, b.y + ny * push, b.radius, m.world);
                a.x = pa.x; a.y = pa.y;
                b.x = pb.x; b.y = pb.y;
            }
        }
    }
}

function addDecal(m, hit, ball) {
    const obj = hit.obj;
    // o respingo fica na altura exata em que a tinta bateu
    const h = Math.max(4, Math.min(obj.height - 3, hit.z));
    m.decals.push({
        x: hit.x + hit.nx * 0.6, // um pouco para fora da parede
        y: hit.y + hit.ny * 0.6,
        h,
        color: ball.color,
        size: 4 + m.rng() * 4,
        life: DECAL_LIFE,
    });
    if (m.decals.length > MAX_DECALS) m.decals.shift();
}

function addGroundDecal(m, hit, ball) {
    m.decals.push({
        x: hit.x, y: hit.y, h: 0, floor: true,
        color: ball.color,
        size: 5 + m.rng() * 4,
        life: DECAL_LIFE * 0.6,
    });
    if (m.decals.length > MAX_DECALS) m.decals.shift();
}

/**
 * Avança a partida `dt` segundos.
 * @param {object} input teclado/mouse (isDown, consumeLook, isMouseDown)
 * @param {{immortal?:boolean, timeScale?:number}} opts opções de teste
 */
export function updateMatch(m, dt, input, opts = {}) {
    const { player, bots, world, zone } = m;
    m.time += dt;
    m.hitMarker = Math.max(0, m.hitMarker - dt);
    for (const d of m.decals) d.life -= dt;
    m.decals = m.decals.filter((d) => d.life > 0);

    if (m.state === 'countdown') {
        player.look(input, dt); // dá para olhar em volta, mas não andar nem atirar
        m.countdown -= dt;
        if (m.countdown <= 0) m.state = 'playing';
        return;
    }
    if (m.state === 'over') {
        for (const b of bots) b.deadTimer += b.alive ? 0 : dt;
        return;
    }

    // ----- jogador -----
    if (player.alive) {
        player.update(dt, input, world);
        const firing = input.isMouseDown ? input.isMouseDown(0) : false;
        if (firing && player.fireTimer <= 0) {
            const spread = (m.rng() - 0.5) * 2 * CONFIG.COMBAT.playerSpread;
            const vSpread = (m.rng() - 0.5) * 2 * CONFIG.COMBAT.playerSpread;
            fireFromPlayer(m, spread, vSpread);
            player.fireTimer = CONFIG.COMBAT.playerFireInterval;
        }
    }

    // ----- bots -----
    const everyone = [player, ...bots];
    for (const bot of bots) {
        if (!bot.alive && bot.deadTimer > CONFIG.MATCH.deadLinger) continue;
        bot.update(dt, {
            world, zone, rng: m.rng,
            enemies: everyone.filter((e) => e !== bot && e.alive),
            shoot: (angle, pitch) => spawnBall(m, bot, angle, pitch),
        });
    }
    separate(m, everyone.filter((e) => e.alive));

    // ----- bolinhas de tinta -----
    for (const ball of m.balls) {
        const result = stepPaintball(world, ball, dt, everyone);
        if (!result) continue;
        if (result.type === 'hit') {
            if (!(opts.immortal && result.target === player)) applyHit(m, result.target, ball.owner);
        } else if (result.type === 'wall') {
            addDecal(m, result, ball);
        } else if (result.type === 'ground') {
            addGroundDecal(m, result, ball);
        }
    }
    m.balls = m.balls.filter((b) => b.alive);

    // ----- tempestade -----
    zone.update(dt * (opts.timeScale || 1));
    const dps = zone.damagePerSecond * dt;
    for (const e of everyone) {
        if (!e.alive || !zone.isOutside(e.x, e.y)) continue;
        if (opts.immortal && e === player) continue;
        stormDamage(m, e, dps);
    }

    // ----- fim de jogo -----
    if (!player.alive) {
        const last = m.events.findLast((ev) => ev.victim === player);
        m.result = { victory: false, reason: last && last.killer === 'storm' ? 'storm' : 'shot', killer: last ? last.killer : null };
        m.state = 'over';
    } else if (aliveBots(m).length === 0) {
        m.result = { victory: true, reason: 'last', killer: null };
        m.state = 'over';
    }
}
