import { createMatch, updateMatch } from './match.js';
import { PALETTE } from './world.js';
import { createInput } from './input.js';
import { Renderer, loadGround } from './render.js';
import { drawMinimap, MINIMAP_SIZE } from './minimap.js';
import { createHud } from './hud.js';

// Parâmetros de teste pela URL (ex.: index.html?ts=8&imortal)
//   ts=N    -> acelera o tempo da zona N vezes
//   imortal -> o jogador não leva dano (nem de tinta nem da tempestade)
//   debug   -> expõe a partida em window.__fornai
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

const pauseOverlay = document.getElementById('pause-overlay');
const howToPlayModal = document.getElementById('how-to-play-modal');
const settingsModal = document.getElementById('settings-modal');

const input = createInput(window, canvas); // o canvas é o elemento que prende o mouse
const hud = createHud();
let renderer = null; // criado depois que as imagens carregam (ver final do arquivo)

let state = 'MENU'; // MENU | PLAYING | GAMEOVER
let match = null;
let lastTime = 0;
let frameId = null;
let hasLocked = false; // o mouse já foi preso nesta partida?
let paused = false; // o jogador apertou Esc (cursor solto): a partida espera

function showScreen(name) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    if (name === 'menu') mainMenu.classList.add('active');
    else if (name === 'game') gameScreen.classList.add('active');
    else if (name === 'gameover') gameOverScreen.classList.add('active');
}

function startGame() {
    match = createMatch();
    if (params.has('debug')) window.__fornai = match; // só para testes manuais
    input.reset();
    hasLocked = false;
    setPaused(false);
    input.requestLock(); // este clique do jogador permite prender o mouse
    state = 'PLAYING';
    gameOverScreen.classList.remove('victory', 'defeat');
    renderer.resize(window.innerWidth, window.innerHeight);
    showScreen('game');

    lastTime = performance.now();
    if (frameId) cancelAnimationFrame(frameId);
    frameId = requestAnimationFrame(loop);
}

function colorName(hex) {
    const found = PALETTE.find((p) => p.base === hex);
    return found ? found.name : 'desconhecida';
}

/** Pausa (cursor solto) ou retoma (mouse preso) a partida. */
function setPaused(value) {
    paused = value;
    pauseOverlay.classList.toggle('show', value);
    if (!value) input.reset(); // teclas que ficaram "apertadas" durante a pausa
}

// Esc solta o cursor: pausa. Clicar de volta prende o mouse e continua.
document.addEventListener('pointerlockchange', () => {
    if (input.isLocked()) {
        hasLocked = true;
        setPaused(false);
    } else if (hasLocked && state === 'PLAYING') {
        setPaused(true);
    }
});
// Se o navegador não deixar prender o mouse, o jogo segue sem pausar (e o botão direito gira a câmera)
document.addEventListener('pointerlockerror', () => {
    hasLocked = false;
});
canvas.addEventListener('click', () => {
    if (state === 'PLAYING' && !input.isLocked()) input.requestLock();
});
pauseOverlay.addEventListener('click', () => input.requestLock());

function endGame() {
    state = 'GAMEOVER';
    cancelAnimationFrame(frameId);
    hasLocked = false;
    setPaused(false);
    input.releaseLock(); // devolve o cursor para clicar nos botões
    gameScreen.classList.remove('in-storm');
    const { result, kills } = match;
    const plural = kills === 1 ? 'eliminação' : 'eliminações';

    if (result.victory) {
        gameOverScreen.classList.add('victory');
        gameOverTitle.textContent = 'Vitória!';
        gameOverSubtitle.textContent = `Último de pé, com ${kills} ${plural}.`;
    } else {
        gameOverScreen.classList.add('defeat');
        gameOverTitle.textContent = 'Eliminado!';
        if (result.reason === 'storm') {
            gameOverSubtitle.textContent = 'A tempestade te pegou. Fique dentro da zona segura.';
        } else {
            const who = result.killer && result.killer.color ? `pelo jogador ${colorName(result.killer.color)}` : 'por um adversário';
            gameOverSubtitle.textContent = `Você foi marcado por ${who}. Eliminações: ${kills}.`;
        }
    }
    showScreen('gameover');
}

function loop(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    if (!paused) updateMatch(match, dt, input, { immortal: IMMORTAL, timeScale: TIME_SCALE });

    renderer.render({
        player: match.player, zone: match.zone, world: match.world, time: match.time,
        bots: match.bots, balls: match.balls, decals: match.decals,
    });
    drawMinimap(minimapCtx, { player: match.player, zone: match.zone, world: match.world });
    hud.update(match);

    if (match.state === 'over') {
        // deixa a tela de fim aparecer um instante depois (dá para ver o último tiro)
        setTimeout(endGame, 700);
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
