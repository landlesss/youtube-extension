import jwt from "jsonwebtoken";
import { config } from "../config.js";

export interface SessionPayload {
  userId: string;
  email: string;
}

export function signSession(payload: SessionPayload): string {
  const options: jwt.SignOptions = { expiresIn: config.jwtExpiresIn as jwt.SignOptions["expiresIn"] };
  return jwt.sign(payload, config.jwtSecret, options);
}

export function verifySession(token: string): SessionPayload {
  return jwt.verify(token, config.jwtSecret) as SessionPayload;
}
