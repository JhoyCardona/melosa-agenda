import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  userId?: string;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  // A browser-initiated download (opening the ZIP URL directly, e.g. from the
  // mobile app via Linking) can't attach an Authorization header, so it passes
  // the same JWT as ?token= instead.
  const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : queryToken;

  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as unknown as { userId: string };
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}
