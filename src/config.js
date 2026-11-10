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
        mouseSensitivity: 0.0025, // radianos por pixel que o mouse anda
        maxPitch: 0.5, // quanto dá para olhar para cima/baixo (radianos, ~29 graus)
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

    // Partida: 19 bots + o jogador = 20 jogadores
    MATCH: {
        bots: 19,
        countdown: 3, // segundos de contagem antes de começar
        spawnMinDistance: 400, // distância mínima entre os pontos de nascimento
        deadLinger: 1.6, // quanto tempo um eliminado fica visível (mãos para cima)
    },

    // Combate com marcadores de paintball
    COMBAT: {
        paintballSpeed: 900, // unidades por segundo
        paintballLife: 1.7, // segundos até a bolinha "cair"
        damage: 20, // por acerto (5 acertos eliminam)
        playerFireInterval: 0.2, // segundos entre tiros (segurando o botão esquerdo)
        playerSpread: 0.012, // imprecisão da mira do jogador (radianos)
        entityRadius: 18, // raio de colisão de qualquer jogador (igual a PLAYER.radius)
        entityHeight: 58, // altura de um jogador (unidades do mundo): a tinta só acerta entre o chão e essa altura
        // A arma fica fixa em relação à câmera: um pouco à frente, à direita e abaixo do olho.
        // A tinta nasce na boca do marcador (não no olho) e cruza a mira mais adiante.
        muzzleForward: 60,
        muzzleRight: 10,
        muzzleDrop: 8, // quanto a boca fica abaixo do olho
        muzzleHeight: 42, // altura da boca com a câmera reta (= CAMERA_HEIGHT - muzzleDrop); os bots usam essa altura
        convergence: 520, // a tinta sai da arma e cruza a mira a essa distância
        chestHeight: 30, // altura que os bots mirram
    },

    // Inteligência dos bots
    BOT: {
        maxHealth: 100,
        walkSpeed: 115,
        runSpeed: 185,
        sight: 700, // alcance de visão
        engage: 500, // só atira em alvos mais perto que isso
        preferredRange: [220, 400], // distância que o bot tenta manter em combate
        reaction: [0.8, 1.6], // segundos entre ver um inimigo e atirar
        fireInterval: [1.1, 2.4],
        aimError: 0.12, // erro de mira base (radianos)
        aimErrorPerUnit: 0.00012, // o erro cresce com a distância até o alvo
        retreatHealth: 38, // abaixo disso procura cobertura
        turnSpeed: 7, // radianos por segundo
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
