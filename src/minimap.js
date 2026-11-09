import { CONFIG } from './config.js';
import { PALETTE } from './world.js';

export const MINIMAP_SIZE = 200;

export function drawMinimap(ctx, { player, zone, world }) {
    const s = MINIMAP_SIZE / CONFIG.MAP_SIZE;
    const cur = zone.current;
    const tgt = zone.target;

    ctx.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

    // Ilha (terra) e mar ao redor
    ctx.fillStyle = '#2e7fd6';
    ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
    ctx.fillStyle = '#6cc02c';
    ctx.fillRect(2, 2, MINIMAP_SIZE - 4, MINIMAP_SIZE - 4);

    // Bunkers, painéis e tambores (nas cores deles)
    for (const o of world.obstacles) {
        ctx.save();
        ctx.translate(o.x * s, o.y * s);
        ctx.rotate(o.yaw);
        ctx.fillStyle = PALETTE[o.color].base;
        ctx.strokeStyle = 'rgba(10, 20, 40, 0.85)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        if (o.kind === 'drum') {
            ctx.arc(0, 0, Math.max(1.5, o.r * s), 0, Math.PI * 2);
        } else {
            const hw = Math.max(1.5, (o.w * s) / 2);
            const hd = Math.max(1.2, (o.d * s) / 2);
            ctx.rect(-hw, -hd, hw * 2, hd * 2);
        }
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    // Tempestade: tudo que está fora do círculo atual
    ctx.beginPath();
    ctx.rect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
    ctx.arc(cur.x * s, cur.y * s, cur.r * s, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(126, 52, 226, 0.6)';
    ctx.fill('evenodd');

    // Borda da zona atual
    ctx.beginPath();
    ctx.arc(cur.x * s, cur.y * s, cur.r * s, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Próxima zona (tracejada), só enquanto não terminou
    if (!zone.done) {
        ctx.beginPath();
        ctx.setLineDash([5, 4]);
        ctx.arc(tgt.x * s, tgt.y * s, tgt.r * s, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Jogador: seta apontando para onde está olhando
    ctx.save();
    ctx.translate(player.x * s, player.y * s);
    ctx.rotate(player.rotation);
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-6, 6);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-6, -6);
    ctx.closePath();
    ctx.fillStyle = '#ffd60a';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#12254a';
    ctx.stroke();
    ctx.restore();
}
