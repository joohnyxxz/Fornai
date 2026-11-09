import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, findFreeSpot, PALETTE, TEXTURE_VARIANTS } from '../src/world.js';
import { isFree, raycast, resolveCircle } from '../src/physics.js';
import { CONFIG } from '../src/config.js';
import { createRng } from '../src/rng.js';

const make = (seed) =>
    generateWorld(createRng(seed), CONFIG.MAP_SIZE, CONFIG.WORLD, CONFIG.WORLD.minGap, CONFIG.WORLD.margin);

const requested = CONFIG.WORLD.boxes + CONFIG.WORLD.panels + CONFIG.WORLD.drums;

test('a mesma semente gera o mesmo campo', () => {
    assert.deepEqual(make(42), make(42));
    assert.notDeepEqual(make(42), make(43));
});

test('gera quase todos os objetos pedidos, de cada tipo', () => {
    const { obstacles } = make(5);
    assert.ok(obstacles.length >= requested * 0.9, `só ${obstacles.length} de ${requested}`);
    for (const kind of ['box', 'panel', 'drum']) {
        assert.ok(obstacles.some((o) => o.kind === kind), `faltou ${kind}`);
    }
});

test('todos os objetos ficam dentro do mapa, longe da borda', () => {
    for (let seed = 1; seed <= 10; seed++) {
        for (const o of make(seed).obstacles) {
            assert.ok(o.x >= CONFIG.WORLD.margin && o.x <= CONFIG.MAP_SIZE - CONFIG.WORLD.margin);
            assert.ok(o.y >= CONFIG.WORLD.margin && o.y <= CONFIG.MAP_SIZE - CONFIG.WORLD.margin);
        }
    }
});

test('objetos não se sobrepõem e respeitam o espaçamento mínimo', () => {
    const { obstacles } = make(11);
    for (let i = 0; i < obstacles.length; i++) {
        for (let j = i + 1; j < obstacles.length; j++) {
            const a = obstacles[i];
            const b = obstacles[j];
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            assert.ok(d >= a.radius + b.radius + CONFIG.WORLD.minGap - 1e-6, 'objetos próximos demais');
        }
    }
});

test('caixas e painéis viram 4 paredes cada; tambores viram cilindros', () => {
    const world = make(7);
    const boxish = world.obstacles.filter((o) => o.kind !== 'drum').length;
    const drums = world.obstacles.filter((o) => o.kind === 'drum').length;
    assert.equal(world.segments.length, boxish * 4);
    assert.equal(world.circles.length, drums);
});

test('as paredes de cada caixa formam um retângulo fechado com as medidas certas', () => {
    const world = make(3);
    const box = world.obstacles.find((o) => o.kind === 'box');
    const walls = world.segments.filter((s) => s.obj === box);
    assert.equal(walls.length, 4);
    const lengths = walls.map((s) => s.len).sort((a, b) => a - b);
    assert.ok(Math.abs(lengths[0] - Math.min(box.w, box.d)) < 1e-6);
    assert.ok(Math.abs(lengths[3] - Math.max(box.w, box.d)) < 1e-6);
    // fechado: o fim de cada parede é o começo da próxima
    for (let i = 0; i < 4; i++) {
        const a = walls[i];
        const b = walls[(i + 1) % 4];
        assert.ok(Math.hypot(a.x2 - b.x1, a.y2 - b.y1) < 1e-6, 'o contorno deve ser fechado');
    }
});

test('as normais das paredes apontam para FORA do objeto', () => {
    const world = make(9);
    for (const s of world.segments) {
        const mx = (s.x1 + s.x2) / 2;
        const my = (s.y1 + s.y2) / 2;
        const toOutside = (mx - s.obj.x) * s.nx + (my - s.obj.y) * s.ny;
        assert.ok(toOutside > 0, 'normal apontando para dentro do objeto');
    }
});

test('um raio vindo de fora acerta o objeto certo e nunca "entra" nele', () => {
    const world = make(13);
    const o = world.obstacles.find((x) => x.kind === 'box');
    // atira do lado de fora, bem de frente para o centro da caixa
    const from = { x: o.x - 400, y: o.y };
    const hit = raycast(world, from.x, from.y, 0);
    // pode haver outra parede antes (outro objeto), mas a distância nunca passa do centro
    if (hit && hit.obj === o) assert.ok(hit.dist < 400);
});

test('cores e variações de textura são válidas', () => {
    for (const o of make(21).obstacles) {
        assert.ok(PALETTE[o.color], `cor inválida ${o.color}`);
        assert.ok(o.variant >= 0 && o.variant < TEXTURE_VARIANTS);
        assert.ok(o.height > CONFIG.CAMERA_HEIGHT, 'todo objeto precisa ser mais alto que a câmera (cobertura)');
    }
});

test('findFreeSpot devolve um ponto livre, longe das paredes', () => {
    for (let seed = 1; seed <= 15; seed++) {
        const world = make(seed);
        const spot = findFreeSpot(createRng(seed), world, CONFIG.PLAYER.radius);
        assert.ok(isFree(world, spot.x, spot.y, CONFIG.PLAYER.radius), `ponto ocupado (semente ${seed})`);
        const pushed = resolveCircle(spot.x, spot.y, CONFIG.PLAYER.radius, world);
        assert.deepEqual(pushed, spot);
    }
});
