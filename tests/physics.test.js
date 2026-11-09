import test from 'node:test';
import assert from 'node:assert/strict';
import {
    resolveCircle, moveCircle, isFree, raycast, lineOfSight, closestOnSegment,
} from '../src/physics.js';

// Monta uma parede reta de (x1,y1) a (x2,y2)
function wall(x1, y1, x2, y2) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    return { x1, y1, x2, y2, len, nx: (y2 - y1) / len, ny: -(x2 - x1) / len, obj: { name: 'parede' } };
}
const world = (segments = [], circles = []) => ({ segments, circles });

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// ---------- colisão ----------

test('closestOnSegment limita o ponto às pontas do segmento', () => {
    const s = wall(0, 0, 100, 0);
    assert.deepEqual(closestOnSegment(50, 30, s), { x: 50, y: 0 });
    assert.deepEqual(closestOnSegment(-40, 10, s), { x: 0, y: 0 });
    assert.deepEqual(closestOnSegment(160, -5, s), { x: 100, y: 0 });
});

test('resolveCircle empurra o círculo para fora da parede', () => {
    const w = world([wall(0, 0, 100, 0)]);
    const out = resolveCircle(50, 5, 18, w); // 5 de distância: dentro do raio de 18
    assert.ok(near(out.x, 50));
    assert.ok(near(out.y, 18), `y deveria ser 18, foi ${out.y}`);
});

test('resolveCircle não mexe em quem está livre', () => {
    const w = world([wall(0, 0, 100, 0)], [{ x: 300, y: 300, r: 30, obj: {} }]);
    assert.deepEqual(resolveCircle(50, 80, 18, w), { x: 50, y: 80 });
});

test('resolveCircle trata a ponta (canto) da parede como um ponto arredondado', () => {
    const w = world([wall(0, 0, 100, 0)]);
    const out = resolveCircle(108, 6, 18, w); // perto da ponta direita
    assert.ok(Math.hypot(out.x - 100, out.y - 0) >= 18 - 1e-6);
});

test('resolveCircle empurra de cilindros (tambores)', () => {
    const w = world([], [{ x: 100, y: 100, r: 30, obj: {} }]);
    const out = resolveCircle(120, 100, 18, w);
    assert.ok(Math.hypot(out.x - 100, out.y - 100) >= 48 - 1e-6);
});

test('o centro exatamente sobre a parede é empurrado pela normal, sem travar', () => {
    const w = world([wall(0, 0, 100, 0)]);
    const out = resolveCircle(50, 0, 18, w);
    assert.ok(Number.isFinite(out.x) && Number.isFinite(out.y));
    assert.ok(Math.hypot(out.x - 50, out.y) >= 18 - 1e-6);
});

// ---------- movimento (deslizar e não atravessar) ----------

test('ao andar contra a parede o jogador DESLIZA ao longo dela', () => {
    // parede horizontal em y=100; jogador em y=70 anda na diagonal para baixo e para a direita
    const w = world([wall(0, 100, 400, 100)]);
    const p = moveCircle(w, 100, 70, 60, 60, 18);
    assert.ok(p.y <= 100 - 18 + 1e-6, 'não pode atravessar a parede');
    assert.ok(p.x > 100 + 40, `deveria deslizar para a direita (x=${p.x})`);
});

test('em alta velocidade o jogador não atravessa uma parede fina (sem "tunelamento")', () => {
    const w = world([wall(0, 100, 400, 100)]);
    // um único passo de 300 unidades direto contra uma parede de espessura zero
    const p = moveCircle(w, 200, 20, 0, 300, 18);
    assert.ok(p.y <= 100, `atravessou a parede: y=${p.y}`);
});

test('andar em campo aberto move exatamente o pedido', () => {
    const p = moveCircle(world(), 10, 10, 25, -5, 18);
    assert.ok(near(p.x, 35) && near(p.y, 5));
});

test('isFree detecta paredes e tambores', () => {
    const w = world([wall(0, 0, 100, 0)], [{ x: 200, y: 200, r: 30, obj: {} }]);
    assert.equal(isFree(w, 50, 60, 18), true);
    assert.equal(isFree(w, 50, 10, 18), false);
    assert.equal(isFree(w, 200, 240, 18), false);
    assert.equal(isFree(w, 200, 260, 18), true);
});

