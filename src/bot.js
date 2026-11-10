// Bots: inteligência artificial dos adversários. Lógica pura (sem DOM), testável.
//
// Estados:
//   roam        patrulha pontos dentro da zona segura
//   investigate vai até onde viu ou levou tiro por último
//   combat      tem um alvo visível: mantém distância, anda de lado e atira
//   cover       procura um ponto onde o inimigo não o enxerga, espera e depois "espia"
//   storm       está na tempestade (ou em área que vai fechar): corre para a zona segura
import { CONFIG } from './config.js';
import { moveCircle, lineOfSight, raycast, isFree } from './physics.js';
import { angleDiff, between, clamp } from './util.js';

const TAU = Math.PI * 2;

/**
 * Procura um ponto de cobertura: perto de `from` e SEM linha de visão para `threat`
 * (ou seja, com uma parede no meio). Devolve { x, y } ou null.
 */
export function findCover(world, rng, from, threat, radius = 320) {
    let best = null;
    let bestCost = Infinity;
    for (let i = 0; i < 28; i++) {
        const angle = rng() * TAU;
        const dist = 70 + rng() * (radius - 70);
        const x = from.x + Math.cos(angle) * dist;
        const y = from.y + Math.sin(angle) * dist;
        if (x < 60 || y < 60 || x > world.mapSize - 60 || y > world.mapSize - 60) continue;
        if (!isFree(world, x, y, CONFIG.COMBAT.entityRadius + 8)) continue;
        if (lineOfSight(world, threat.x, threat.y, x, y)) continue; // o inimigo ainda o veria
        // prefere pontos perto do bot e longe do inimigo
        const cost = dist - 0.15 * Math.hypot(x - threat.x, y - threat.y);
        if (cost < bestCost) {
            bestCost = cost;
            best = { x, y };
        }
    }
    return best;
}

export class Bot {
    constructor(id, x, y, color, rng) {
        this.kind = 'bot';
        this.id = id;
        this.x = x;
        this.y = y;
        this.color = color;
        this.radius = CONFIG.COMBAT.entityRadius;
        this.rotation = rng() * TAU; // para onde o personagem olha
        this.maxHealth = CONFIG.BOT.maxHealth;
        this.health = this.maxHealth;
        this.alive = true;

        this.skill = 0.75 + rng() * 0.5; // quanto maior, mais rápido e preciso
        this.state = 'roam';
        this.target = null;
        this.threat = null; // { x, y, t } último lugar de onde veio perigo
        this.cover = null;
        this.waypoint = null;
        this.avoidSign = rng() < 0.5 ? -1 : 1;
        this.strafeDir = rng() < 0.5 ? -1 : 1;

        // temporizadores
        this.sightTimer = rng() * 0.15;
        this.decideTimer = rng() * 0.25;
        this.reactionTimer = 0;
        this.fireTimer = 1 + rng() * 1.5;
        this.holdTimer = -1;
        this.coverCooldown = 0;
        this.strafeTimer = 0;
        this.waypointTimer = 0;
        this.checkTimer = 0.6;
        this.lastX = x;
        this.lastY = y;
        this.stuckCount = 0;

        // animação (usada só pela renderização)
        this.moving = false;
        this.walkPhase = 0;
        this.hitTimer = 0;
        this.shootTimer = 0;
        this.deadTimer = 0;
    }

    /**
     * @param {number} dt segundos
     * @param {{world:object, zone:object, rng:()=>number, enemies:object[], shoot:(angle:number, pitch:number)=>void}} ctx
     */
    update(dt, ctx) {
        if (!this.alive) {
            this.deadTimer += dt;
            return;
        }
        this.hitTimer = Math.max(0, this.hitTimer - dt);
        this.shootTimer = Math.max(0, this.shootTimer - dt);
        this.fireTimer -= dt;
        this.reactionTimer -= dt;
        this.coverCooldown -= dt;
        this.strafeTimer -= dt;
        this.waypointTimer -= dt;
        if (this.threat) this.threat.t += dt;

        this.sightTimer -= dt;
        if (this.sightTimer <= 0) {
            this.sightTimer = 0.12 + ctx.rng() * 0.06;
            this._perceive(ctx);
        }
        this.decideTimer -= dt;
        if (this.decideTimer <= 0) {
            this.decideTimer = 0.2 + ctx.rng() * 0.1;
            this._decide(ctx);
        }

        this.moving = false;
        this._act(dt, ctx);
        this._shoot(ctx);
        this._checkStuck(dt, ctx);
    }

