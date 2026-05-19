/**
 * Compliance Middleware
 * Handles security headers, audit logging, and accessibility compliance
 */

import { Request, Response, NextFunction } from 'express';
import { ComplianceManager, ComplianceAuditLog } from '../utils/complianceUtils';

// Enhanced security middleware with compliance headers
export const complianceMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Apply security headers
    ComplianceManager.applySecurityHeaders(res);

    // Check accessibility compliance
    const accessibilityMetrics = ComplianceManager.checkAccessibilityCompliance(req);
    
    // Add accessibility metrics to response headers for monitoring
    res.setHeader('X-Screen-Reader-Support', accessibilityMetrics.screenReaderCompatible.toString());
    res.setHeader('X-Accessibility-Checked', new Date().toISOString());

    // Log compliance audit entry for all requests
    const auditLog = ComplianceManager.generateAuditLog(
      req,
      req.method,
      req.path,
      {
        statusCode: null, // Will be set after response
        responseTime: null, // Will be calculated after response
        accessibilityMetrics
      },
      'DATA_ACCESS',
      'LOW'
    );

    // Store audit log in request for later use
    (req as any).auditLog = auditLog;
  } catch (error) {
    console.error("complianceMiddleware error:", error);
  }

  next();
};

// Audit logging middleware (runs after response)
export const auditMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    const startTime = Date.now();
    const originalSend = res.send;

    // Override res.send to capture response data
    res.send = function(data: any) {
      try {
        const endTime = Date.now();
        const responseTime = endTime - startTime;

        // Update audit log with response data
        const auditLog = (req as any).auditLog as ComplianceAuditLog;
        if (auditLog) {
          auditLog.details.statusCode = res.statusCode;
          auditLog.details.responseTime = responseTime;
          
          // Determine risk level based on response
          if (res.statusCode >= 500) {
            auditLog.riskLevel = 'HIGH';
          } else if (res.statusCode >= 400) {
            auditLog.riskLevel = 'MEDIUM';
          }

          // Log the audit entry
          ComplianceManager.logAuditEntry(auditLog);
        }
      } catch (err) {
        console.error("auditMiddleware send override error:", err);
      }

      // Call original send
      return originalSend.call(this, data);
    };
  } catch (error) {
    console.error("auditMiddleware error:", error);
  }

  next();
};

// Data privacy compliance middleware
export const privacyMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check if request involves sensitive data
    const sensitiveEndpoints = [
      '/api/auth',
      '/api/users',
      '/api/bookings',
      '/api/payments'
    ];

    const isSensitiveRequest = sensitiveEndpoints.some(endpoint => 
      req.path.startsWith(endpoint)
    );

    if (isSensitiveRequest) {
      // Add privacy headers
      res.setHeader('X-Privacy-Notice', 'This request processes personal data in accordance with applicable privacy laws');
      res.setHeader('X-Data-Retention', 'Data is retained only as long as necessary for service provision and legal compliance');
      
      // Log privacy audit entry
      const auditLog = ComplianceManager.generateAuditLog(
        req,
        'DATA_PROCESSING',
        req.path,
        {
          endpoint: req.path,
          method: req.method,
          sensitiveData: true
        },
        'DATA_ACCESS',
        'MEDIUM'
      );

      ComplianceManager.logAuditEntry(auditLog);
    }
  } catch (error) {
    console.error("privacyMiddleware error:", error);
  }

  next();
};

// Accessibility compliance middleware
export const accessibilityMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Add accessibility headers
    res.setHeader('X-Accessibility-Policy', 'WCAG-2.1-AA');
    res.setHeader('X-Screen-Reader-Support', 'enabled');
    res.setHeader('X-Keyboard-Navigation', 'enabled');
    res.setHeader('X-Color-Contrast', 'AA-compliant');

    // Check for screen reader and adjust response if needed
    const userAgent = req.get('User-Agent') || '';
    const isScreenReader = ComplianceManager.detectScreenReader(userAgent);

    if (isScreenReader) {
      // Add screen reader specific headers
      res.setHeader('X-Screen-Reader-Optimized', 'true');
      
      // Log accessibility audit entry
      const auditLog = ComplianceManager.generateAuditLog(
        req,
        'ACCESSIBILITY_SUPPORT',
        req.path,
        {
          screenReader: true,
          userAgent: userAgent
        },
        'DATA_ACCESS',
        'LOW'
      );

      ComplianceManager.logAuditEntry(auditLog);
    }
  } catch (error) {
    console.error("accessibilityMiddleware error:", error);
  }

  next();
};