// ---------- raios (tiros e renderização) ----------

test('raycast acerta a parede na distância e com a normal corretas', () => {
    const w = world([wall(100, -50, 100, 50)]); // parede vertical em x=100
    const hit = raycast(w, 0, 0, 0); // atira para +x
    assert.ok(hit, 'deveria acertar');
    assert.ok(near(hit.dist, 100));
    assert.ok(near(hit.nx, -1) && near(hit.ny, 0), 'a normal aponta de volta para quem atirou');
    assert.ok(near(hit.u, 50), 'u é a posição ao longo da parede');
    assert.equal(hit.obj.name, 'parede');
});

test('raycast devolve a normal virada para o raio, de qualquer lado', () => {
    const w = world([wall(100, -50, 100, 50)]);
    const fromRight = raycast(w, 200, 0, Math.PI);
    assert.ok(near(fromRight.nx, 1) && near(fromRight.dist, 100));
});

test('raycast erra quando passa pela ponta ou é paralelo', () => {
    const w = world([wall(100, -50, 100, 50)]);
    assert.equal(raycast(w, 0, 80, 0), null, 'passa acima da parede');
    assert.equal(raycast(w, 100, 200, -Math.PI / 2 - 0.0), null, 'paralelo à parede');
    assert.equal(raycast(w, 0, 0, Math.PI), null, 'atirando para o lado oposto');
});

test('raycast respeita a distância máxima', () => {
    const w = world([wall(100, -50, 100, 50)]);
    assert.equal(raycast(w, 0, 0, 0, 80), null);
    assert.ok(raycast(w, 0, 0, 0, 120));
});

test('raycast devolve o objeto MAIS PRÓXIMO quando há vários na frente', () => {
    const far = wall(300, -50, 300, 50);
    far.obj = { name: 'longe' };
    const close = wall(120, -50, 120, 50);
    close.obj = { name: 'perto' };
    const hit = raycast(world([far, close]), 0, 0, 0);
    assert.equal(hit.obj.name, 'perto');
    assert.ok(near(hit.dist, 120));
});

test('raycast acerta cilindros', () => {
    const w = world([], [{ x: 100, y: 0, r: 20, obj: { name: 'tambor' } }]);
    const hit = raycast(w, 0, 0, 0);
    assert.ok(near(hit.dist, 80));
    assert.ok(near(hit.nx, -1));
    assert.equal(hit.obj.name, 'tambor');
    assert.equal(raycast(w, 0, 30, 0), null, 'passa raspando fora do cilindro');
});

test('raycast na diagonal calcula a distância real', () => {
    const w = world([wall(100, -200, 100, 200)]);
    const hit = raycast(w, 0, 0, Math.PI / 4); // 45 graus
    assert.ok(near(hit.dist, 100 * Math.SQRT2, 1e-6));
});

// ---------- linha de visão ----------

test('lineOfSight: parede no meio bloqueia, sem parede enxerga', () => {
    const w = world([wall(100, -50, 100, 50)]);
    assert.equal(lineOfSight(w, 0, 0, 200, 0), false, 'a parede está entre os dois');
    assert.equal(lineOfSight(w, 0, 0, 90, 0), true, 'o alvo está antes da parede');
    assert.equal(lineOfSight(w, 0, 100, 200, 100), true, 'passa por cima da ponta da parede');
    assert.equal(lineOfSight(world(), 0, 0, 500, 500), true);
});

test('lineOfSight é simétrica', () => {
    const w = world([wall(100, -50, 100, 50)], [{ x: 300, y: 300, r: 40, obj: {} }]);
    const pairs = [[0, 0, 200, 0], [0, 0, 400, 400], [10, 250, 500, 350], [0, 0, 50, 50]];
    for (const [ax, ay, bx, by] of pairs) {
        assert.equal(lineOfSight(w, ax, ay, bx, by), lineOfSight(w, bx, by, ax, ay));
    }
});
