import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { UserRole } from './types.js';

const EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');

function getJwtSecret(): string {
  return process.env.JWT_SECRET && process.env.JWT_SECRET !== 'CHANGE_THIS_TO_A_SECURE_RANDOM_SECRET'
    ? process.env.JWT_SECRET
    : EPHEMERAL_SECRET;
}

export interface AuthPayload {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  deviceId: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthPayload;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  return bcrypt.compare(plain, hashed);
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as AuthPayload;
  } catch {
    return null;
  }
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication token required' });
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  const decoded = verifyToken(token);
  if (!decoded) {
    res.status(401).json({ error: 'Invalid or expired authentication token' });
    return;
  }
  req.user = decoded;
  next();
}

export function requireRole(...allowed: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!allowed.includes(req.user.role)) {
      res.status(403).json({
        error: `Access denied. Required role: ${allowed.join(' or ')}`,
      });
      return;
    }
    next();
  };
}
