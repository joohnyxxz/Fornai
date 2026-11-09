// Zona segura em fases: espera -> encolhe -> espera -> ... -> fim.
// Lógica pura (sem DOM), baseada em tempo (segundos), para poder ser testada.

function lerpCircle(a, b, t) {
    return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        r: a.r + (b.r - a.r) * t,
    };
}

export class Zone {
    /**
     * @param {{startRadius:number, phases:{radius:number,wait:number,shrink:number,dps:number}[]}} config
     * @param {number} mapSize
     * @param {() => number} rng função que devolve números em [0, 1)
     */
    constructor(config, mapSize, rng) {
        this.config = config;
        this.rng = rng;
        this.current = { x: mapSize / 2, y: mapSize / 2, r: config.startRadius };
        this.from = null;
        this.phaseIndex = 0;
        this.stage = 'waiting'; // 'waiting' | 'shrinking' | 'done'
        this.timer = config.phases[0].wait;
        this.target = this._pickTarget(0);
    }

    get phaseCount() {
        return this.config.phases.length;
    }

    get done() {
        return this.stage === 'done';
    }

    /** Dano por segundo para quem está fora da zona na fase atual. */
    get damagePerSecond() {
        const i = Math.min(this.phaseIndex, this.phaseCount - 1);
        return this.config.phases[i].dps;
    }

    /** Distância até a borda da zona atual (positiva = fora da zona). */
    distanceToEdge(x, y) {
        return Math.hypot(x - this.current.x, y - this.current.y) - this.current.r;
    }

    isOutside(x, y) {
        return this.distanceToEdge(x, y) > 0;
    }

    update(dt) {
        let left = dt;
        while (left > 0 && this.stage !== 'done') {
            const step = Math.min(left, this.timer);
            this.timer -= step;
            left -= step;

            if (this.stage === 'shrinking') {
                const phase = this.config.phases[this.phaseIndex];
                const t = 1 - this.timer / phase.shrink;
                this.current = lerpCircle(this.from, this.target, Math.min(1, t));
            }

            if (this.timer <= 1e-9) {
                this._advance();
            }
        }
    }

    _advance() {
        const phases = this.config.phases;
        if (this.stage === 'waiting') {
            this.stage = 'shrinking';
            this.timer = phases[this.phaseIndex].shrink;
            this.from = { ...this.current };
            return;
        }

        // terminou de encolher
        this.current = { ...this.target };
        this.phaseIndex += 1;
        if (this.phaseIndex >= phases.length) {
            this.phaseIndex = phases.length - 1;
            this.stage = 'done';
            this.timer = 0;
            return;
        }
        this.stage = 'waiting';
        this.timer = phases[this.phaseIndex].wait;
        this.target = this._pickTarget(this.phaseIndex);
    }

    // O próximo círculo sempre fica totalmente dentro do círculo atual.
    _pickTarget(index) {
        const radius = this.config.phases[index].radius;
        const maxOffset = Math.max(0, this.current.r - radius);
        const angle = this.rng() * Math.PI * 2;
        const dist = Math.sqrt(this.rng()) * maxOffset;
        return {
            x: this.current.x + Math.cos(angle) * dist,
            y: this.current.y + Math.sin(angle) * dist,
            r: radius,
        };
    }
}
