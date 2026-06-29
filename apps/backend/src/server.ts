import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { authRouter } from './routes/auth.js';
import { coreRouter } from './routes/core.js';

const app = express();
app.use(cors());
app.use(express.json());
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/auth', authRouter);
app.use('/', coreRouter);

const port = Number(process.env.API_PORT || 4000);
app.listen(port, () => console.log(`API listening on :${port}`));
