import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, updateMatch, applyHit, aliveBots, generateSpawns, fireFromPlayer } from '../src/match.js';
import { stepPaintball } from '../src/combat.js';
import { isFree } from '../src/physics.js';
import { createRng } from '../src/rng.js';
import { CONFIG } from '../src/config.js';

// entrada falsa: nenhuma tecla, mouse opcional
function input({ keys = [], mouse = false } = {}) {
    const k = new Set(keys);
    return { isDown: (key) => k.has(key), consumeLook: () => ({ x: 0, y: 0 }), isMouseDown: () => mouse };
}

/** Deixa a contagem acabar para a partida valer. */
function startPlaying(m) {
    updateMatch(m, CONFIG.MATCH.countdown + 0.1, input());
    assert.equal(m.state, 'playing');
}

// ---------- criação ----------

test('a partida começa com o jogador e 19 bots, todos vivos e com vida cheia', () => {
    const m = createMatch({ seed: 1 });
    assert.equal(m.bots.length, CONFIG.MATCH.bots);
    assert.equal(m.bots.length + 1, 20);
    assert.equal(m.state, 'countdown');
    for (const e of [m.player, ...m.bots]) {
        assert.equal(e.health, 100);
        assert.ok(e.alive);
    }
});

test('a mesma semente gera a mesma partida', () => {
    const a = createMatch({ seed: 42 });
    const b = createMatch({ seed: 42 });
    assert.deepEqual(a.player.x, b.player.x);
    assert.deepEqual(a.bots.map((x) => [x.x, x.y]), b.bots.map((x) => [x.x, x.y]));
    assert.notDeepEqual(a.bots.map((x) => x.x), createMatch({ seed: 43 }).bots.map((x) => x.x));
});

test('os pontos de nascimento são livres, dentro do mapa e afastados entre si', () => {
    for (let seed = 1; seed <= 8; seed++) {
        const m = createMatch({ seed });
        const all = [m.player, ...m.bots];
        for (const e of all) {
            assert.ok(isFree(m.world, e.x, e.y, 30), `nasceu dentro de uma parede (semente ${seed})`);
            assert.ok(e.x > 0 && e.x < CONFIG.MAP_SIZE && e.y > 0 && e.y < CONFIG.MAP_SIZE);
        }
        for (let i = 0; i < all.length; i++) {
            for (let j = i + 1; j < all.length; j++) {
                const d = Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y);
                assert.ok(d >= 100, `jogadores nasceram colados (${d.toFixed(0)})`);
            }
        }
    }
});

test('generateSpawns devolve a quantidade pedida', () => {
    const m = createMatch({ seed: 5 });
    assert.equal(generateSpawns(createRng(5), m.world, 20, 240).length, 20);
});

// ---------- contagem ----------

test('durante a contagem ninguém anda, atira nem leva dano', () => {
    const m = createMatch({ seed: 2 });
    const before = [m.player.x, m.player.y, ...m.bots.map((b) => b.x)];
    for (let i = 0; i < 30; i++) updateMatch(m, 0.05, input({ keys: ['w'], mouse: true }));
    assert.equal(m.state, 'countdown');
    assert.deepEqual([m.player.x, m.player.y, ...m.bots.map((b) => b.x)], before);
    assert.equal(m.balls.length, 0);
});

test('depois da contagem a partida começa', () => {
    const m = createMatch({ seed: 2 });
    updateMatch(m, 2, input());
    assert.equal(m.state, 'countdown');
    updateMatch(m, 1.2, input());
    assert.equal(m.state, 'playing');
});

// ---------- tiros e dano ----------

test('segurar o botão esquerdo atira na cadência certa', () => {
    const m = createMatch({ seed: 3 });
    startPlaying(m);
    m.bots.forEach((b) => { b.alive = false; b.deadTimer = 99; }); // sem interferência
    m.bots[0].alive = true; // mantém um vivo para a partida não acabar
    m.bots[0].x = 10; m.bots[0].y = 10;
    for (let t = 0; t < 1; t += 0.05) updateMatch(m, 0.05, input({ mouse: true }));
    const expected = Math.ceil(1 / CONFIG.COMBAT.playerFireInterval);
    assert.ok(m.balls.length > 0 || m.decals.length > 0);
    assert.ok(m.player.fireTimer >= 0);
    assert.ok(expected >= 4);
});

