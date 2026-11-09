import { CONFIG } from './config.js';
import { moveCircle } from './physics.js';

export class Player {
    constructor(x, y) {
        this.kind = 'player';
        this.id = 'player';
        this.x = x;
        this.y = y;
        this.rotation = Math.random() * Math.PI * 2;
        this.pitch = 0; // olhar para cima (+) ou para baixo (-); só afeta o desenho, o combate é no plano
        this.radius = CONFIG.COMBAT.entityRadius;
        this.maxHealth = CONFIG.PLAYER.maxHealth;
        this.health = this.maxHealth;
        this.color = '#ffd60a';

        this.fireTimer = 0; // tempo até poder atirar de novo
        this.shootTimer = 0; // clarão do tiro (efeito visual)
        this.hitTimer = 0; // tempo desde que levou tinta (efeito visual)
    }

    get alive() {
        return this.health > 0;
    }

    isAlive() {
        return this.alive;
    }

    takeDamage(amount) {
        this.health = Math.max(0, this.health - amount);
    }

    /**
     * Câmera: o mouse preso na tela gira na horizontal (rotation) e na vertical (pitch).
     * As setas ←/→ também giram na horizontal.
     */
    look(input, dt) {
        const cfg = CONFIG.PLAYER;
        const look = input.consumeLook ? input.consumeLook() : null;
        if (look) {
            this.rotation += look.x * cfg.mouseSensitivity;
            // mouse para cima (y negativo) = olhar para cima
            this.pitch = Math.max(-cfg.maxPitch, Math.min(cfg.maxPitch, this.pitch - look.y * cfg.mouseSensitivity));
        }
        if (input.isDown('arrowleft')) this.rotation -= cfg.turnSpeed * dt;
        if (input.isDown('arrowright')) this.rotation += cfg.turnSpeed * dt;
    }

    /**
     * Controles:
     *  W/S (ou ↑/↓): frente e trás      A/D: esquerda e direita (andar de lado)
     *  mouse (preso na tela): gira a câmera na horizontal e na vertical      ←/→: giram na horizontal
     *  Shift: correr
     *
     * @param {number} dt segundos
     * @param {{isDown:(k:string)=>boolean, consumeLook?:()=>number}} input
     * @param {object} world
     */
    update(dt, input, world) {
        const cfg = CONFIG.PLAYER;

        this.look(input, dt);
        this.fireTimer = Math.max(0, this.fireTimer - dt);
        this.shootTimer = Math.max(0, this.shootTimer - dt);
        this.hitTimer = Math.max(0, this.hitTimer - dt);

        // Movimento relativo ao lado para onde a câmera olha
        let forward = 0;
        let side = 0;
        if (input.isDown('w') || input.isDown('arrowup')) forward += 1;
        if (input.isDown('s') || input.isDown('arrowdown')) forward -= 1;
        if (input.isDown('d')) side += 1;
        if (input.isDown('a')) side -= 1;

        let dx = 0;
        let dy = 0;
        if (forward !== 0 || side !== 0) {
            // diagonal não pode ser mais rápida que andar reto
            const length = Math.hypot(forward, side);
            forward /= length;
            side /= length;

            const speed = input.isDown('shift') ? cfg.runSpeed : cfg.walkSpeed;
            const cos = Math.cos(this.rotation);
            const sin = Math.sin(this.rotation);
            // frente = (cos, sin); direita = (-sin, cos)
            dx = (cos * forward - sin * side) * speed * dt;
            dy = (sin * forward + cos * side) * speed * dt;
        }

        // Física: anda em passos curtos e desliza ao longo das paredes (nunca as atravessa)
        const next = moveCircle(world, this.x, this.y, dx, dy, this.radius);
        this.x = Math.max(0, Math.min(CONFIG.MAP_SIZE, next.x));
        this.y = Math.max(0, Math.min(CONFIG.MAP_SIZE, next.y));
    }
}
