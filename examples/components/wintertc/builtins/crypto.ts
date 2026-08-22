const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export async function testCrypto(): Promise<boolean> {
    const random = new Uint8Array(16);
    const filledRandom = crypto.getRandomValues(random);
    const input = new TextEncoder().encode('jco');
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
    return filledRandom === random && random.length === 16 && digest.length === 32 && UUID_V4.test(crypto.randomUUID());
}