test('um acerto tira 20 de vida; 5 acertos eliminam', () => {
    const m = createMatch({ seed: 4 });
    startPlaying(m);
    const bot = m.bots[0];
    for (let i = 1; i <= 4; i++) {
        applyHit(m, bot, m.player);
        assert.equal(bot.health, 100 - 20 * i);
        assert.ok(bot.alive);
    }
    applyHit(m, bot, m.player);
    assert.equal(bot.health, 0);
    assert.equal(bot.alive, false);
    assert.equal(m.kills, 1, 'a eliminação deve contar para o jogador');
    assert.ok(m.events.some((e) => e.type === 'kill' && e.victim === bot && e.killer === m.player));
});

test('acertar marca o "X" na mira e avisa o bot de onde veio o tiro', () => {
    const m = createMatch({ seed: 6 });
    startPlaying(m);
    const bot = m.bots[0];
    applyHit(m, bot, m.player);
    assert.ok(m.hitMarker > 0);
    assert.ok(bot.threat && Math.abs(bot.threat.x - m.player.x) < 1e-9);
    assert.ok(bot.hitTimer > 0);
});

test('bots também eliminam uns aos outros (não conta como kill do jogador)', () => {
    const m = createMatch({ seed: 8 });
    startPlaying(m);
    const [a, b] = m.bots;
    for (let i = 0; i < 5; i++) applyHit(m, b, a);
    assert.equal(b.alive, false);
    assert.equal(m.kills, 0);
});

test('uma bolinha do jogador realmente acerta um bot à frente', () => {
    const m = createMatch({ seed: 9 });
    startPlaying(m);
    // limpa o campo: mundo vazio, um bot parado bem à frente
    m.world.segments = [];
    m.world.circles = [];
    m.bots.forEach((b, i) => { b.alive = i === 0; b.deadTimer = 99; });
    const bot = m.bots[0];
    m.player.x = 1000; m.player.y = 1500; m.player.rotation = 0;
    bot.x = 1300; bot.y = 1500;
    bot.update = () => {}; // alvo parado: não reage nem anda neste teste
    const original = CONFIG.COMBAT.playerSpread;
    for (let t = 0; t < 1.2 && bot.health === 100; t += 0.02) updateMatch(m, 0.02, input({ mouse: true }));
    assert.ok(bot.health < 100, `o bot não levou nenhum tiro (vida ${bot.health}, spread ${original})`);
});

test('uma parede entre o jogador e o bot bloqueia os tiros', () => {
    const m = createMatch({ seed: 10 });
    startPlaying(m);
    m.world.circles = [];
    m.world.segments = [{ x1: 1150, y1: 1000, x2: 1150, y2: 2000, len: 1000, nx: -1, ny: 0, obj: { height: 100 } }];
    m.bots.forEach((b, i) => { b.alive = i === 0; b.deadTimer = 99; });
    const bot = m.bots[0];
    m.player.x = 1000; m.player.y = 1500; m.player.rotation = 0;
    bot.x = 1300; bot.y = 1500;
    bot.update = () => {}; // alvo parado
    for (let t = 0; t < 1.5; t += 0.02) updateMatch(m, 0.02, input({ mouse: true }));
    assert.equal(bot.health, 100, 'a parede não bloqueou os tiros');
    assert.ok(m.decals.length > 0, 'deveria ter respingos de tinta na parede');
});

// ---------- tempestade ----------

test('a tempestade tira vida de quem está fora da zona e pode eliminar', () => {
    const m = createMatch({ seed: 11 });
    startPlaying(m);
    m.zone.current = { x: 1500, y: 1500, r: 100 };
    m.bots.forEach((b) => { b.x = 200; b.y = 200; }); // todos longe, fora da zona
    m.player.x = 1500; m.player.y = 1500; // jogador dentro
    const before = m.bots[0].health;
    for (let i = 0; i < 20; i++) updateMatch(m, 0.05, input());
    assert.ok(m.bots[0].health < before, 'o bot fora da zona deveria perder vida');
    assert.equal(m.player.health, 100, 'o jogador dentro da zona não perde vida');
});

test('modo imortal protege o jogador da tempestade', () => {
    const m = createMatch({ seed: 12 });
    startPlaying(m);
    m.zone.current = { x: 100, y: 100, r: 50 };
    m.player.x = 2500; m.player.y = 2500;
    for (let i = 0; i < 40; i++) updateMatch(m, 0.05, input(), { immortal: true });
    assert.equal(m.player.health, 100);
});

