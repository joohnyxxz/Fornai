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
    };

    return {
        update(player, zone) {
            const pct = (player.health / player.maxHealth) * 100;
            el.healthBar.style.width = `${pct}%`;
            el.healthBar.dataset.level = pct > 50 ? 'high' : pct > 25 ? 'mid' : 'low';
            el.healthText.textContent = `${Math.ceil(player.health)}/${player.maxHealth}`;

            // Estado da zona
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

            // Seta apontando para o centro da próxima zona segura (relativa à direção do olhar)
            const toTarget = Math.atan2(zone.target.y - player.y, zone.target.x - player.x);
            const rel = toTarget - player.rotation;
            el.zoneArrow.style.transform = `rotate(${(rel * 180) / Math.PI}deg)`;

            // Vinheta roxa só enquanto estiver fora da zona segura
            el.gameScreen.classList.toggle('in-storm', zone.isOutside(player.x, player.y));
        },
    };
}
