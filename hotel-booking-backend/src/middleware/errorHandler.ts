import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

// Standardized error response interface
interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code: string;
    statusCode: number;
    correlationId: string;
    timestamp: string;
    path?: string;
    method?: string;
    stack?: string;
    details?: any;
  };
}

// Custom AppError class for typed errors
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public details?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    details?: any
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }

  withDetails(details: any): AppError {
    this.details = details;
    return this;
  }
}

// Async route wrapper to catch all errors in async handlers
export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Global error handling middleware - MUST have 4 parameters
export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const correlationId = randomUUID();
  const timestamp = new Date().toISOString();
  const isProduction = process.env.NODE_ENV === 'production';

  let statusCode = 500;
  let errorCode = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';

  // Handle known AppErrors
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    errorCode = err.code;
    message = err.message;
  } 
  // Handle JWT errors
  else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorCode = 'INVALID_TOKEN';
    message = 'Invalid authentication token';
  }
  else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    errorCode = 'TOKEN_EXPIRED';
    message = 'Authentication token has expired';
  }
  // Handle Supabase/PostgreSQL duplicate key errors (23505)
  else if ((err as any).code === '23505') {
    statusCode = 409;
    errorCode = 'DUPLICATE_ENTRY';
    message = 'Duplicate resource entry';
  }
  // Handle Supabase/PostgreSQL invalid UUID / cast errors (22P02)
  else if ((err as any).code === '22P02') {
    statusCode = 400;
    errorCode = 'INVALID_ID';
    message = 'Invalid resource identifier format';
  }
  // Handle Supabase/PostgreSQL foreign key violation (23503)
  else if ((err as any).code === '23503') {
    statusCode = 400;
    errorCode = 'FOREIGN_KEY_VIOLATION';
    message = 'Referenced resource does not exist';
  }
  // Handle Syntax errors (invalid JSON)
  else if (err instanceof SyntaxError && 'body' in err) {
    statusCode = 400;
    errorCode = 'INVALID_JSON';
    message = 'Invalid JSON payload';
  }
  // Handle multer file upload errors
  else if (err.name === 'MulterError') {
    statusCode = 400;
    errorCode = 'FILE_UPLOAD_ERROR';
    message = err.message;
  }

  // Log error with full context
  console.error(`[${timestamp}] [ERROR] [${correlationId}] ${err.message}`);
  console.error(`  Path: ${req.method} ${req.path}`);
  console.error(`  Status: ${statusCode} | Code: ${errorCode}`);
  if (!isProduction) {
    console.error(err.stack);
  }

  // Build response
  const response: ErrorResponse = {
    success: false,
    error: {
      message,
      code: errorCode,
      statusCode,
      correlationId,
      timestamp,
      path: req.path,
      method: req.method,
      details: (err as any).details,
    },
  };

  // Add stack trace only in development
  if (!isProduction) {
    response.error.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

// Process level unhandled error handlers (prevent server crash)
export const setupProcessErrorHandlers = () => {
  process.on('uncaughtException', (error: Error) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [FATAL] Uncaught Exception:`, error.message);
    console.error(error.stack);
    
    // Do NOT exit process - let the server continue running
    // Only exit on truly unrecoverable errors
    if (!(error instanceof AppError) || !error.isOperational) {
      // Graceful exit after 1 second for critical errors
      setTimeout(() => process.exit(1), 1000);
    }
  });

  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [ERROR] Unhandled Rejection at:`, promise);
    if (reason instanceof Error) {
      console.error(`Reason: ${reason.message}`);
      console.error(reason.stack);
    } else {
      console.error('Reason:', reason);
    }
    
    // Do NOT crash server for unhandled promise rejections
  });
};