    // ----- percepção: o bot só "vê" quem está ao alcance E sem parede no meio -----
    _perceive(ctx) {
        const cfg = CONFIG.BOT;
        let best = null;
        let bestDist = cfg.sight;
        for (const e of ctx.enemies) {
            if (!e.alive) continue;
            const d = Math.hypot(e.x - this.x, e.y - this.y);
            if (d < bestDist && lineOfSight(ctx.world, this.x, this.y, e.x, e.y)) {
                best = e;
                bestDist = d;
            }
        }
        if (best) {
            if (this.target !== best) {
                this.target = best;
                this.reactionTimer = between(ctx.rng, cfg.reaction) / this.skill; // demora para reagir
            }
            this.threat = { x: best.x, y: best.y, t: 0 };
        } else {
            this.target = null;
        }
    }

    // ----- decisão: escolhe o estado -----
    _decide(ctx) {
        const cfg = CONFIG.BOT;
        const { zone, rng } = ctx;

        // 1) Tempestade (ou área que vai fechar) tem prioridade
        const edge = zone.distanceToEdge(this.x, this.y);
        const next = zone.target;
        const outsideNext = Math.hypot(this.x - next.x, this.y - next.y) > next.r - 60;
        const closingSoon = !zone.done && (zone.stage === 'shrinking' || zone.timer < 12);
        if (edge > -50 || (closingSoon && outsideNext)) {
            this.state = 'storm';
            return;
        }

        // 2) Ferido e ameaçado: procura cobertura
        const threatened = this.threat && this.threat.t < 6;
        if (this.health < cfg.retreatHealth && threatened && this.state !== 'cover') {
            this._enterCover(ctx);
            if (this.state === 'cover') return;
        }
        if (this.state === 'cover') {
            if (this.holdTimer === -1 || this.holdTimer > 0) return; // ainda indo ou escondido
            this.cover = null;
            this.holdTimer = -1; // terminou de esperar: "espia"
        }

        // 3) Levando tiro durante o combate: às vezes se esconde um pouco
        if (this.target && this.hitTimer > 0 && this.coverCooldown <= 0 && rng() < 0.45) {
            this._enterCover(ctx);
            if (this.state === 'cover') return;
        }

        // 4) Alvo à vista: combate
        if (this.target) {
            this.state = 'combat';
            return;
        }
        // 5) Perigo recente: vai conferir
        if (this.threat && this.threat.t < 5) {
            this.state = 'investigate';
            return;
        }
        this.state = 'roam';
    }

    _enterCover(ctx) {
        const from = { x: this.x, y: this.y };
        const threat = this.threat || (this.target ? { x: this.target.x, y: this.target.y } : null);
        if (!threat) return;
        const spot = findCover(ctx.world, ctx.rng, from, threat);
        this.coverCooldown = 4;
        if (spot) {
            this.state = 'cover';
            this.cover = spot;
            this.holdTimer = -1; // -1 = ainda a caminho
        }
    }

    // ----- ação: anda conforme o estado -----
    _act(dt, ctx) {
        const cfg = CONFIG.BOT;
        const { zone, rng } = ctx;

        switch (this.state) {
            case 'storm': {
                const c = zone.target;
                this._moveTo(dt, ctx, c.x, c.y, cfg.runSpeed * this.skill);
                break;
            }
            case 'cover': {
                if (!this.cover) {
                    this.state = 'roam';
                    break;
                }
                const d = Math.hypot(this.cover.x - this.x, this.cover.y - this.y);
                if (d > 22 && this.holdTimer === -1) {
                    this._moveTo(dt, ctx, this.cover.x, this.cover.y, cfg.runSpeed * this.skill);
                } else {
                    if (this.holdTimer === -1) this.holdTimer = between(rng, [1.2, 2.8]);
                    this.holdTimer = Math.max(0, this.holdTimer - dt);
                    if (this.threat) this._face(dt, Math.atan2(this.threat.y - this.y, this.threat.x - this.x));
                }
                break;
            }
            case 'combat': {
                const t = this.target;
                if (!t) break;
                const aim = Math.atan2(t.y - this.y, t.x - this.x);
                const dist = Math.hypot(t.x - this.x, t.y - this.y);
                const [near, far] = cfg.preferredRange;
                this._face(dt, aim);
                if (dist > far) {
                    this._moveTo(dt, ctx, t.x, t.y, cfg.walkSpeed * this.skill, false);
                } else if (dist < near) {
                    // recua mantendo o rosto virado para o alvo
                    this._moveTo(dt, ctx, this.x - Math.cos(aim) * 100, this.y - Math.sin(aim) * 100, cfg.walkSpeed * this.skill, false);
                } else {
                    if (this.strafeTimer <= 0) {
                        this.strafeTimer = between(rng, [0.8, 1.8]);
                        this.strafeDir = -this.strafeDir;
                    }
                    const side = aim + (Math.PI / 2) * this.strafeDir;
                    this._moveTo(dt, ctx, this.x + Math.cos(side) * 100, this.y + Math.sin(side) * 100, cfg.walkSpeed * 0.8 * this.skill, false);
                }
                break;
            }
            case 'investigate': {
                const th = this.threat;
                if (!th) break;
                if (Math.hypot(th.x - this.x, th.y - this.y) < 90) this.threat = null;
                else this._moveTo(dt, ctx, th.x, th.y, cfg.walkSpeed * this.skill);
                break;
            }
            default: { // roam
                if (!this.waypoint || this.waypointTimer <= 0 || Math.hypot(this.waypoint.x - this.x, this.waypoint.y - this.y) < 45) {
                    this._pickWaypoint(ctx);
                }
                this._moveTo(dt, ctx, this.waypoint.x, this.waypoint.y, cfg.walkSpeed * this.skill);
            }
        }
    }

