import test from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/player.js';
import { CONFIG } from '../src/config.js';

const emptyWorld = { obstacles: [], segments: [], circles: [] };

function fakeInput(keys = [], look = 0) {
    const set = new Set(keys);
    return { isDown: (k) => set.has(k), consumeLook: () => look };
}

function makePlayer(rotation = 0) {
    const p = new Player(1500, 1500);
    p.rotation = rotation;
    return p;
}

const walk = CONFIG.PLAYER.walkSpeed;

test('W anda para frente e S para trás (olhando para +x)', () => {
    const p = makePlayer(0);
    p.update(1, fakeInput(['w']), emptyWorld);
    assert.ok(Math.abs(p.x - (1500 + walk)) < 1e-6 && Math.abs(p.y - 1500) < 1e-6);
    p.update(2, fakeInput(['s']), emptyWorld);
    assert.ok(Math.abs(p.x - (1500 - walk)) < 1e-6);
});

test('D anda para a direita e A para a esquerda, SEM girar a câmera', () => {
    // olhando para +x, a direita da tela é +y (mesma convenção do renderizador)
    const p = makePlayer(0);
    p.update(1, fakeInput(['d']), emptyWorld);
    assert.ok(Math.abs(p.y - (1500 + walk)) < 1e-6 && Math.abs(p.x - 1500) < 1e-6, 'D deve ir para a direita');
    assert.equal(p.rotation, 0, 'D não pode girar a câmera');

    const q = makePlayer(0);
    q.update(1, fakeInput(['a']), emptyWorld);
    assert.ok(Math.abs(q.y - (1500 - walk)) < 1e-6, 'A deve ir para a esquerda');
    assert.equal(q.rotation, 0, 'A não pode girar a câmera');
});

test('os movimentos laterais acompanham para onde a câmera olha', () => {
    // olhando para +y (90 graus): frente = +y, direita = -x
    const p = makePlayer(Math.PI / 2);
    p.update(1, fakeInput(['d']), emptyWorld);
    assert.ok(Math.abs(p.x - (1500 - walk)) < 1e-6 && Math.abs(p.y - 1500) < 1e-6);
});

test('andar na diagonal não é mais rápido que andar reto', () => {
    const p = makePlayer(0);
    p.update(1, fakeInput(['w', 'd']), emptyWorld);
    const distance = Math.hypot(p.x - 1500, p.y - 1500);
    assert.ok(Math.abs(distance - walk) < 1e-6, `distância ${distance} deveria ser ${walk}`);
});

test('Shift corre mais rápido', () => {
    const p = makePlayer(0);
    p.update(1, fakeInput(['w', 'shift']), emptyWorld);
    assert.ok(Math.abs(p.x - (1500 + CONFIG.PLAYER.runSpeed)) < 1e-6);
});

test('arrastar o mouse (botão direito) gira a câmera, sem mover o jogador', () => {
    const p = makePlayer(0);
    p.update(0.016, fakeInput([], 100), emptyWorld);
    assert.ok(Math.abs(p.rotation - 100 * CONFIG.PLAYER.mouseSensitivity) < 1e-9);
    assert.equal(p.x, 1500);
    assert.equal(p.y, 1500);

    const q = makePlayer(0);
    q.update(0.016, fakeInput([], -50), emptyWorld);
    assert.ok(q.rotation < 0, 'arrastar para a esquerda gira para a esquerda');
});

test('A e D sozinhos nunca mudam a rotação', () => {
    const p = makePlayer(1.234);
    for (let i = 0; i < 30; i++) p.update(0.016, fakeInput(['a', 'd']), emptyWorld);
    assert.equal(p.rotation, 1.234);
});

test('o jogador não atravessa obstáculos nem sai do mapa', () => {
    const tambor = { obstacles: [], segments: [], circles: [{ x: 1600, y: 1500, r: 50, obj: {} }] };
    const p = makePlayer(0);
    p.update(1, fakeInput(['w']), tambor);
    assert.ok(Math.hypot(p.x - 1600, p.y - 1500) >= 50 + CONFIG.PLAYER.radius - 1e-6);

    const edge = new Player(10, 10);
    edge.rotation = Math.PI; // olhando para -x
    edge.update(5, fakeInput(['w']), emptyWorld);
    assert.ok(edge.x >= 0 && edge.y >= 0);
});

test('o jogador desliza ao longo de uma parede em vez de parar', () => {
    // parede vertical em x=1560 (de y=1300 a y=1700); o jogador anda na diagonal contra ela
    const len = 400;
    const parede = {
        obstacles: [],
        circles: [],
        segments: [{ x1: 1560, y1: 1300, x2: 1560, y2: 1700, len, nx: 1, ny: 0, obj: {} }],
    };
    const p = makePlayer(Math.PI / 4); // olhando na diagonal (+x, +y)
    p.update(0.5, fakeInput(['w']), parede);
    assert.ok(p.x <= 1560 - CONFIG.PLAYER.radius + 1e-6, 'não pode atravessar a parede');
    assert.ok(p.y > 1500 + 20, `deveria deslizar para +y (y=${p.y})`);
});

test('em alta velocidade o jogador não atravessa uma parede fina', () => {
    const parede = {
        obstacles: [],
        circles: [],
        segments: [{ x1: 1700, y1: 1000, x2: 1700, y2: 2000, len: 1000, nx: -1, ny: 0, obj: {} }],
    };
    const p = makePlayer(0);
    p.update(0.05, fakeInput(['w', 'shift']), parede); // quadro "longo" (50 ms)
    p.x = 1690; // encosta na parede
    for (let i = 0; i < 40; i++) p.update(0.05, fakeInput(['w', 'shift']), parede);
    assert.ok(p.x < 1700, `atravessou a parede: x=${p.x}`);
});
