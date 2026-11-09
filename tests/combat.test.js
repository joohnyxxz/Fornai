import test from 'node:test';
import assert from 'node:assert/strict';
import { Paintball, stepPaintball } from '../src/combat.js';
import { rayCircle } from '../src/physics.js';
import { CONFIG } from '../src/config.js';

function wall(x1, y1, x2, y2) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    return { x1, y1, x2, y2, len, nx: (y2 - y1) / len, ny: -(x2 - x1) / len, obj: { height: 100 } };
}
const world = (segments = []) => ({ segments, circles: [], obstacles: [], mapSize: 3000 });
const target = (x, y, extra = {}) => ({ x, y, radius: 18, alive: true, ...extra });
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// ---------- rayCircle ----------

test('rayCircle: distância até o círculo, null se errar, 0 se já está dentro', () => {
    assert.ok(near(rayCircle(0, 0, 1, 0, 500, 100, 0, 20), 80));
    assert.equal(rayCircle(0, 0, 1, 0, 500, 100, 50, 20), null, 'passa longe');
    assert.equal(rayCircle(0, 0, 1, 0, 50, 100, 0, 20), null, 'o trecho termina antes');
    assert.equal(rayCircle(100, 0, 1, 0, 50, 100, 0, 20), 0, 'já começa dentro');
    assert.equal(rayCircle(0, 0, -1, 0, 500, 100, 0, 20), null, 'indo para o lado oposto');
});

// ---------- bolinha de tinta ----------

test('a bolinha voa em linha reta na velocidade configurada', () => {
    const ball = new Paintball(0, 0, 0, null, '#fff');
    const res = stepPaintball(world(), ball, 0.1, []);
    assert.equal(res, null);
    assert.ok(near(ball.x, CONFIG.COMBAT.paintballSpeed * 0.1));
    assert.ok(near(ball.y, 0));
});

test('a bolinha acerta um jogador no caminho e para nele', () => {
    const owner = target(0, 0);
    const victim = target(300, 0);
    const ball = new Paintball(0, 0, 0, owner, '#fff');
    let res = null;
    for (let i = 0; i < 10 && !res; i++) res = stepPaintball(world(), ball, 0.1, [owner, victim]);
    assert.equal(res.type, 'hit');
    assert.equal(res.target, victim);
    assert.equal(ball.alive, false);
    assert.ok(Math.abs(ball.x - (300 - 18)) < 1e-6, 'para na borda do jogador');
});

test('a bolinha nunca acerta quem atirou', () => {
    const owner = target(0, 0);
    const ball = new Paintball(0, 0, 0, owner, '#fff');
    const res = stepPaintball(world(), ball, 0.05, [owner]);
    assert.equal(res, null);
});

test('jogador eliminado não é mais acertado', () => {
    const dead = target(300, 0, { alive: false });
    const ball = new Paintball(0, 0, 0, null, '#fff');
    let res = null;
    for (let i = 0; i < 4 && !res; i++) res = stepPaintball(world(), ball, 0.1, [dead]);
    assert.notEqual(res && res.type, 'hit');
});

test('a bolinha bate na parede e informa o objeto e a normal', () => {
    const w = world([wall(200, -100, 200, 100)]);
    const ball = new Paintball(0, 0, 0, null, '#fff');
    let res = null;
    for (let i = 0; i < 10 && !res; i++) res = stepPaintball(w, ball, 0.1, []);
    assert.equal(res.type, 'wall');
    assert.ok(near(ball.x, 200, 1e-6));
    assert.ok(near(res.nx, -1) && near(res.ny, 0), 'normal virada para quem atirou');
    assert.equal(res.obj.height, 100);
});

test('uma parede entre o atirador e o alvo PROTEGE o alvo (cobertura)', () => {
    const w = world([wall(200, -100, 200, 100)]);
    const victim = target(400, 0);
    const ball = new Paintball(0, 0, 0, null, '#fff');
    const seen = [];
    for (let i = 0; i < 20 && ball.alive; i++) {
        const res = stepPaintball(w, ball, 0.05, [victim]);
        if (res) seen.push(res.type);
    }
    assert.deepEqual(seen, ['wall']);
});

test('o que está MAIS PERTO vale: alvo na frente da parede é acertado', () => {
    const w = world([wall(300, -100, 300, 100)]);
    const victim = target(150, 0);
    const ball = new Paintball(0, 0, 0, null, '#fff');
    let res = null;
    for (let i = 0; i < 10 && !res; i++) res = stepPaintball(w, ball, 0.1, [victim]);
    assert.equal(res.type, 'hit');
});

test('um quadro longo (passo grande) não deixa a bolinha atravessar a parede', () => {
    const w = world([wall(400, -50, 400, 50)]);
    const ball = new Paintball(0, 0, 0, null, '#fff');
    const res = stepPaintball(w, ball, 1.0, []); // 900 unidades de uma vez
    assert.equal(res.type, 'wall');
});

