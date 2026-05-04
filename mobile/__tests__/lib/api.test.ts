/**
 * Property-based tests for API client JWT interceptor.
 *
 * **Validates: Requirements 3.2**
 *
 * Property 1: API client attaches Bearer token on every request
 */

import * as fc from 'fast-check';
import { AxiosHeaders, InternalAxiosRequestConfig } from 'axios';

// Mock supabase before importing api module
const mockGetSession = jest.fn();
jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      signOut: jest.fn(),
    },
  },
}));

// Import api after mocks are set up
import { api } from '../../lib/api';

/**
 * Arbitrary for generating realistic access token strings.
 * Real JWTs are non-empty strings composed of base64url characters and dots.
 * We use stringMatching to generate from that alphabet, avoiding whitespace
 * edge cases that are AxiosHeaders internals, not interceptor behavior.
 */
const accessTokenArb = fc.stringMatching(/^[a-zA-Z0-9._-]{1,300}$/);

/**
 * Arbitrary for generating Axios request config objects with various
 * HTTP methods and URL paths.
 */
const requestConfigArb = fc.record({
  method: fc.constantFrom('get', 'post', 'put', 'patch', 'delete'),
  url: fc.constantFrom(
    '/dashboard/overview',
    '/activities',
    '/activities/123',
    '/coach/chat',
    '/plans',
    '/sync/now',
    '/garmin/status',
    '/workouts',
    '/workouts/456'
  ),
});

/**
 * Helper: run the request interceptor chain on a config object.
 * Axios stores interceptors internally; we extract and invoke the
 * request interceptor directly to test it in isolation.
 */
async function runRequestInterceptor(
  config: Partial<InternalAxiosRequestConfig>
): Promise<InternalAxiosRequestConfig> {
  const fullConfig: InternalAxiosRequestConfig = {
    headers: new AxiosHeaders({ 'Content-Type': 'application/json' }),
    ...config,
  };

  // Access the interceptor handlers registered on the api instance
  const handlers = (api.interceptors.request as any).handlers as Array<{
    fulfilled: ((config: InternalAxiosRequestConfig) => Promise<InternalAxiosRequestConfig>) | null;
  }>;

  let result = fullConfig;
  for (const handler of handlers) {
    if (handler.fulfilled) {
      result = await handler.fulfilled(result);
    }
  }
  return result;
}

describe('API Client JWT Interceptor - Property Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * **Property 1: API client attaches Bearer token on every request**
   *
   * *For any* Axios request config and any valid Supabase session, the request
   * interceptor SHALL attach the session's access token as a `Bearer` token
   * in the `Authorization` header.
   *
   * **Validates: Requirements 3.2**
   */
  describe('Property 1: API client attaches Bearer token on every request', () => {
    it('attaches Bearer token in Authorization header for any access token and request config', () => {
      return fc.assert(
        fc.asyncProperty(
          accessTokenArb,
          requestConfigArb,
          async (accessToken, reqConfig) => {
            mockGetSession.mockResolvedValue({
              data: {
                session: { access_token: accessToken },
              },
            });

            const result = await runRequestInterceptor({
              method: reqConfig.method,
              url: reqConfig.url,
            });

            // Authorization header SHALL be `Bearer ${accessToken}`
            const authHeader = result.headers.get('Authorization');
            expect(authHeader).toBe(`Bearer ${accessToken}`);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('preserves the exact token string without modification', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.oneof(
            accessTokenArb,
            fc.constant('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'),
            fc.constant('simple-token-123'),
            fc.constant('a'.repeat(500))
          ),
          async (accessToken) => {
            mockGetSession.mockResolvedValue({
              data: {
                session: { access_token: accessToken },
              },
            });

            const result = await runRequestInterceptor({ method: 'get', url: '/test' });

            const authHeader = result.headers.get('Authorization') as string;
            expect(authHeader).toBe(`Bearer ${accessToken}`);

            // Extract the token part after "Bearer " and verify exact match
            const extractedToken = authHeader.slice('Bearer '.length);
            expect(extractedToken).toBe(accessToken);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('does not attach Authorization header when session is null', () => {
      return fc.assert(
        fc.asyncProperty(
          requestConfigArb,
          async (reqConfig) => {
            mockGetSession.mockResolvedValue({
              data: { session: null },
            });

            const result = await runRequestInterceptor({
              method: reqConfig.method,
              url: reqConfig.url,
            });

            // AxiosHeaders.get() returns undefined for absent headers
            const authHeader = result.headers.get('Authorization');
            expect(authHeader).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('attaches Bearer token regardless of HTTP method', () => {
      return fc.assert(
        fc.asyncProperty(
          accessTokenArb,
          fc.constantFrom('get', 'post', 'put', 'patch', 'delete'),
          async (accessToken, method) => {
            mockGetSession.mockResolvedValue({
              data: {
                session: { access_token: accessToken },
              },
            });

            const result = await runRequestInterceptor({ method, url: '/any-endpoint' });

            const authHeader = result.headers.get('Authorization');
            expect(authHeader).toBe(`Bearer ${accessToken}`);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('proceeds without error when getSession throws', () => {
      return fc.assert(
        fc.asyncProperty(
          requestConfigArb,
          fc.string({ minLength: 1, maxLength: 100 }),
          async (reqConfig, errorMessage) => {
            mockGetSession.mockRejectedValue(new Error(errorMessage));

            // Interceptor should not throw — it catches errors gracefully
            const result = await runRequestInterceptor({
              method: reqConfig.method,
              url: reqConfig.url,
            });

            // Config is returned without Authorization header
            expect(result).toBeDefined();
            const authHeader = result.headers.get('Authorization');
            expect(authHeader).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
