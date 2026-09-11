import { Hono } from 'hono';
import { fire } from '@bytecodealliance/jco-std/wasi/0.2.x/http/adapters/hono/server';
import { handleRequest } from './server.js';

const app = new Hono();

app.all('/mcp', (context) => handleRequest(context.req.raw));
fire(app);

export { incomingHandler } from '@bytecodealliance/jco-std/wasi/0.2.x/http/adapters/hono/server';
