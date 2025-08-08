window.onload = () => {
    // --- ELEMENTOS DO DOM ---
    const loadingScreen = document.getElementById('loading-screen');
    const mainMenu = document.getElementById('main-menu');
    const gameScreen = document.getElementById('game-screen');
    const gameOverScreen = document.getElementById('game-over-screen');
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    const minimapCanvas = document.getElementById('minimap-canvas');
    const minimapCtx = minimapCanvas.getContext('2d');

    // Botões
    const startButton = document.getElementById('start-button');
    const howToPlayButton = document.getElementById('how-to-play-button');
    const settingsButton = document.getElementById('settings-button');
    const restartButton = document.getElementById('restart-button');

    // Modais
    const howToPlayModal = document.getElementById('how-to-play-modal');
    const settingsModal = document.getElementById('settings-modal');
    const closeButtons = document.querySelectorAll('.close-button');

    // HUD
    const healthBar = document.getElementById('health-bar');
    const healthText = document.getElementById('health-text');
    const playersLeftText = document.getElementById('players-left');
    const zoneTimerText = document.getElementById('zone-timer');
    const dropPhaseOverlay = document.getElementById('drop-phase-overlay');
    const gameOverTitle = document.getElementById('game-over-title');

    // --- CONFIGURAÇÕES DO JOGO ---
    const MAP_WIDTH = 2000;
    const MAP_HEIGHT = 2000;
    const BOT_COUNT = 199; // Aumentado para 99 bots
    const ITEM_COUNT = 50;
    const MINIMAP_SIZE = 200;

    // --- SHITPOST IMAGES (COLOQUE SEUS PRÓPRIOS LINKS AQUI!) ---
    const shitpostImages = [
        'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTPTq8Z-NiOyGeZsEQwCjV9rj5dbTw1GOUbcw&s',
        'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSUGDggrQUOSRTm7oEf1QLwA19DM2eJ0NvkqTNJRpdIllHHlhjjN6QVu0XnwvZRv9b3rhI&usqp=CAU',
        'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRAi5t-RHbMCW5e1Xom-V8ZWTr6XzTiq983ew&s',
        'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTfUDdxk3eSYl5ZQeu9yCCvO96lNJpOGx3k2g&s',
        'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS2yCNXXVcxbf4yhRTG-6Fl2vJlFb-lU-Qmug&s',
        'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRcj6PeVGl5hFFtVCphdtZQy-4_yTUAFv1OiQ&s',
        'https://pbs.twimg.com/media/FTIuycrUYBIq6KM.jpg',
        'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ51tWVry1-AtHuy6AP1dibAeALE2a62v02mg&s',
        'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTa6PxwnIxZfu___pvXltD-jOr4TmCLFs9gUw&s',
        'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR_u2kk4HI-4WgIBobS5vXtWxrLU7s89qfh3Q&s',
        'https://ih1.redbubble.net/image.5285919449.9116/st,large,507x507-pad,600x600,f8f8f8.jpg',
        'https://pbs.twimg.com/media/Fu2at_0XgAAmkDD.jpg',
        'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRNEsWgsg9VShDNLCWMQbI45ymRPOTcifjaIg&s',
        'https://rvideos2.memedroid.com/videos/UPLOADED642/63d401928c0e0.webp',
        'https://media.tenor.com/PJ1Znvdi9YwAAAAe/ja-pode-gosar.png',
        'https://media.tenor.com/XqjQbS_md1UAAAAe/paia-peixe-boi.png',
        'https://preview.redd.it/day-5-of-shitposting-until-the-fnaf-movie-is-out-v0-4red6ma8r2wb1.jpeg?width=750&format=pjpg&auto=webp&s=ea0a7882898562ec1aa367bad76f55cb577e6353',
        'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSjBoeA-Q8pWwJztCSPL8E3oiUwjYsnNSFzCQ&s',
        'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRMXdK24ZrJLmWxEgRu7UYI2Wmvo8XjXyu-kA&s'
    ];

    let player, bots, projectiles, items, safeZone;
    let keys = {};
    let gameState = 'MENU'; // MENU, DROPPING, PLAYING, GAMEOVER
    let animationFrameId;

    // --- CLASSES DO JOGO ---
    class Entity {
        constructor(x, y, size, color, health) {
            this.x = x;
            this.y = y;
            this.size = size;
            this.color = color;
            this.health = health;
            this.maxHealth = health;
            this.speed = 3;
        }

        takeDamage(amount) {
            this.health -= amount;
            if (this.health < 0) this.health = 0;
        }

        isAlive() {
            return this.health > 0;
        }
    }

    class Player extends Entity {
        constructor(x, y) {
            super(x, y, 20, '#000000', 2000); // Vida ajustada para 1000
            this.isDropping = true;
            this.dropSpeed = 5;
            this.rotation = 0; // Novo: Rotação da câmera
            this.fov = Math.PI / 3; // Field of View (60 graus)
        }

        update() {
            if (this.isDropping) {
                this.y += this.dropSpeed;
                if (this.y >= MAP_HEIGHT - this.size * 5) {
                    this.y = MAP_HEIGHT - this.size * 5;
                    this.isDropping = false;
                    gameState = 'PLAYING';
                    dropPhaseOverlay.style.display = 'none';
                }
                return;
            }

            let dx = 0;
            let dy = 0;
            const speed = this.speed * 0.5;
            const rotationSpeed = 0.05;

            if (keys['a'] || keys['ArrowLeft']) this.rotation -= rotationSpeed;
            if (keys['d'] || keys['ArrowRight']) this.rotation += rotationSpeed;
            if (keys['w'] || keys['ArrowUp']) {
                dx += Math.cos(this.rotation) * speed;
                dy += Math.sin(this.rotation) * speed;
            }
            if (keys['s'] || keys['ArrowDown']) {
                dx -= Math.cos(this.rotation) * speed;
                dy -= Math.sin(this.rotation) * speed;
            }
            this.x += dx;
            this.y += dy;
            this.x = Math.max(0, Math.min(MAP_WIDTH, this.x));
            this.y = Math.max(0, Math.min(MAP_HEIGHT, this.y));
        }
    }

    class Bot extends Entity {
        constructor(x, y) {
            super(x, y, 20, '#e74c3c', 75); // Vida dos bots ajustada para 75
            this.color = '#' + Math.floor(Math.random() * 16777215).toString(16);
            this.target = null;
            this.moveTimer = 0;
            this.shootCooldown = 120;
            this.attackRange = 500;
            this.image = new Image();
            this.image.src = shitpostImages[Math.floor(Math.random() * shitpostImages.length)];
        }

        draw(player, ctx, screenWidth, screenHeight) {
            const dist = Math.hypot(this.x - player.x, this.y - player.y);
            const botSize = (screenHeight / dist) * this.size * 2;
            const botScreenX = screenWidth / 2 + (Math.atan2(this.y - player.y, this.x - player.x) - player.rotation) * (screenWidth / player.fov);

            ctx.drawImage(this.image, botScreenX - botSize / 2, screenHeight / 2 - botSize / 2, botSize, botSize);

            ctx.fillStyle = 'red';
            ctx.fillRect(botScreenX - botSize / 2, screenHeight / 2 - botSize / 2 - 10, botSize, 5);
            ctx.fillStyle = 'green';
            ctx.fillRect(botScreenX - botSize / 2, screenHeight / 2 - botSize / 2 - 10, botSize * (this.health / this.maxHealth), 5);
        }

        update(entities) {
            this.moveTimer -= 1;
            this.shootCooldown -= 1;

            const potentialTargets = entities.filter(e => e.isAlive() && e !== this);
            if (potentialTargets.length > 0 && (this.target === null || !this.target.isAlive() || this.moveTimer <= 0)) {
                this.target = potentialTargets[Math.floor(Math.random() * potentialTargets.length)];
                this.moveTimer = Math.random() * 200 + 100;
}

            if (this.target) {
                const dx = this.target.x - this.x;
                const dy = this.target.y - this.y;
                const dist = Math.hypot(dx, dy);

                let avoidDx = 0;
                let avoidDy = 0;
                entities.filter(e => e !== this).forEach(otherBot => {
                    const d = Math.hypot(otherBot.x - this.x, otherBot.y - this.y);
                    if (d < 50) {
                        avoidDx += (this.x - otherBot.x) / d;
                        avoidDy += (this.y - otherBot.y) / d;
                    }
                });

                this.x += (dx / dist) * this.speed * 0.5 + avoidDx * 0.5;
                this.y += (dy / dist) * this.speed * 0.5 + avoidDy * 0.5;

                if (dist < 800 && this.shootCooldown <= 0) {
                    const angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
                    projectiles.push(new Projectile(this.x, this.y, angle, this));
                    this.shootCooldown = Math.random() * 120 + 120;
                }
            } else {
                this.x += (Math.random() - 0.5) * this.speed;
                this.y += (Math.random() - 0.5) * this.speed;
            }

            this.x = Math.max(0, Math.min(MAP_WIDTH, this.x));
            this.y = Math.max(0, Math.min(MAP_HEIGHT, this.y));
        }
    }

    class Projectile {
        constructor(x, y, angle, owner) {
            this.x = x;
            this.y = y;
            this.size = 5;
            this.color = '#f1c40f'; // Amarelo
            this.speed = 10;
            this.vx = Math.cos(angle) * this.speed;
            this.vy = Math.sin(angle) * this.speed;
            this.owner = owner;
            this.lifespan = 100;
        }

        update() {
            this.x += this.vx;
            this.y += this.vy;
            this.lifespan--;
        }
    }

    class Item {
        constructor(x, y) {
            this.x = x;
            this.y = y;
            this.size = 10;
            this.type = Math.random() > 0.3 ? 'weapon' : 'heal';
            this.color = this.type === 'weapon' ? '#9b59b6' : '#2ecc71';
        }
    }

    class SafeZone {
        constructor() {
            this.x = MAP_WIDTH / 2;
            this.y = MAP_HEIGHT / 2;
            this.radius = Math.max(MAP_WIDTH, MAP_HEIGHT);
            this.targetRadius = this.radius / 1.5;
            this.shrinkSpeed = 0.1;
            this.damage = 0.1;
            this.timer = 120; // 2 minutos
            this.intervalId = null;
        }

        startTimer() {
            this.intervalId = setInterval(() => {
                this.timer--;
                if (this.timer <= 0) {
                    this.startShrinking();
                    this.timer = 60; // Tempo para o próximo encolhimento
                }
            }, 1000);
        }

        stopTimer() {
            clearInterval(this.intervalId);
        }

        startShrinking() {
            this.targetRadius = this.radius / 1.5;
        }

        update() {
            if (this.radius > this.targetRadius) {
                this.radius -= this.shrinkSpeed;
            } else if (this.targetRadius > 200) {
                if (this.timer <= 0) {
                    this.targetRadius /= 1.5;
                    this.timer = 60;
                }
            }
        }

        isOutside(entity) {
            const dist = Math.hypot(entity.x - this.x, entity.y - this.y);
            return dist > this.radius;
        }
    }

    // --- FUNÇÕES DO JOGO ---

    function init() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        minimapCanvas.width = MINIMAP_SIZE;
        minimapCanvas.height = MINIMAP_SIZE;

        player = new Player(MAP_WIDTH / 2, 0);
        bots = [];
        for (let i = 0; i < BOT_COUNT; i++) {
            bots.push(new Bot(Math.random() * MAP_WIDTH, Math.random() * MAP_HEIGHT));
        }

        projectiles = [];
        items = [];
        for (let i = 0; i < ITEM_COUNT; i++) {
            items.push(new Item(Math.random() * MAP_WIDTH, Math.random() * MAP_HEIGHT));
        }

        safeZone = new SafeZone();

        keys = {};
        gameState = 'DROPPING';

        showScreen('game');
        dropPhaseOverlay.style.display = 'block';

        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        gameLoop();
        safeZone.startTimer();
    }

    function gameLoop() {
        update();
        draw();
        drawMinimap();
        animationFrameId = requestAnimationFrame(gameLoop);
    }

    function update() {
        if (gameState !== 'PLAYING' && gameState !== 'DROPPING') return;

        if (player.isAlive()) {
            player.update();
        } else {
            endGame(false);
        }

        const allEntities = [player, ...bots];
        bots.forEach(bot => {
            if (bot.isAlive()) {
                bot.update(allEntities);
            }
        });

        projectiles.forEach((proj, projIndex) => {
            proj.update();
            if (proj.lifespan <= 0) {
                projectiles.splice(projIndex, 1);
                return;
            }

            if (player.isAlive() && proj.owner !== player) {
                if (Math.hypot(proj.x - player.x, proj.y - player.y) < player.size + proj.size) {
                    player.takeDamage(10);
                    projectiles.splice(projIndex, 1);
                    return;
                }
            }

            bots.forEach((bot, botIndex) => {
                if (bot.isAlive() && proj.owner !== bot) {
                    if (Math.hypot(proj.x - bot.x, proj.y - bot.y) < bot.size + proj.size) {
                        bot.takeDamage(10);
                        projectiles.splice(projIndex, 1);
                    }
                }
            });
        });

        bots = bots.filter(bot => bot.isAlive());

        items.forEach((item, itemIndex) => {
            if (Math.hypot(item.x - player.x, item.y - player.y) < player.size + item.size) {
                if (item.type === 'heal' && player.health < player.maxHealth) {
                    player.health = Math.min(player.maxHealth, player.health + 25);
                }
                items.splice(itemIndex, 1);
            }
        });

        safeZone.update();
        if (safeZone.isOutside(player)) {
            player.takeDamage(safeZone.damage);
        }
        bots.forEach(bot => {
            if (safeZone.isOutside(bot)) {
                bot.takeDamage(safeZone.damage);
            }
        });

        updateHUD();

        if (player.isAlive() && bots.length === 0) {
            endGame(true);
        }
    }

    function draw() {
        ctx.fillStyle = '#55c4ff'; // Céu azul
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#8bc34a'; // Chão verde
        ctx.fillRect(0, canvas.height / 2, canvas.width, canvas.height / 2);

        const angleStep = player.fov / canvas.width;
        for (let i = 0; i < canvas.width; i++) {
            const angle = player.rotation - player.fov / 2 + i * angleStep;
            const ray = {
                x: player.x,
                y: player.y,
                vx: Math.cos(angle),
                vy: Math.sin(angle)
            };
            let dist = 0;
            let hit = false;
            while (dist < 1000) {
                ray.x += ray.vx;
                ray.y += ray.vy;
                dist++;
                if (ray.x < 0 || ray.x > MAP_WIDTH || ray.y < 0 || ray.y > MAP_HEIGHT) {
                    hit = true;
                    break;
                }
            }
            if (hit) {
                const wallHeight = (canvas.height / dist) * 100;
                ctx.fillStyle = '#5c6c74';
                ctx.fillRect(i, canvas.height / 2 - wallHeight / 2, 1, wallHeight);
            }
        }

        const visibleBots = bots
            .filter(bot => {
                const dist = Math.hypot(bot.x - player.x, bot.y - player.y);
                const angleToBot = Math.atan2(bot.y - player.y, bot.x - player.x);
                const angleDiff = Math.abs(player.rotation - angleToBot);
                return dist < 800 && angleDiff < player.fov / 2;
            })
            .sort((a, b) => Math.hypot(b.x - player.x, b.y - player.y) - Math.hypot(a.x - player.x, a.y - player.y));

        visibleBots.forEach(bot => {
            const dist = Math.hypot(bot.x - player.x, bot.y - player.y);
            const botSize = (canvas.height / dist) * bot.size * 2;
            const botScreenX = canvas.width / 2 + (Math.atan2(bot.y - player.y, bot.x - player.x) - player.rotation) * (canvas.width / player.fov);

            ctx.drawImage(bot.image, botScreenX - botSize / 2, canvas.height / 2 - botSize / 2, botSize, botSize);

            ctx.fillStyle = 'red';
            ctx.fillRect(botScreenX - botSize / 2, canvas.height / 2 - botSize / 2 - 10, botSize, 5);
            ctx.fillStyle = 'green';
            ctx.fillRect(botScreenX - botSize / 2, canvas.height / 2 - botSize / 2 - 10, botSize * (bot.health / bot.maxHealth), 5);
        });

        projectiles.forEach(proj => {
            const dist = Math.hypot(proj.x - player.x, proj.y - player.y);
            if (dist < 1000) {
                 const projSize = (canvas.height / dist) * proj.size;
                 const projScreenX = canvas.width / 2 + (Math.atan2(proj.y - player.y, proj.x - player.x) - player.rotation) * (canvas.width / player.fov);
                 ctx.fillStyle = proj.color;
                 ctx.beginPath();
                 ctx.arc(projScreenX, canvas.height / 2, projSize, 0, Math.PI * 2);
                 ctx.fill();
            }
        });
    }

    // Função para desenhar o minimap
    function drawMinimap() {
        minimapCtx.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

        const scaleX = MINIMAP_SIZE / MAP_WIDTH;
        const scaleY = MINIMAP_SIZE / MAP_HEIGHT;

        // Desenha a zona segura
        minimapCtx.fillStyle = 'rgba(255, 0, 0, 0.2)';
        minimapCtx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
        minimapCtx.beginPath();
        minimapCtx.arc(safeZone.x * scaleX, safeZone.y * scaleY, safeZone.radius * scaleX, 0, Math.PI * 2);
        minimapCtx.fillStyle = 'rgba(0, 255, 0, 0.2)';
        minimapCtx.fill();
        minimapCtx.strokeStyle = 'white';
        minimapCtx.stroke();

        // Desenha o jogador
        minimapCtx.fillStyle = 'blue';
        minimapCtx.beginPath();
        minimapCtx.arc(player.x * scaleX, player.y * scaleY, player.size * scaleX * 0.8, 0, Math.PI * 2);
        minimapCtx.fill();

        // Desenha os bots
        minimapCtx.fillStyle = 'red';
        bots.forEach(bot => {
            minimapCtx.beginPath();
            minimapCtx.arc(bot.x * scaleX, bot.y * scaleY, bot.size * scaleX * 0.8, 0, Math.PI * 2);
            minimapCtx.fill();
        });
    }

    function updateHUD() {
        const healthPercentage = (player.health / player.maxHealth) * 100;
        healthBar.style.width = `${healthPercentage}%`;
        healthBar.style.backgroundColor = healthPercentage > 50 ? '#4CAF50' : healthPercentage > 25 ? '#f1c40f' : '#e74c3c';
        healthText.textContent = `${Math.ceil(player.health)}/${player.maxHealth}`;

        playersLeftText.textContent = bots.length + 1; // Bots + jogador
        const minutes = Math.floor(safeZone.timer / 60).toString().padStart(2, '0');
        const seconds = (safeZone.timer % 60).toString().padStart(2, '0');
        zoneTimerText.textContent = `${minutes}:${seconds}`;
    }

    function endGame(isVictory) {
        if (gameState === 'GAMEOVER') return;

        gameState = 'GAMEOVER';
        safeZone.stopTimer();
        cancelAnimationFrame(animationFrameId);

        if (isVictory) {
            gameOverTitle.textContent = "Você Venceu!";
            gameOverTitle.style.color = '#2ecc71';
        } else {
            gameOverTitle.textContent = "Você Perdeu!";
            gameOverTitle.style.color = '#e74c3c';
        }
        showScreen('gameover');
    }

    function showScreen(screenName) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

        if (screenName === 'menu') mainMenu.classList.add('active');
        else if (screenName === 'game') gameScreen.classList.add('active');
        else if (screenName === 'gameover') gameOverScreen.classList.add('active');
    }

    // --- EVENT LISTENERS ---

    window.addEventListener('keydown', (e) => {
        keys[e.key.toLowerCase()] = true;
        if (gameState === 'DROPPING' && e.code === 'Space') {
            player.isDropping = true;
        }
    });
    window.addEventListener('keyup', (e) => {
        keys[e.key.toLowerCase()] = false;
    });

    canvas.addEventListener('click', (e) => {
        if (gameState !== 'PLAYING' || !player.isAlive()) return;
        const angle = player.rotation;
        projectiles.push(new Projectile(player.x, player.y, angle, player));
    });

    startButton.addEventListener('click', init);
    restartButton.addEventListener('click', () => {
        showScreen('menu');
    });

    howToPlayButton.addEventListener('click', () => {
        howToPlayModal.style.display = 'block';
    });
    settingsButton.addEventListener('click', () => {
        settingsModal.style.display = 'block';
    });
    closeButtons.forEach(button => {
        button.addEventListener('click', () => {
            howToPlayModal.style.display = 'none';
            settingsModal.style.display = 'none';
        });
    });
    window.addEventListener('click', (e) => {
        if (e.target == howToPlayModal) howToPlayModal.style.display = 'none';
        if (e.target == settingsModal) settingsModal.style.display = 'none';
    });

    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });

    setTimeout(() => {
        loadingScreen.classList.remove('active');
        mainMenu.classList.add('active');
    }, 1500);
};