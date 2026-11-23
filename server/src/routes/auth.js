import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/index.js';
import { signToken, publicUser, requireAuth } from '../auth.js';
import { HttpError, badRequest } from '../errors.js';

export const authRouter = Router();

// Hash fals folosit când emailul nu există: răspunsul durează la fel,
// deci un atacator nu poate afla din timp ce emailuri sunt înregistrate.
const DUMMY_HASH = bcrypt.hashSync('parola-inexistenta', 10);

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    throw badRequest('email și password sunt obligatorii');
  }
  const user = await User.findOne({ where: { email: email.trim().toLowerCase() } });
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email sau parolă greșite');
  res.json({ token: signToken(user), user: publicUser(user) });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});