// ---------- fim de jogo ----------

test('vitória: quando todos os bots são eliminados', () => {
    const m = createMatch({ seed: 14 });
    startPlaying(m);
    for (const b of m.bots) for (let i = 0; i < 5; i++) applyHit(m, b, m.player);
    updateMatch(m, 0.05, input());
    assert.equal(m.state, 'over');
    assert.equal(m.result.victory, true);
    assert.equal(aliveBots(m).length, 0);
});

test('derrota por tiro: guarda quem eliminou o jogador', () => {
    const m = createMatch({ seed: 15 });
    startPlaying(m);
    for (let i = 0; i < 5; i++) applyHit(m, m.player, m.bots[3]);
    updateMatch(m, 0.05, input());
    assert.equal(m.state, 'over');
    assert.equal(m.result.victory, false);
    assert.equal(m.result.reason, 'shot');
    assert.equal(m.result.killer, m.bots[3]);
});

test('derrota pela tempestade', () => {
    const m = createMatch({ seed: 16 });
    startPlaying(m);
    m.zone.current = { x: 100, y: 100, r: 30 };
    m.player.x = 2800; m.player.y = 2800; m.player.health = 0.5;
    for (let i = 0; i < 40 && m.state === 'playing'; i++) updateMatch(m, 0.05, input());
    assert.equal(m.state, 'over');
    assert.equal(m.result.reason, 'storm');
});

test('depois do fim, a partida congela (ninguém mais se mexe)', () => {
    const m = createMatch({ seed: 17 });
    startPlaying(m);
    for (let i = 0; i < 5; i++) applyHit(m, m.player, m.bots[0]);
    updateMatch(m, 0.05, input());
    const snapshot = JSON.stringify(m.bots.map((b) => [b.x, b.y]));
    for (let i = 0; i < 20; i++) updateMatch(m, 0.05, input({ keys: ['w'] }));
    assert.equal(JSON.stringify(m.bots.map((b) => [b.x, b.y])), snapshot);
});

// ---------- simulação longa (robustez) ----------

test('simulação longa: ninguém atravessa paredes, sai do mapa ou fica com valores inválidos', () => {
    const m = createMatch({ seed: 99 });
    startPlaying(m);
    for (let step = 0; step < 1600 && m.state === 'playing'; step++) {
        updateMatch(m, 0.05, input(), { immortal: true, timeScale: 4 });
        for (const b of m.bots) {
            if (!b.alive) continue;
            assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y), 'posição inválida');
            assert.ok(b.x >= 0 && b.x <= CONFIG.MAP_SIZE && b.y >= 0 && b.y <= CONFIG.MAP_SIZE, 'saiu do mapa');
            assert.ok(isFree(m.world, b.x, b.y, b.radius - 1.5), `bot dentro de parede no passo ${step}`);
        }
    }
});

test('simulação longa: os bots lutam entre si e a população diminui', () => {
    const m = createMatch({ seed: 7 });
    startPlaying(m);
    const start = aliveBots(m).length;
    for (let step = 0; step < 2400 && m.state === 'playing'; step++) {
        updateMatch(m, 0.05, input(), { immortal: true, timeScale: 6 });
    }
    assert.ok(aliveBots(m).length < start, 'ninguém foi eliminado em 2 minutos');
    assert.ok(m.events.length > 0);
});

// ---------- o tiro segue a câmera (e sai da arma) ----------

/** Partida limpa: um bot parado e o jogador em (1000, 1500) olhando para +x. */
function openField(seed = 40) {
    const m = createMatch({ seed });
    updateMatch(m, CONFIG.MATCH.countdown + 0.1, input());
    m.world.segments = [];
    m.world.circles = [];
    m.bots.forEach((b, i) => { b.alive = i === 0; b.deadTimer = 99; b.update = () => {}; });
    m.player.x = 1000; m.player.y = 1500; m.player.rotation = 0; m.player.pitch = 0;
    m.bots[0].x = 1300; m.bots[0].y = 1500;
    return m;
}

