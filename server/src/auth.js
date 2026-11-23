// Autentificare (cine ești) și autorizare (ce ai voie), verificate pe server la fiecare cerere.
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { HttpError, forbidden } from './errors.js';
import { User } from './models/index.js';

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

export const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role });

const unauthorized = (message) => new HttpError(401, 'UNAUTHENTICATED', message);

export async function requireAuth(req, res, next) {
  const header = req.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return next(unauthorized('Lipsește token-ul de autentificare'));

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return next(unauthorized('Token invalid sau expirat'));
  }
  // Citim utilizatorul din baza de date: un cont șters nu mai are acces, iar rolul e cel actual.
  const user = await User.findByPk(payload.sub);
  if (!user) return next(unauthorized('Utilizatorul nu mai există'));
  req.user = publicUser(user);
  next();
}

export const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return next(forbidden());
  next();
};
