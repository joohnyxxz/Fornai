import test from 'node:test';
import assert from 'node:assert/strict';
import { Zone } from '../src/zone.js';
import { CONFIG } from '../src/config.js';
import { createRng } from '../src/rng.js';

const newZone = (seed = 1) => new Zone(CONFIG.ZONE, CONFIG.MAP_SIZE, createRng(seed));

test('a zona começa grande, no centro do mapa, esperando', () => {
    const z = newZone();
    assert.equal(z.current.r, CONFIG.ZONE.startRadius);
    assert.equal(z.current.x, CONFIG.MAP_SIZE / 2);
    assert.equal(z.stage, 'waiting');
    assert.equal(z.timer, CONFIG.ZONE.phases[0].wait);
});

test('o raio não muda durante a espera e passa a encolher depois dela', () => {
    const z = newZone();
    z.update(CONFIG.ZONE.phases[0].wait - 1);
    assert.equal(z.current.r, CONFIG.ZONE.startRadius);
    assert.equal(z.stage, 'waiting');

    z.update(1.0001);
    assert.equal(z.stage, 'shrinking');

    z.update(CONFIG.ZONE.phases[0].shrink / 2);
    assert.ok(z.current.r < CONFIG.ZONE.startRadius);
    assert.ok(z.current.r > CONFIG.ZONE.phases[0].radius);
});

test('o raio só diminui e chega ao raio de cada fase', () => {
    const z = newZone(7);
    let previous = z.current.r;
    const radiiAtPhaseEnd = [];
    let lastPhase = 0;

    for (let t = 0; t < 600 && !z.done; t += 0.25) {
        z.update(0.25);
        assert.ok(z.current.r <= previous + 1e-9, 'o raio nunca pode crescer');
        previous = z.current.r;
        if (z.phaseIndex !== lastPhase) {
            radiiAtPhaseEnd.push(z.current.r);
            lastPhase = z.phaseIndex;
        }
    }

    assert.ok(z.done, 'a zona deve terminar');
    assert.equal(z.current.r, CONFIG.ZONE.phases.at(-1).radius);
    CONFIG.ZONE.phases.slice(0, -1).forEach((phase, i) => {
        assert.ok(Math.abs(radiiAtPhaseEnd[i] - phase.radius) < 1e-6);
    });
});

test('cada zona nova fica totalmente dentro da anterior (várias sementes)', () => {
    for (let seed = 1; seed <= 25; seed++) {
        const z = newZone(seed);
        let prev = { ...z.current };
        let seenPhase = -1;
        for (let t = 0; t < 600 && !z.done; t += 0.5) {
            if (z.phaseIndex !== seenPhase) {
                seenPhase = z.phaseIndex;
                const d = Math.hypot(z.target.x - prev.x, z.target.y - prev.y);
                assert.ok(d + z.target.r <= prev.r + 1e-6, `fase ${seenPhase}, semente ${seed}`);
                prev = { ...z.target };
            }
            z.update(0.5);
        }
    }
});

test('o dano por segundo aumenta a cada fase', () => {
    const z = newZone();
    const dps = [z.damagePerSecond];
    for (let t = 0; t < 600 && !z.done; t += 0.5) {
        z.update(0.5);
        if (dps.at(-1) !== z.damagePerSecond) dps.push(z.damagePerSecond);
    }
    assert.deepEqual(dps, CONFIG.ZONE.phases.map((p) => p.dps));
});

test('o tempo total é a soma de esperas e encolhimentos', () => {
    const total = CONFIG.ZONE.phases.reduce((sum, p) => sum + p.wait + p.shrink, 0);
    const z = newZone();
    z.update(total - 0.01);
    assert.equal(z.done, false);
    z.update(0.02);
    assert.equal(z.done, true);
});

test('isOutside e distanceToEdge usam o círculo atual', () => {
    const z = newZone();
    const c = z.current;
    assert.equal(z.isOutside(c.x, c.y), false);
    assert.equal(z.isOutside(c.x + c.r + 1, c.y), true);
    assert.ok(Math.abs(z.distanceToEdge(c.x + c.r + 50, c.y) - 50) < 1e-9);
    assert.ok(z.distanceToEdge(c.x, c.y) < 0);
});

test('um passo de tempo grande atravessa várias fases sem travar', () => {
    const z = newZone();
    z.update(10000);
    assert.equal(z.done, true);
    assert.equal(z.current.r, CONFIG.ZONE.phases.at(-1).radius);
});
