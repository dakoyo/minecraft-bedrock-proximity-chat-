function toUTF8Bytes(str: string): Uint8Array {
    let out: number[] = [];
    for (let i = 0; i < str.length; i++) {
        let charcode = str.charCodeAt(i);
        if (charcode < 0x80) {
            out.push(charcode);
        } else if (charcode < 0x800) {
            out.push(0xc0 | (charcode >> 6));
            out.push(0x80 | (charcode & 0x3f));
        } else if (charcode < 0xd800 || charcode >= 0xe000) {
            out.push(0xe0 | (charcode >> 12));
            out.push(0x80 | ((charcode >> 6) & 0x3f));
            out.push(0x80 | (charcode & 0x3f));
        } else {
            i++;
            charcode = 0x10000 + (((charcode & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
            out.push(0xf0 | (charcode >> 18));
            out.push(0x80 | ((charcode >> 12) & 0x3f));
            out.push(0x80 | ((charcode >> 6) & 0x3f));
            out.push(0x80 | (charcode & 0x3f));
        }
    }
    return new Uint8Array(out);
}

export function btoa(input: string): string {
    const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const utf8Bytes = toUTF8Bytes(input);
    let result = '';
    let i = 0;
    const len = utf8Bytes.length;

    while (i < len) {
        const byte1 = utf8Bytes[i++];
        const byte2 = i < len ? utf8Bytes[i++] : NaN;
        const byte3 = i < len ? utf8Bytes[i++] : NaN;

        const index1 = byte1 >> 2;
        const index2 = ((byte1 & 0x03) << 4) | (byte2 >> 4);
        const index3 = ((byte2 & 0x0f) << 2) | (byte3 >> 6);
        const index4 = byte3 & 0x3f;

        result += base64Chars[index1];
        result += base64Chars[index2];

        if (isNaN(byte2)) {
            result += '==';
        } else {
            result += base64Chars[index3];
            if (isNaN(byte3)) {
                result += '=';
            } else {
                result += base64Chars[index4];
            }
        }
    }

    return result;
}