import { CONFIG } from './config.js';
import { createRng } from './rng.js';
import { Zone } from './zone.js';
import { generateWorld, findFreeSpot } from './world.js';
import { Player } from './player.js';
import { createInput } from './input.js';
import { Renderer, loadGround } from './render.js';
import { drawMinimap, MINIMAP_SIZE } from './minimap.js';
import { createHud } from './hud.js';

// Parâmetros de teste pela URL (ex.: index.html?ts=8&imortal)
//   ts=N    -> acelera o tempo da zona N vezes
//   imortal -> a tempestade não causa dano
const params = new URLSearchParams(window.location.search);
const TIME_SCALE = Math.max(0.1, Number(params.get('ts')) || 1);
const IMMORTAL = params.has('imortal');

// --- Elementos do DOM ---
const loadingScreen = document.getElementById('loading-screen');
const mainMenu = document.getElementById('main-menu');
const gameScreen = document.getElementById('game-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const gameOverTitle = document.getElementById('game-over-title');
const gameOverSubtitle = document.getElementById('game-over-subtitle');
const canvas = document.getElementById('game-canvas');
const minimapCanvas = document.getElementById('minimap-canvas');
const minimapCtx = minimapCanvas.getContext('2d');
minimapCanvas.width = MINIMAP_SIZE;
minimapCanvas.height = MINIMAP_SIZE;

const howToPlayModal = document.getElementById('how-to-play-modal');
const settingsModal = document.getElementById('settings-modal');

const input = createInput();
const hud = createHud();
let renderer = null; // criado depois que as imagens carregam (ver final do arquivo)

let state = 'MENU'; // MENU | PLAYING | GAMEOVER
let game = null; // { world, zone, player }
let lastTime = 0;
let elapsed = 0;
let frameId = null;

function showScreen(name) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    if (name === 'menu') mainMenu.classList.add('active');
    else if (name === 'game') gameScreen.classList.add('active');
    else if (name === 'gameover') gameOverScreen.classList.add('active');
}

function startGame() {
    const seed = (Math.random() * 2 ** 32) >>> 0;
    const rng = createRng(seed);
    const world = generateWorld(rng, CONFIG.MAP_SIZE, CONFIG.WORLD, CONFIG.WORLD.minGap, CONFIG.WORLD.margin);
    const zone = new Zone(CONFIG.ZONE, CONFIG.MAP_SIZE, rng);
    const spot = findFreeSpot(rng, world, CONFIG.PLAYER.radius);
    const player = new Player(spot.x, spot.y);

    game = { world, zone, player };
    if (params.has('debug')) window.__fornai = game; // só para testes manuais
    input.reset();
    state = 'PLAYING';
    elapsed = 0;
    renderer.resize(window.innerWidth, window.innerHeight);
    showScreen('game');

    lastTime = performance.now();
    if (frameId) cancelAnimationFrame(frameId);
    frameId = requestAnimationFrame(loop);
}

function endGame() {
    state = 'GAMEOVER';
    cancelAnimationFrame(frameId);
    gameScreen.classList.remove('in-storm');
    gameOverScreen.classList.add('defeat');
    gameOverTitle.textContent = 'Eliminado!';
    gameOverSubtitle.textContent = 'A tempestade te pegou. Fique dentro da zona segura.';
    showScreen('gameover');
}

function loop(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    elapsed += dt;

    const { world, zone, player } = game;

    player.update(dt, input, world);
    zone.update(dt * TIME_SCALE);

    if (!IMMORTAL && zone.isOutside(player.x, player.y)) {
        player.takeDamage(zone.damagePerSecond * dt);
    }

    renderer.render({ player, zone, world, time: elapsed });
    drawMinimap(minimapCtx, { player, zone, world });
    hud.update(player, zone);

    if (!player.isAlive()) {
        endGame();
        return;
    }
    frameId = requestAnimationFrame(loop);
}

// --- Botões e modais ---
document.getElementById('start-button').addEventListener('click', startGame);
document.getElementById('restart-button').addEventListener('click', () => showScreen('menu'));
document.getElementById('how-to-play-button').addEventListener('click', () => {
    howToPlayModal.style.display = 'block';
});
document.getElementById('settings-button').addEventListener('click', () => {
    settingsModal.style.display = 'block';
});
document.querySelectorAll('.close-button').forEach((button) => {
    button.addEventListener('click', () => {
        howToPlayModal.style.display = 'none';
        settingsModal.style.display = 'none';
    });
});
window.addEventListener('click', (e) => {
    if (e.target === howToPlayModal) howToPlayModal.style.display = 'none';
    if (e.target === settingsModal) settingsModal.style.display = 'none';
});
window.addEventListener('resize', () => {
    if (state === 'PLAYING') renderer.resize(window.innerWidth, window.innerHeight);
});

// Tela de carregamento: espera as imagens (e pelo menos 1,2 s) antes de mostrar o menu
Promise.all([
    loadGround(),
    new Promise((resolve) => setTimeout(resolve, 1200)),
]).then(([ground]) => {
    renderer = new Renderer(canvas, ground);
    loadingScreen.classList.remove('active');
    mainMenu.classList.add('active');
});
