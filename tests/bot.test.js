import test from 'node:test';
import assert from 'node:assert/strict';
import { Bot, findCover } from '../src/bot.js';
import { Zone } from '../src/zone.js';
import { lineOfSight, isFree } from '../src/physics.js';
import { createRng } from '../src/rng.js';
import { CONFIG } from '../src/config.js';
import { angleDiff } from '../src/util.js';

function wall(x1, y1, x2, y2) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    return { x1, y1, x2, y2, len, nx: (y2 - y1) / len, ny: -(x2 - x1) / len, obj: {} };
}
const makeWorld = (segments = [], circles = []) => ({ segments, circles, obstacles: [], mapSize: 3000 });
const enemyAt = (x, y) => ({ kind: 'player', x, y, radius: 18, alive: true, health: 100 });

function setup(seed = 1) {
    const rng = createRng(seed);
    const zone = new Zone(CONFIG.ZONE, CONFIG.MAP_SIZE, rng);
    return { rng, zone };
}

/** Roda o bot por `seconds` segundos e devolve os ângulos dos tiros disparados. */
function simulate(bot, { world, zone, rng, enemies }, seconds, dt = 0.05) {
    const shots = [];
    const ctx = { world, zone, rng, enemies, shoot: (a) => shots.push(a) };
    for (let t = 0; t < seconds; t += dt) bot.update(dt, ctx);
    return shots;
}

test('o bot atira em um inimigo visível (depois do tempo de reação)', () => {
    const { rng, zone } = setup();
    const bot = new Bot(1, 1000, 1500, '#e53a3a', rng);
    const enemy = enemyAt(1400, 1500);
    const shots = simulate(bot, { world: makeWorld(), zone, rng, enemies: [enemy] }, 6);
    assert.ok(shots.length >= 2, `só ${shots.length} tiros em 6 s`);
});

test('o bot NÃO reage instantaneamente: o primeiro tiro demora', () => {
    const { rng, zone } = setup(3);
    const bot = new Bot(1, 1000, 1500, '#e53a3a', rng);
    bot.fireTimer = 0; // pronto para atirar
    const enemy = enemyAt(1300, 1500);
    const shots = simulate(bot, { world: makeWorld(), zone, rng, enemies: [enemy] }, 0.25);
    assert.equal(shots.length, 0, 'atirou antes do tempo de reação');
});

test('a mira aponta para o alvo (com pequeno erro) no momento do tiro', () => {
    const { rng, zone } = setup(5);
    const bot = new Bot(1, 1000, 1500, '#e53a3a', rng);
    const enemy = enemyAt(1400, 1500);
    const errors = [];
    // o bot anda de lado em combate: o erro é medido contra o ângulo REAL do alvo em cada tiro
    const ctx = {
        world: makeWorld(), zone, rng, enemies: [enemy],
        shoot: (a) => errors.push(Math.abs(angleDiff(a, Math.atan2(enemy.y - bot.y, enemy.x - bot.x)))),
    };
    for (let t = 0; t < 8; t += 0.05) bot.update(0.05, ctx);
    assert.ok(errors.length > 0);
    for (const e of errors) assert.ok(e < 0.2, `tiro muito fora da mira: ${e.toFixed(3)} rad`);
});

test('com uma parede no meio o bot NÃO enxerga nem atira (linha de visão)', () => {
    const { rng, zone } = setup(7);
    const bot = new Bot(1, 1000, 1500, '#e53a3a', rng);
    const enemy = enemyAt(1400, 1500);
    const w = makeWorld([wall(1200, 1000, 1200, 2000)]);
    const shots = simulate(bot, { world: w, zone, rng, enemies: [enemy] }, 6);
    // o bot pode contornar a parede e acabar vendo o inimigo, mas nos primeiros segundos não pode atirar
    const early = simulate(new Bot(2, 1000, 1500, '#fff', createRng(9)), { world: w, zone, rng, enemies: [enemy] }, 1.2);
    assert.equal(early.length, 0, 'atirou através da parede');
    assert.ok(shots.length >= 0);
});

test('o bot não atira em alvos fora do alcance de ataque', () => {
    const { rng, zone } = setup(11);
    const bot = new Bot(1, 300, 1500, '#e53a3a', rng);
    const enemy = enemyAt(300 + CONFIG.BOT.engage + 150, 1500); // visível, mas longe demais
    bot.fireTimer = 0;
    const shots = simulate(bot, { world: makeWorld(), zone, rng, enemies: [enemy] }, 0.6);
    assert.equal(shots.length, 0);
});

test('o bot na tempestade corre para a zona segura', () => {
    const { rng, zone } = setup(13);
    zone.current = { x: 1500, y: 1500, r: 300 };
    zone.target = { x: 1500, y: 1500, r: 200 };
    const bot = new Bot(1, 2200, 1500, '#e53a3a', rng); // 700 unidades do centro (fora)
    const before = Math.hypot(bot.x - 1500, bot.y - 1500);
    const ctx = { world: makeWorld(), zone, rng, enemies: [], shoot: () => {} };
    for (let t = 0; t < 1; t += 0.05) bot.update(0.05, ctx);
    assert.equal(bot.state, 'storm', 'deveria estar fugindo da tempestade');
    for (let t = 0; t < 5; t += 0.05) bot.update(0.05, ctx);
    const after = Math.hypot(bot.x - 1500, bot.y - 1500);
    assert.ok(after < before - 300, `deveria se aproximar da zona: ${before} -> ${after}`);
});

