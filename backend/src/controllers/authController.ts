import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AuthRequest } from '../middleware/authMiddleware';

const prisma = new PrismaClient();

export async function login(req: Request, res: Response) {
  const { username, password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'La contraseña es requerida' });
  }

  // The web login still sends a username; the mobile app only asks for the
  // password. Since this is a single-user system, "no username" resolves to the
  // one account that exists.
  const user = username
    ? await prisma.user.findUnique({ where: { username } })
    : await prisma.user.findFirst();

  if (!user) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatches) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const token = jwt.sign(
    { userId: user.id, username: user.username },
    process.env.JWT_SECRET as string,
    // 30d covers the mobile app (daily use). The web enforces its own shorter
    // 3-day session client-side (see AdminAuth on the web).
    { expiresIn: '30d' }
  );

  res.json({ token, username: user.username });
}

// Re-checks the logged-in user's password. Used by the web admin panel as a
// confirmation gate before editing a product or an already-scheduled order.
export async function verifyPassword(req: AuthRequest, res: Response) {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Contraseña requerida' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) {
    return res.status(401).json({ error: 'Sesión inválida' });
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }

  res.json({ ok: true });
}