test('o tiro sai da boca do marcador: à frente, à direita e abaixo da câmera', () => {
    const m = openField();
    const ball = fireFromPlayer(m);
    assert.ok(ball.x > m.player.x + 30, 'a boca fica à frente do jogador');
    assert.ok(ball.y > m.player.y + 5, 'olhando para +x, a direita da tela é +y');
    assert.ok(ball.z < CONFIG.CAMERA_HEIGHT, 'a arma fica abaixo do olho');
    assert.equal(ball.z, CONFIG.COMBAT.muzzleHeight);
});

test('a tinta CRUZA A MIRA: na distância de convergência passa pelo ponto que a câmera enxerga', () => {
    const m = openField();
    m.player.pitch = 0.1;
    const ball = fireFromPlayer(m);
    const d = CONFIG.COMBAT.convergence;
    // anda a bolinha até o plano do ponto de convergência (d unidades à frente da câmera)
    while (ball.x < m.player.x + d * Math.cos(0.1) && ball.alive) stepPaintball(m.world, ball, 0.001, []);
    const wantZ = CONFIG.CAMERA_HEIGHT + Math.sin(0.1) * d;
    assert.ok(Math.abs(ball.y - m.player.y) < 2, `lateral fora da mira: ${ball.y - m.player.y}`);
    assert.ok(Math.abs(ball.z - wantZ) < 2, `altura ${ball.z.toFixed(1)} deveria ser ${wantZ.toFixed(1)}`);
});

test('olhar para cima faz o tiro subir; olhar para baixo faz descer', () => {
    const up = openField();
    up.player.pitch = 0.3;
    const bUp = fireFromPlayer(up);
    const down = openField();
    down.player.pitch = -0.3;
    const bDown = fireFromPlayer(down);
    assert.ok(bUp.pitch > 0.2, `o tiro deveria subir (${bUp.pitch})`);
    assert.ok(bDown.pitch < -0.2, `o tiro deveria descer (${bDown.pitch})`);
    stepPaintball(up.world, bUp, 0.2, []);
    stepPaintball(down.world, bDown, 0.2, []);
    assert.ok(bUp.z > CONFIG.COMBAT.muzzleHeight);
    assert.ok(bDown.z < CONFIG.COMBAT.muzzleHeight);
});

test('o tiro acompanha a direção horizontal da câmera', () => {
    const m = openField();
    m.player.rotation = Math.PI / 2; // olhando para +y
    const ball = fireFromPlayer(m);
    assert.ok(Math.abs(ball.angle - Math.PI / 2) < 0.05);
});

test('mirar para o alto com o bot à frente erra; mirar reto acerta', () => {
    const high = openField(41);
    high.player.pitch = 0.4;
    for (let t = 0; t < 1.5; t += 0.02) updateMatch(high, 0.02, input({ mouse: true }));
    assert.equal(high.bots[0].health, 100, 'o tiro para o alto não deveria acertar');

    const flat = openField(41);
    for (let t = 0; t < 1.2 && flat.bots[0].health === 100; t += 0.02) updateMatch(flat, 0.02, input({ mouse: true }));
    assert.ok(flat.bots[0].health < 100, 'o tiro reto deveria acertar');
});

test('tiro para baixo deixa um respingo no CHÃO', () => {
    const m = openField(42);
    m.player.pitch = -0.4;
    for (let t = 0; t < 1.2; t += 0.02) updateMatch(m, 0.02, input({ mouse: true }));
    assert.ok(m.decals.some((d) => d.floor), 'deveria haver respingo no chão');
});

test('o respingo na parede fica na altura em que a tinta bateu', () => {
    const m = openField(43);
    m.bots[0].alive = false;
    m.bots[1].alive = true; m.bots[1].x = 2900; m.bots[1].y = 2900; // mantém a partida viva
    m.world.segments = [{ x1: 1300, y1: 1000, x2: 1300, y2: 2000, len: 1000, nx: -1, ny: 0, obj: { height: 100 } }];
    m.player.pitch = 0.12;
    for (let t = 0; t < 0.8; t += 0.02) updateMatch(m, 0.02, input({ mouse: true }));
    const wallDecals = m.decals.filter((d) => !d.floor);
    assert.ok(wallDecals.length > 0);
    // a bolinha sai a 38 de altura e converge na mira (50 + sen(12 graus) * 520 = ~158 a 520 unidades):
    // a 300 unidades da câmera ela está entre 60 e 100, por isso o respingo fica na parte alta da parede
    for (const d of wallDecals) assert.ok(d.h > 40 && d.h <= 97, `respingo fora da altura esperada: ${d.h}`);
});
