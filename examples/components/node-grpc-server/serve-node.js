import { start, stop } from './src/server.js';

const port = await start(Number(process.env.PORT ?? 3000));

console.log(`gRPC server listening at http://127.0.0.1:${port}`);
process.once('SIGTERM', () => stop());
process.once('SIGINT', () => stop());
