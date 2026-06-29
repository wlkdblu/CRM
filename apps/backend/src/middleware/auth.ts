import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

type JwtPayload = { userId: string };

declare global {
  namespace Express { interface Request { user?: Awaited<ReturnType<typeof prisma.user.findUnique>> } }
}

export async function auth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret') as JwtPayload;
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || !user.isActive) return res.status(401).json({ error: 'Unauthorized' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}