// Rate limiting compliance middleware
export const rateLimitComplianceMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    res.setHeader('X-Rate-Limit-Compliance', 'RFC 6585');
    res.setHeader('X-Rate-Limit-Policy', 'Fair usage policy applies');
  } catch (error) {
    console.error("rateLimitComplianceMiddleware error:", error);
  }
  
  next();
};

// Data retention compliance middleware
export const dataRetentionMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    res.setHeader('X-Data-Retention-Policy', 'Data retained according to legal requirements');
    res.setHeader('X-Data-Deletion-Policy', 'Data deleted upon request or legal obligation');
  } catch (error) {
    console.error("dataRetentionMiddleware error:", error);
  }
  
  next();
};

// GDPR compliance middleware
export const gdprComplianceMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Add GDPR headers
    res.setHeader('X-GDPR-Compliant', 'true');
    res.setHeader('X-Data-Processing-Basis', 'Legitimate interest and consent');
    res.setHeader('X-User-Rights', 'Access, rectification, portability, erasure, objection');
    
    // Log GDPR audit entry for EU requests
    const clientIP = ComplianceManager.getClientIP(req);
    
    const auditLog = ComplianceManager.generateAuditLog(
      req,
      'GDPR_PROCESSING',
      req.path,
      {
        clientIP: clientIP,
        gdprRelevant: true,
        dataProcessingBasis: 'consent'
      },
      'DATA_ACCESS',
      'MEDIUM'
    );

    ComplianceManager.logAuditEntry(auditLog);
  } catch (error) {
    console.error("gdprComplianceMiddleware error:", error);
  }
  
  next();
};

// Payment compliance middleware (PCI DSS)
export const paymentComplianceMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.path.includes('/payment') || req.path.includes('/gcash')) {
      // Add PCI DSS compliance headers
      res.setHeader('X-PCI-DSS-Compliant', 'true');
      res.setHeader('X-Payment-Security', 'Tokenized and encrypted');
      res.setHeader('X-Fraud-Detection', 'enabled');
      
      // Log payment audit entry
      const auditLog = ComplianceManager.generateAuditLog(
        req,
        'PAYMENT_PROCESSING',
        req.path,
        {
          paymentMethod: req.body?.paymentMethod || 'payment_intent_creation',
          amount: req.body?.amount ? '[REDACTED]' : undefined,
          pciCompliant: true
        },
        'PAYMENT',
        'HIGH'
      );

      // Log asynchronously (fire and forget for middleware)
      ComplianceManager.logAuditEntry(auditLog).catch(console.error);
    }
  } catch (error) {
    console.error("paymentComplianceMiddleware error:", error);
  }

  next();
};

// Booking compliance middleware
export const bookingComplianceMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.path.includes('/booking')) {
      // Add booking compliance headers
      res.setHeader('X-Booking-Compliance', 'PH-Tourism-Act');
      res.setHeader('X-Consumer-Protection', 'enabled');
      
      // Log booking audit entry
      const auditLog = ComplianceManager.generateAuditLog(
        req,
        'BOOKING_PROCESSING',
        req.path,
        {
          bookingType: (req.body && req.body.paymentMethod) || 'unknown',
          consumerProtection: true
        },
        'BOOKING',
        'MEDIUM'
      );

      ComplianceManager.logAuditEntry(auditLog);
    }
  } catch (error) {
    console.error("bookingComplianceMiddleware error:", error);
  }

  next();
};

// Combined compliance middleware
export const applyComplianceMiddleware = (app: any) => {
  app.use(complianceMiddleware);
  app.use(auditMiddleware);
  app.use(privacyMiddleware);
  app.use(accessibilityMiddleware);
  app.use(rateLimitComplianceMiddleware);
  app.use(dataRetentionMiddleware);
  app.use(gdprComplianceMiddleware);
  app.use(paymentComplianceMiddleware);
  app.use(bookingComplianceMiddleware);
};
