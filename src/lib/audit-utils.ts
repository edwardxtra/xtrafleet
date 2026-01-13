/**
 * Utility functions for capturing audit trail information for e-signatures
 */

export interface SignatureAuditData {
  ipAddress: string;
  userAgent: string;
  timestamp: string;
}

/**
 * Get the user's IP address
 * Note: This will get the client's public IP, not their private network IP
 */
export async function getUserIPAddress(): Promise<string> {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip || 'unknown';
  } catch (error) {
    console.error('Failed to get IP address:', error);
    return 'unknown';
  }
}

/**
 * Get the user's browser and device information
 */
export function getUserAgent(): string {
  if (typeof window === 'undefined') return 'server';
  return window.navigator.userAgent;
}

/**
 * Capture complete audit trail for e-signature
 */
export async function captureSignatureAudit(): Promise<SignatureAuditData> {
  const [ipAddress] = await Promise.all([
    getUserIPAddress(),
  ]);
  
  return {
    ipAddress,
    userAgent: getUserAgent(),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Parse user agent to extract readable device/browser info
 */
export function parseUserAgent(userAgent: string): {
  browser: string;
  device: string;
  os: string;
} {
  // Simple parsing - could be enhanced with a library like ua-parser-js
  let browser = 'Unknown';
  let device = 'Desktop';
  let os = 'Unknown';

  // Browser detection
  if (userAgent.includes('Chrome')) browser = 'Chrome';
  else if (userAgent.includes('Firefox')) browser = 'Firefox';
  else if (userAgent.includes('Safari')) browser = 'Safari';
  else if (userAgent.includes('Edge')) browser = 'Edge';

  // Device detection
  if (userAgent.includes('Mobile')) device = 'Mobile';
  else if (userAgent.includes('Tablet')) device = 'Tablet';

  // OS detection
  if (userAgent.includes('Windows')) os = 'Windows';
  else if (userAgent.includes('Mac')) os = 'macOS';
  else if (userAgent.includes('Linux')) os = 'Linux';
  else if (userAgent.includes('Android')) os = 'Android';
  else if (userAgent.includes('iOS')) os = 'iOS';

  return { browser, device, os };
}