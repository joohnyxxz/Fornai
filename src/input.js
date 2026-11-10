// Teclado e mouse.
//  - teclas pressionadas: isDown('w'), isDown('shift'), ...
//  - mouse "preso" na tela (pointer lock, como num FPS): qualquer movimento gira a câmera, na
//    horizontal e na vertical, e Esc solta o cursor. consumeLook() devolve quantos pixels o mouse
//    andou desde a última chamada: { x, y }.
//  - botão ESQUERDO do mouse (segurar): atira; isMouseDown(0)
//  - plano B, se o navegador não permitir prender o mouse: segurar o botão DIREITO e arrastar
//    também gira a câmera.
export function createInput(target = window, lockElement = null) {
    const down = new Set();
    const buttons = new Set();
    let dragging = false; // botão direito (plano B)
    let lookX = 0;
    let lookY = 0;

    const isLocked = () => !!lockElement && document.pointerLockElement === lockElement;

    target.addEventListener('keydown', (e) => down.add(e.key.toLowerCase()));
    target.addEventListener('keyup', (e) => down.delete(e.key.toLowerCase()));
    target.addEventListener('mousedown', (e) => {
        buttons.add(e.button);
        if (e.button === 2) dragging = true;
    });
    target.addEventListener('mouseup', (e) => {
        buttons.delete(e.button);
        if (e.button === 2) dragging = false;
    });
    target.addEventListener('mousemove', (e) => {
        if (isLocked() || dragging) {
            lookX += e.movementX;
            lookY += e.movementY;
        }
    });
    // O botão direito não abre o menu do navegador durante o jogo
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    target.addEventListener('blur', () => {
        down.clear();
        buttons.clear();
        dragging = false;
    });

    return {
        isDown: (key) => down.has(key),
        isMouseDown: (button) => buttons.has(button),
        isLocked,
        /** Pede ao navegador para prender o mouse (precisa ser chamado de um clique do jogador). */
        requestLock() {
            if (lockElement && lockElement.requestPointerLock) lockElement.requestPointerLock();
        },
        releaseLock() {
            if (isLocked() && document.exitPointerLock) document.exitPointerLock();
        },
        consumeLook() {
            const look = { x: lookX, y: lookY };
            lookX = 0;
            lookY = 0;
            return look;
        },
        reset() {
            down.clear();
            buttons.clear();
            dragging = false;
            lookX = 0;
            lookY = 0;
        },
    };
}
