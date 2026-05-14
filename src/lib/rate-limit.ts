import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Whether Upstash Redis is configured. When it isn't (local dev, E2E against
// the Firebase emulators), there's no Redis to talk to — constructing the
// client with an empty URL makes every `.limit()` call throw
// "Failed to parse URL from /pipeline" and 500s the route. In that case we
// fall back to a no-op limiter that always allows.
const upstashConfigured = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
);

type Limiter = Pick<Ratelimit, 'limit'>;

const noopLimiter: Limiter = {
  limit: async () => ({
    success: true,
    limit: 0,
    remaining: 0,
    reset: Date.now(),
    pending: Promise.resolve(),
  }),
};

function makeLimiter(requests: number, window: Parameters<typeof Ratelimit.slidingWindow>[1], prefix: string): Limiter {
  if (!upstashConfigured) return noopLimiter;
  return new Ratelimit({
    redis: new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    }),
    limiter: Ratelimit.slidingWindow(requests, window),
    analytics: true,
    prefix,
  });
}

// Define rate limiters for different use cases
export const rateLimiters = {
  // Login/Auth: 20 attempts per 15 minutes
  auth: makeLimiter(20, '15 m', 'ratelimit:auth'),

  // Token refresh: 30 per 15 minutes (higher limit for session refreshes)
  tokenRefresh: makeLimiter(30, '15 m', 'ratelimit:tokenRefresh'),

  // Driver invitations: 10 per hour
  invitations: makeLimiter(10, '1 h', 'ratelimit:invitations'),

  // Load creation: 20 per hour
  loads: makeLimiter(20, '1 h', 'ratelimit:loads'),

  // Driver registration: 3 per hour per IP (prevent abuse)
  registration: makeLimiter(3, '1 h', 'ratelimit:registration'),
};

// Helper function to get client identifier (IP or user ID)
export function getIdentifier(request: Request, userId?: string): string {
  // Prefer user ID if authenticated
  if (userId) {
    return `user:${userId}`;
  }

  // Fall back to IP address
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown';
  return `ip:${ip}`;
}

// Helper to format time remaining
export function formatTimeRemaining(resetTime: number): string {
  const now = Date.now();
  const diff = resetTime - now;
  
  if (diff <= 0) return 'now';
  
  const seconds = Math.ceil(diff / 1000);
  const minutes = Math.ceil(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    if (remainingMinutes > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''} and ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}`;
    }
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  }
  
  if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  }
  
  return `${seconds} second${seconds > 1 ? 's' : ''}`;
}