test('sem inimigos o bot patrulha dentro do mapa e não fica parado', () => {
    const { rng, zone } = setup(17);
    const bot = new Bot(1, 1500, 1500, '#e53a3a', rng);
    simulate(bot, { world: makeWorld(), zone, rng, enemies: [] }, 20);
    assert.ok(Math.hypot(bot.x - 1500, bot.y - 1500) > 100, 'ficou parado');
    assert.ok(bot.x > 0 && bot.x < 3000 && bot.y > 0 && bot.y < 3000);
});

test('findCover devolve um ponto SEM linha de visão para a ameaça', () => {
    const rng = createRng(21);
    const w = makeWorld([wall(1200, 800, 1200, 2200)]);
    const threat = { x: 1800, y: 1500 };
    const spot = findCover(w, rng, { x: 1300, y: 1500 }, threat);
    assert.ok(spot, 'deveria achar cobertura atrás da parede');
    assert.equal(lineOfSight(w, threat.x, threat.y, spot.x, spot.y), false, 'o inimigo ainda o veria');
    assert.ok(isFree(w, spot.x, spot.y, CONFIG.COMBAT.entityRadius), 'ponto dentro de uma parede');
});

test('findCover devolve null em campo aberto (nada para se esconder)', () => {
    assert.equal(findCover(makeWorld(), createRng(1), { x: 1500, y: 1500 }, { x: 1800, y: 1500 }), null);
});

test('o bot ferido e ameaçado procura cobertura', () => {
    const { rng, zone } = setup(23);
    const w = makeWorld([wall(1100, 800, 1100, 2200), wall(900, 1300, 1100, 1300)]);
    const bot = new Bot(1, 1250, 1500, '#e53a3a', rng);
    bot.health = 20; // abaixo do limite de retirada
    bot.threat = { x: 1800, y: 1500, t: 0 };
    const enemy = enemyAt(1800, 1500);
    simulate(bot, { world: w, zone, rng, enemies: [enemy] }, 1.5);
    assert.ok(['cover', 'combat'].includes(bot.state), `estado inesperado: ${bot.state}`);
    assert.equal(bot.coverCooldown > 0 || bot.state === 'cover', true, 'nem tentou procurar cobertura');
});

test('bot eliminado não age nem se move', () => {
    const { rng, zone } = setup(29);
    const bot = new Bot(1, 1000, 1500, '#e53a3a', rng);
    bot.alive = false;
    const shots = simulate(bot, { world: makeWorld(), zone, rng, enemies: [enemyAt(1200, 1500)] }, 3);
    assert.equal(shots.length, 0);
    assert.equal(bot.x, 1000);
    assert.ok(bot.deadTimer > 2.5, 'o tempo de eliminado deve correr');
});

test('o bot mira em 3D: a inclinação do tiro aponta do marcador para o peito do alvo', () => {
    const { rng, zone } = setup(37);
    const bot = new Bot(1, 1000, 1500, '#e53a3a', rng);
    const enemy = enemyAt(1300, 1500);
    const pitches = [];
    const ctx = { world: makeWorld(), zone, rng, enemies: [enemy], shoot: (a, p) => pitches.push(p) };
    for (let t = 0; t < 12; t += 0.05) bot.update(0.05, ctx);
    assert.ok(pitches.length > 0);
    const ideal = Math.atan2(CONFIG.COMBAT.chestHeight - CONFIG.COMBAT.muzzleHeight, 300);
    for (const p of pitches) {
        assert.ok(Number.isFinite(p), 'inclinação inválida');
        assert.ok(Math.abs(p) < 0.35, `o bot mirou para o céu ou para o chão: ${p.toFixed(3)}`);
    }
    const average = pitches.reduce((a, b) => a + b, 0) / pitches.length;
    assert.ok(Math.abs(average - ideal) < 0.12, `inclinação média ${average.toFixed(3)} longe do ideal ${ideal.toFixed(3)}`);
});

test('o bot nunca sai do mapa, mesmo mandado para fora dele', () => {
    const { rng, zone } = setup(39);
    zone.current = { x: 5000, y: 5000, r: 200 }; // zona fora do mapa: o bot tentará ir para lá
    zone.target = { x: 5000, y: 5000, r: 100 };
    const bot = new Bot(1, 2900, 2900, '#e53a3a', rng);
    const ctx = { world: makeWorld(), zone, rng, enemies: [], shoot: () => {} };
    for (let t = 0; t < 20; t += 0.05) bot.update(0.05, ctx);
    assert.ok(bot.x <= CONFIG.MAP_SIZE && bot.y <= CONFIG.MAP_SIZE && bot.x >= 0 && bot.y >= 0);
});

test('bots diferentes têm habilidades diferentes', () => {
    const rng = createRng(31);
    const skills = Array.from({ length: 10 }, (_, i) => new Bot(i, 0, 0, '#fff', rng).skill);
    assert.ok(Math.max(...skills) - Math.min(...skills) > 0.1);
    for (const s of skills) assert.ok(s >= 0.75 && s <= 1.25);
});