    _pickWaypoint(ctx) {
        const { world, zone, rng } = ctx;
        const c = zone.current;
        const r = c.r * 0.8;
        this.waypointTimer = between(rng, [6, 12]);
        for (let i = 0; i < 14; i++) {
            const a = rng() * TAU;
            const d = Math.sqrt(rng()) * r;
            const x = c.x + Math.cos(a) * d;
            const y = c.y + Math.sin(a) * d;
            if (x > 100 && y > 100 && x < world.mapSize - 100 && y < world.mapSize - 100 && isFree(world, x, y, 34)) {
                this.waypoint = { x, y };
                return;
            }
        }
        this.waypoint = { x: c.x, y: c.y };
    }

    /** Anda em direção a (tx, ty) desviando de paredes (sonda à frente e escolhe o lado livre). */
    _moveTo(dt, ctx, tx, ty, speed, faceMovement = true) {
        const desired = Math.atan2(ty - this.y, tx - this.x);
        const s = this.avoidSign;
        let chosen = null;
        for (const off of [0, 0.5 * s, -0.5 * s, 1.0 * s, -1.0 * s, 1.5 * s, -1.5 * s]) {
            const a = desired + off;
            if (raycast(ctx.world, this.x, this.y, a, this.radius + 34) === null) {
                chosen = a;
                break;
            }
        }
        if (chosen === null) return; // encurralado: espera a rotina de "preso" resolver

        const next = moveCircle(ctx.world, this.x, this.y, Math.cos(chosen) * speed * dt, Math.sin(chosen) * speed * dt, this.radius);
        // o campo termina na borda do mapa: o bot nunca sai dele
        this.x = clamp(next.x, 0, CONFIG.MAP_SIZE);
        this.y = clamp(next.y, 0, CONFIG.MAP_SIZE);
        this.moving = true;
        this.walkPhase += speed * dt * 0.09;
        if (faceMovement) this._face(dt, chosen);
    }

    _face(dt, angle) {
        const turn = CONFIG.BOT.turnSpeed * dt;
        this.rotation += clamp(angleDiff(angle, this.rotation), -turn, turn);
    }

    // ----- tiro -----
    _shoot(ctx) {
        const cfg = CONFIG.BOT;
        const t = this.target;
        if (!t || !t.alive || this.reactionTimer > 0 || this.fireTimer > 0) return;
        const dist = Math.hypot(t.x - this.x, t.y - this.y);
        if (dist > cfg.engage) return;

        // a mira treme mais quando o bot está longe e se movendo
        const spread = ((cfg.aimError + dist * cfg.aimErrorPerUnit) * (this.moving ? 1.4 : 1)) / this.skill;
        const aim = Math.atan2(t.y - this.y, t.x - this.x) + (ctx.rng() - 0.5) * 2 * spread;
        this.rotation = Math.atan2(t.y - this.y, t.x - this.x); // vira para o alvo ao atirar
        this.fireTimer = between(ctx.rng, cfg.fireInterval) / this.skill;
        this.shootTimer = 0.15;
        // inclinação: da boca do marcador até o peito do alvo, com erro também na vertical
        const rise = CONFIG.COMBAT.chestHeight - CONFIG.COMBAT.muzzleHeight;
        const pitch = Math.atan2(rise, dist) + (ctx.rng() - 0.5) * 2 * spread * 0.6;
        ctx.shoot(aim, pitch);
    }

    // ----- preso numa quina? troca de rota -----
    _checkStuck(dt, ctx) {
        this.checkTimer -= dt;
        if (this.checkTimer > 0) return;
        this.checkTimer = 0.6;
        const moved = Math.hypot(this.x - this.lastX, this.y - this.lastY);
        this.lastX = this.x;
        this.lastY = this.y;
        if (this.moving && moved < 8) {
            this.stuckCount += 1;
            this.avoidSign = -this.avoidSign;
            this.waypoint = null;
            if (this.state === 'cover' && this.holdTimer === -1) {
                this.cover = null;
                this.state = 'roam';
            }
            if (this.stuckCount > 2) this._pickWaypoint(ctx);
        } else {
            this.stuckCount = 0;
        }
    }
}
