import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { SessionManager } from "../utils/sessionUtils";

declare global {
  namespace Express {
    interface Request {
      userId: string;
      user?: any;
    }
  }
}

const verifyToken = async (req: Request, res: Response, next: NextFunction) => {
  // Allow OPTIONS requests (CORS preflight) to pass through without authentication
  if (req.method === 'OPTIONS') {
    return next();
  }

  // Extract token using enhanced session manager
  const token = SessionManager.extractToken(req);

  if (!token) {
    return res.status(401).json({
      message: "unauthorized",
      code: "NO_TOKEN"
    });
  }

  try {
    // First, try to decode the token to determine its format
    const decoded = jwt.decode(token) as any;
    
    if (!decoded) {
      return res.status(401).json({ 
        message: "unauthorized",
        code: "INVALID_TOKEN"
      });
    }

    // Check if this is a new SessionManager format (has sessionId)
    if (decoded.sessionId) {
      // New SessionManager format
      const sessionData = SessionManager.verifyAccessToken(token);
      
      if (!sessionData) {
        return res.status(401).json({ 
          message: "unauthorized",
          code: "INVALID_TOKEN"
        });
      }

      // Check session age limits
      if (SessionManager.isSessionExpired(sessionData.issuedAt)) {
        return res.status(401).json({ 
          message: "Session expired",
          code: "SESSION_EXPIRED"
        });
      }

      // Set user information from session data
      req.userId = sessionData.userId;
      req.user = {
        _id: sessionData.userId,
        id: sessionData.userId,
        email: sessionData.email,
        role: sessionData.role,
        isActive: true,
        sessionId: sessionData.sessionId
      };

      // Add session info to headers for debugging
      res.setHeader('X-Session-ID', sessionData.sessionId);
      res.setHeader('X-Token-Expiry', new Date(sessionData.expiresAt * 1000).toISOString());
      res.setHeader('X-Token-Format', 'session');
      
    } else {
      // Legacy simple format - validate directly for backward compatibility
      const legacyData = jwt.verify(token, process.env.JWT_SECRET_KEY as string) as any;
      
      if (!legacyData || !legacyData.userId) {
        return res.status(401).json({ 
          message: "unauthorized",
          code: "INVALID_LEGACY_TOKEN"
        });
      }

      // Set user information from legacy token
      req.userId = legacyData.userId;
      req.user = {
        _id: legacyData.userId,
        id: legacyData.userId,
        email: legacyData.email,
        role: legacyData.role,
        isActive: true,
        sessionId: `legacy-${legacyData.userId}`
      };

      // Add legacy info to headers for debugging
      res.setHeader('X-Session-ID', `legacy-${legacyData.userId}`);
      res.setHeader('X-Token-Format', 'legacy');
    }

    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(401).json({ 
      message: "unauthorized",
      code: "VERIFICATION_ERROR"
    });
  }
};

export default verifyToken;
