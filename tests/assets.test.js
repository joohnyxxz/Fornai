import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Lê a largura/altura de um JPEG procurando o marcador SOF (sem depender de bibliotecas)
function jpegSize(buffer) {
    assert.equal(buffer[0], 0xff);
    assert.equal(buffer[1], 0xd8, 'não é um JPEG');
    let i = 2;
    while (i < buffer.length) {
        assert.equal(buffer[i], 0xff, 'marcador JPEG inválido');
        const marker = buffer[i + 1];
        const length = buffer.readUInt16BE(i + 2);
        const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
        if (isSof) {
            return { height: buffer.readUInt16BE(i + 5), width: buffer.readUInt16BE(i + 7) };
        }
        i += 2 + length;
    }
    throw new Error('marcador SOF não encontrado');
}

const isPowerOfTwo = (n) => n > 0 && (n & (n - 1)) === 0;

test('a textura do chão existe, é quadrada e tem lado em potência de 2', () => {
    const file = readFileSync(new URL('../assets/ground/grass.jpg', import.meta.url));
    const { width, height } = jpegSize(file);
    assert.equal(width, height, 'a textura precisa ser quadrada');
    assert.ok(isPowerOfTwo(width), `o lado (${width}) precisa ser potência de 2 (repetição por máscara de bits)`);
    assert.ok(width >= 256, 'textura pequena demais');
});
