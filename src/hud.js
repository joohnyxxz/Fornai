import { CONFIG } from './config.js';

function formatTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
}

export function createHud() {
    const el = {
        gameScreen: document.getElementById('game-screen'),
        healthBar: document.getElementById('health-bar'),
        healthText: document.getElementById('health-text'),
        zoneLabel: document.getElementById('zone-label'),
        zoneTimer: document.getElementById('zone-timer'),
        zonePhase: document.getElementById('zone-phase'),
        zoneArrow: document.getElementById('zone-arrow'),
        alive: document.getElementById('alive-count'),
        kills: document.getElementById('kills-count'),
        hitmarker: document.getElementById('hitmarker'),
        damageFlash: document.getElementById('damage-flash'),
        countdown: document.getElementById('countdown'),
    };
    let lastCount = null;

    return {
        /** Atualiza toda a interface a partir do estado da partida. */
        update(match) {
            const { player, zone } = match;

            // vida
            const pct = (player.health / player.maxHealth) * 100;
            el.healthBar.style.width = `${pct}%`;
            el.healthBar.dataset.level = pct > 50 ? 'high' : pct > 25 ? 'mid' : 'low';
            el.healthText.textContent = `${Math.ceil(player.health)}/${player.maxHealth}`;

            // placar
            const aliveBots = match.bots.filter((b) => b.alive).length;
            el.alive.textContent = String(aliveBots + (player.alive ? 1 : 0));
            el.kills.textContent = String(match.kills);

            // zona
            if (zone.done) {
                el.zoneLabel.textContent = 'ZONA FINAL';
                el.zoneTimer.textContent = '--:--';
            } else if (zone.stage === 'waiting') {
                el.zoneLabel.textContent = 'ZONA FECHA EM';
                el.zoneTimer.textContent = formatTime(zone.timer);
            } else {
                el.zoneLabel.textContent = 'ZONA FECHANDO';
                el.zoneTimer.textContent = formatTime(zone.timer);
            }
            el.zonePhase.textContent = `${Math.min(zone.phaseIndex + 1, zone.phaseCount)}/${zone.phaseCount}`;

            // seta apontando para o centro da próxima zona segura (relativa à direção do olhar)
            const toTarget = Math.atan2(zone.target.y - player.y, zone.target.x - player.x);
            el.zoneArrow.style.transform = `rotate(${((toTarget - player.rotation) * 180) / Math.PI}deg)`;
            el.gameScreen.classList.toggle('in-storm', zone.isOutside(player.x, player.y));

            // acertou alguém: "X" na mira; levou tinta: clarão vermelho nas bordas
            el.hitmarker.style.opacity = String(Math.min(1, match.hitMarker / 0.2));
            el.damageFlash.style.opacity = String(Math.min(0.9, (player.hitTimer / 0.28) * 0.9));

            // contagem inicial e "JÁ!"
            let text = '';
            if (match.state === 'countdown') text = String(Math.max(1, Math.ceil(match.countdown)));
            else if (match.state === 'playing' && match.time < CONFIG.MATCH.countdown + 0.9) text = 'JÁ!';
            if (text !== lastCount) {
                lastCount = text;
                el.countdown.textContent = text;
                el.countdown.classList.toggle('show', text !== '');
                if (text !== '') { // reinicia a animação a cada número novo
                    el.countdown.classList.remove('pop');
                    void el.countdown.offsetWidth;
                    el.countdown.classList.add('pop');
                }
            }
        },
    };
}
