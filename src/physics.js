// Física 2D (vista de cima) das paredes do campo: colisão com deslizamento, raios (para tiros e
// para desenhar) e linha de visão. Lógica pura, sem DOM, totalmente testável.
//
// Um "mundo" tem duas listas de colisores:
//   segments: paredes retas      { x1, y1, x2, y2, len, nx, ny, obj }
//   circles:  tambores/pilares   { x, y, r, obj }
// `obj` aponta de volta para o objeto do campo (cor, altura, tipo...).

/** Ponto do segmento mais próximo de (px, py). */
export function closestOnSegment(px, py, s) {
    const ex = s.x2 - s.x1;
    const ey = s.y2 - s.y1;
    const t = Math.max(0, Math.min(1, ((px - s.x1) * ex + (py - s.y1) * ey) / (s.len * s.len)));
    return { x: s.x1 + ex * t, y: s.y1 + ey * t };
}

/**
 * Empurra um círculo (x, y, radius) para fora de qualquer parede ou tambor em que esteja
 * encostando. O resultado "desliza": só a parte do movimento que entra na parede é cancelada.
 */
export function resolveCircle(x, y, radius, world, passes = 3) {
    let px = x;
    let py = y;
    for (let pass = 0; pass < passes; pass++) {
        for (const s of world.segments) {
            const c = closestOnSegment(px, py, s);
            const dx = px - c.x;
            const dy = py - c.y;
            const d = Math.hypot(dx, dy);
            if (d < radius) {
                if (d > 1e-9) {
                    px += (dx / d) * (radius - d);
                    py += (dy / d) * (radius - d);
                } else {
                    px += s.nx * radius; // o centro caiu exatamente sobre a parede
                    py += s.ny * radius;
                }
            }
        }
        for (const c of world.circles) {
            const dx = px - c.x;
            const dy = py - c.y;
            const d = Math.hypot(dx, dy);
            const min = radius + c.r;
            if (d < min) {
                if (d > 1e-9) {
                    px += (dx / d) * (min - d);
                    py += (dy / d) * (min - d);
                } else {
                    px += min;
                }
            }
        }
    }
    return { x: px, y: py };
}

/**
 * Move um círculo por (dx, dy) em passos curtos, resolvendo colisões a cada passo.
 * Sem isso, em alta velocidade o jogador poderia "pular" uma parede fina entre dois quadros.
 */
export function moveCircle(world, x, y, dx, dy, radius, maxStep = 6) {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / maxStep));
    let px = x;
    let py = y;
    for (let i = 0; i < steps; i++) {
        const next = resolveCircle(px + dx / steps, py + dy / steps, radius, world);
        px = next.x;
        py = next.y;
    }
    return { x: px, y: py };
}

/** O círculo cabe nesse ponto sem encostar em nada? */
export function isFree(world, x, y, radius) {
    for (const s of world.segments) {
        const c = closestOnSegment(x, y, s);
        if (Math.hypot(x - c.x, y - c.y) < radius) return false;
    }
    for (const c of world.circles) {
        if (Math.hypot(x - c.x, y - c.y) < radius + c.r) return false;
    }
    return true;
}

/**
 * Lança um raio de (ox, oy) na direção `angle` e devolve a primeira coisa atingida:
 *   { dist, obj, nx, ny, u }  -> distância, objeto, normal da superfície (virada para o raio)
 *                                e `u`, a posição ao longo da superfície (para a textura)
 * ou null se nada for atingido até `maxDist`.
 */
export function raycast(world, ox, oy, angle, maxDist = Infinity) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let bestT = maxDist;
    let best = null;

    for (const s of world.segments) {
        const ex = s.x2 - s.x1;
        const ey = s.y2 - s.y1;
        const denom = dx * ey - dy * ex;
        if (Math.abs(denom) < 1e-12) continue; // raio paralelo à parede
        const qx = s.x1 - ox;
        const qy = s.y1 - oy;
        const t = (qx * ey - qy * ex) / denom;
        const u = (qx * dy - qy * dx) / denom;
        if (t > 1e-6 && t < bestT && u >= 0 && u <= 1) {
            bestT = t;
            let nx = -ey / s.len;
            let ny = ex / s.len;
            if (nx * dx + ny * dy > 0) {
                nx = -nx;
                ny = -ny;
            }
            best = { dist: t, obj: s.obj, nx, ny, u: u * s.len };
        }
    }

    for (const c of world.circles) {
        const ocx = ox - c.x;
        const ocy = oy - c.y;
        const b = ocx * dx + ocy * dy;
        const disc = b * b - (ocx * ocx + ocy * ocy - c.r * c.r);
        if (disc < 0) continue;
        const t = -b - Math.sqrt(disc);
        if (t > 1e-6 && t < bestT) {
            bestT = t;
            const hx = ox + dx * t - c.x;
            const hy = oy + dy * t - c.y;
            best = { dist: t, obj: c.obj, nx: hx / c.r, ny: hy / c.r, u: Math.atan2(hy, hx) * c.r };
        }
    }
    return best;
}

/**
 * Em que distância (de 0 a `len`) o segmento que sai de (ox, oy) na direção unitária (dx, dy)
 * toca o círculo? Devolve `null` se não tocar; 0 se já começar dentro.
 */
export function rayCircle(ox, oy, dx, dy, len, cx, cy, r) {
    const ocx = ox - cx;
    const ocy = oy - cy;
    const c = ocx * ocx + ocy * ocy - r * r;
    if (c <= 0) return 0;
    const b = ocx * dx + ocy * dy;
    const disc = b * b - c;
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    return t >= 0 && t <= len ? t : null;
}

/**
 * Trecho [entra, sai] (distâncias de 0 a `len`) em que o segmento que sai de (ox, oy) na direção
 * unitária (dx, dy) está DENTRO do círculo. Devolve `null` se nunca entra.
 */
export function rayCircleSpan(ox, oy, dx, dy, len, cx, cy, r) {
    const ocx = ox - cx;
    const ocy = oy - cy;
    const b = ocx * dx + ocy * dy;
    const disc = b * b - (ocx * ocx + ocy * ocy - r * r);
    if (disc < 0) return null;
    const root = Math.sqrt(disc);
    const enter = -b - root;
    const exit = -b + root;
    if (exit < 0 || enter > len) return null;
    return [Math.max(0, enter), Math.min(len, exit)];
}

/** Há linha de visão livre entre os dois pontos (nenhuma parede no meio)? */
export function lineOfSight(world, ax, ay, bx, by) {
    const dist = Math.hypot(bx - ax, by - ay);
    if (dist < 1e-6) return true;
    return raycast(world, ax, ay, Math.atan2(by - ay, bx - ax), dist - 1e-3) === null;
}
