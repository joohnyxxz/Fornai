import { CONFIG } from './config.js';
import { moveCircle } from './physics.js';

export class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.rotation = Math.random() * Math.PI * 2;
        this.radius = CONFIG.PLAYER.radius;
        this.maxHealth = CONFIG.PLAYER.maxHealth;
        this.health = this.maxHealth;
    }

    isAlive() {
        return this.health > 0;
    }

    takeDamage(amount) {
        this.health = Math.max(0, this.health - amount);
    }

    /**
     * Controles:
     *  W/S (ou ↑/↓): frente e trás      A/D: esquerda e direita (andar de lado)
     *  botão direito do mouse + arrastar: gira a câmera      ←/→: também giram a câmera
     *  Shift: correr
     *
     * @param {number} dt segundos
     * @param {{isDown:(k:string)=>boolean, consumeLook?:()=>number}} input
     * @param {object} world
     */
    update(dt, input, world) {
        const cfg = CONFIG.PLAYER;

        // Câmera
        if (input.consumeLook) this.rotation += input.consumeLook() * cfg.mouseSensitivity;
        if (input.isDown('arrowleft')) this.rotation -= cfg.turnSpeed * dt;
        if (input.isDown('arrowright')) this.rotation += cfg.turnSpeed * dt;

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
