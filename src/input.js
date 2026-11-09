// Teclado e mouse.
//  - teclas pressionadas: isDown('w'), isDown('shift'), ...
//  - câmera: segurar o botão DIREITO do mouse e arrastar; consumeLook() devolve quantos pixels
//    o mouse andou na horizontal desde a última chamada.
export function createInput(target = window) {
    const down = new Set();
    let looking = false;
    let lookDx = 0;

    target.addEventListener('keydown', (e) => down.add(e.key.toLowerCase()));
    target.addEventListener('keyup', (e) => down.delete(e.key.toLowerCase()));
    target.addEventListener('mousedown', (e) => {
        if (e.button === 2) looking = true;
    });
    target.addEventListener('mouseup', (e) => {
        if (e.button === 2) looking = false;
    });
    target.addEventListener('mousemove', (e) => {
        if (looking) lookDx += e.movementX;
    });
    // O botão direito é usado para girar a câmera: não abre o menu do navegador
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    target.addEventListener('blur', () => {
        down.clear();
        looking = false;
    });

    return {
        isDown: (key) => down.has(key),
        consumeLook() {
            const d = lookDx;
            lookDx = 0;
            return d;
        },
        reset() {
            down.clear();
            looking = false;
            lookDx = 0;
        },
    };
}
