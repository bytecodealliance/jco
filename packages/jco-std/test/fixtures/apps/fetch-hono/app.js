import { Hono } from 'hono';
import { fire } from '@bytecodealliance/jco-std/wasi/0.2.3/http/adapters/hono';

const app = new Hono();
app.get('/', (c) => c.text('Hello World!'));
fire(app);