test('a bolinha cai depois do tempo de vida', () => {
    const ball = new Paintball(0, 0, 0, null, '#fff');
    let res = null;
    let steps = 0;
    while (!res && steps < 200) {
        res = stepPaintball(world(), ball, 0.1, []);
        steps++;
    }
    assert.equal(res.type, 'expired');
    assert.ok(steps * 0.1 >= CONFIG.COMBAT.paintballLife - 0.1);
});

test('tiro na diagonal acerta o alvo certo', () => {
    const victim = target(300, 300);
    const ball = new Paintball(0, 0, Math.PI / 4, null, '#fff');
    let res = null;
    for (let i = 0; i < 20 && !res; i++) res = stepPaintball(world(), ball, 0.05, [victim]);
    assert.equal(res.type, 'hit');
});

// ---------- tiro em 3D (altura e inclinação) ----------

/** Voa a bolinha até acontecer algo (ou acabar) e devolve o resultado. */
function fly(w, ball, targets = [], dt = 0.02) {
    let res = null;
    for (let i = 0; i < 400 && !res; i++) res = stepPaintball(w, ball, dt, targets);
    return res;
}

test('tiro para CIMA passa por cima de um jogador (a bolinha sobe e não acerta o corpo)', () => {
    const victim = target(300, 0);
    const ball = new Paintball(0, 0, 0, null, '#fff', { z: 38, pitch: 0.35 }); // sobe bastante
    const res = fly(world(), ball, [victim]);
    assert.notEqual(res.type, 'hit', 'a bolinha deveria passar por cima da cabeça');
});

test('tiro reto na altura do peito acerta o jogador', () => {
    const victim = target(300, 0);
    const ball = new Paintball(0, 0, 0, null, '#fff', { z: 38, pitch: 0 });
    const res = fly(world(), ball, [victim]);
    assert.equal(res.type, 'hit');
    assert.ok(res.z > 0 && res.z <= CONFIG.COMBAT.entityHeight, `altura do acerto: ${res.z}`);
});

test('tiro para BAIXO bate no chão antes de chegar ao jogador distante', () => {
    const victim = target(600, 0);
    const ball = new Paintball(0, 0, 0, null, '#fff', { z: 38, pitch: -0.2 });
    const res = fly(world(), ball, [victim]);
    assert.equal(res.type, 'ground');
    assert.ok(res.x < 600 - 18, 'deveria cair antes do alvo');
    assert.equal(ball.z, 0);
});

test('tiro para baixo ainda acerta quem está perto (a bolinha ainda está na altura do corpo)', () => {
    const victim = target(120, 0);
    const ball = new Paintball(0, 0, 0, null, '#fff', { z: 38, pitch: -0.1 });
    const res = fly(world(), ball, [victim]);
    assert.equal(res.type, 'hit');
});

test('a inclinação sobe ou desce a bolinha na proporção certa', () => {
    const up = new Paintball(0, 0, 0, null, '#fff', { z: 38, pitch: Math.PI / 6 }); // 30 graus
    stepPaintball(world(), up, 0.1, []);
    const horizontal = up.x;
    assert.ok(Math.abs((up.z - 38) / horizontal - Math.tan(Math.PI / 6)) < 1e-6, 'a razão subida/avanço deve ser tan(inclinação)');
    // a velocidade total continua a mesma
    assert.ok(Math.abs(Math.hypot(horizontal, up.z - 38) - CONFIG.COMBAT.paintballSpeed * 0.1) < 1e-6);
});

test('a bolinha passa POR CIMA de uma parede baixa quando está mais alta que ela', () => {
    const low = wall(200, -100, 200, 100);
    low.obj = { height: 40 }; // parede baixa
    const ball = new Paintball(0, 0, 0, null, '#fff', { z: 38, pitch: 0.2 }); // já estará bem acima de 40 ao chegar
    const res = fly(world([low]), ball);
    assert.notEqual(res.type, 'wall', 'deveria passar por cima');
});

test('a bolinha bate na parede quando está mais baixa que o topo dela, e guarda a altura do respingo', () => {
    const tall = wall(200, -100, 200, 100);
    tall.obj = { height: 100 };
    const ball = new Paintball(0, 0, 0, null, '#fff', { z: 38, pitch: 0.1 });
    const res = fly(world([tall]), ball);
    assert.equal(res.type, 'wall');
    assert.ok(Math.abs(res.z - (38 + Math.tan(0.1) * 200)) < 1e-6, `altura do respingo: ${res.z}`);
});

test('depois de passar por cima de uma parede baixa, a bolinha ainda pode bater numa parede alta atrás', () => {
    const low = wall(150, -100, 150, 100);
    low.obj = { height: 30 };
    const high = wall(400, -100, 400, 100);
    high.obj = { height: 200 };
    const ball = new Paintball(0, 0, 0, null, '#fff', { z: 38, pitch: 0.05 });
    const res = fly(world([low, high]), ball);
    assert.equal(res.type, 'wall');
    assert.equal(res.obj.height, 200);
});

test('uma bolinha que sobe para sempre apenas expira, sem acertar nada', () => {
    const ball = new Paintball(0, 0, 0, null, '#fff', { z: 38, pitch: 0.6 });
    const res = fly(world(), ball);
    assert.equal(res.type, 'expired');
});
