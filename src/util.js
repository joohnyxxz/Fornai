// Funções matemáticas pequenas usadas em vários módulos.
const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Diferença entre dois ângulos, sempre no intervalo [-PI, PI] (o caminho mais curto). */
export function angleDiff(a, b) {
    let d = (a - b) % TAU;
    if (d > Math.PI) d -= TAU;
    else if (d < -Math.PI) d += TAU;
    return d;
}

export const distance = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

/** Sorteia um número em [min, max] com a função aleatória `rng`. */
export const between = (rng, [min, max]) => min + rng() * (max - min);
