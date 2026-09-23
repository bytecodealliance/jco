import { start, stop } from './server.ts';

const port = await start(Number(process.env.PORT ?? 3000));

console.log(`SvelteKit TODO server listening at http://127.0.0.1:${port}`);
process.once('SIGTERM', () => void stop());
process.once('SIGINT', () => void stop());
