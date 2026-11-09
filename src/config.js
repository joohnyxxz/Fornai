// Todos os números do jogo ficam aqui, para facilitar o ajuste (balanceamento).
export const CONFIG = {
    MAP_SIZE: 3000,

    // Câmera
    FOV: Math.PI / 3,
    CAMERA_HEIGHT: 50,
    FOG_DISTANCE: 1900,

    PLAYER: {
        radius: 18,
        maxHealth: 100,
        walkSpeed: 170, // unidades por segundo
        runSpeed: 290,
        turnSpeed: 2.2, // radianos por segundo (setas ←/→)
        mouseSensitivity: 0.0045, // radianos por pixel arrastado com o botão direito
    },

    // Zona segura (tempestade) em fases.
    // Cada fase: espera `wait` s, depois encolhe por `shrink` s até `radius`.
    // `dps` é o dano por segundo de quem está fora da zona durante a fase.
    ZONE: {
        startRadius: 2150,
        phases: [
            { radius: 1500, wait: 45, shrink: 30, dps: 1 },
            { radius: 900, wait: 30, shrink: 25, dps: 2 },
            { radius: 500, wait: 25, shrink: 20, dps: 5 },
            { radius: 220, wait: 20, shrink: 15, dps: 8 },
            { radius: 50, wait: 15, shrink: 15, dps: 10 },
        ],
    },

    // Partida: 19 bots + o jogador = 20 jogadores (os bots entram na parte 2)
    MATCH: {
        bots: 19,
    },

    // Campo de paintball: bunkers (caixas), painéis e tambores, bem espalhados
    WORLD: {
        boxes: 12,
        panels: 10,
        drums: 14,
        minGap: 150,
        margin: 220,
    },

    // Altura da parede da tempestade (unidades do mundo)
    STORM_WALL_HEIGHT: 1000,
};
