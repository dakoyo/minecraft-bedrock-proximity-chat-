export function generateRandomRoomCode(length: number = 5): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';

    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * chars.length);
        result += chars[randomIndex];
    }

    return result;
}

export function generateRandomPlayerCode(length: number = 4): string {
    return generateRandomRoomCode(length);
}