/**
 * Property-based tests for error handling utilities.
 *
 * **Validates: Requirements 17.2**
 *
 * Property 13: Error extraction returns backend detail message
 */

import * as fc from 'fast-check';
import { extractApiError, ApiError } from '../../lib/error-handling';

/**
 * Arbitrary for generating Axios-style error objects with response.data.detail
 */
const axiosErrorWithDetailArb = fc.record({
  response: fc.record({
    status: fc.integer({ min: 400, max: 599 }),
    data: fc.record({
      detail: fc.string({ minLength: 1, maxLength: 500 }),
    }),
  }),
  message: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
});

/**
 * Arbitrary for generating Axios-style error objects without detail
 */
const axiosErrorWithoutDetailArb = fc.record({
  response: fc.record({
    status: fc.integer({ min: 400, max: 599 }),
    data: fc.oneof(
      fc.constant({}),
      fc.constant(undefined),
      fc.record({ other: fc.string() })
    ),
  }),
  message: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
});

describe('Error Handling Utilities - Property Tests', () => {
  /**
   * **Property 13: Error extraction returns backend detail message**
   *
   * *For any* Axios error response object containing a `response.data.detail` string,
   * `extractApiError` SHALL return an `ApiError` whose `message` field equals that
   * `detail` string.
   *
   * **Validates: Requirements 17.2**
   */
  describe('Property 13: Error extraction returns backend detail message', () => {
    it('returns the detail string as the message for any Axios error with response.data.detail', () => {
      fc.assert(
        fc.property(
          axiosErrorWithDetailArb,
          (axiosError) => {
            const result = extractApiError(axiosError);

            // The message field SHALL equal the detail string
            expect(result.message).toBe(axiosError.response.data.detail);

            // The detail field should also be set
            expect(result.detail).toBe(axiosError.response.data.detail);

            // The status should be preserved
            expect(result.status).toBe(axiosError.response.status);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('preserves the exact detail string without modification', () => {
      fc.assert(
        fc.property(
          // Test with various string patterns including special characters
          fc.string({ minLength: 1, maxLength: 500 }),
          fc.integer({ min: 400, max: 599 }),
          (detailMessage, statusCode) => {
            const axiosError = {
              response: {
                status: statusCode,
                data: { detail: detailMessage },
              },
            };

            const result = extractApiError(axiosError);

            // The message must be exactly equal to the detail
            expect(result.message).toBe(detailMessage);
            expect(result.detail).toBe(detailMessage);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('handles detail strings with special characters', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string({ minLength: 1 }),
            fc.constant('Error: Invalid credentials'),
            fc.constant('User not found'),
            fc.constant('Rate limit exceeded. Try again in 60 seconds.'),
            fc.constant('Invalid JSON: unexpected token at position 42'),
            fc.constant('Field "email" is required'),
            fc.constant("Can't process request: database unavailable"),
            fc.string({ minLength: 1, maxLength: 200, unit: 'grapheme' })
          ),
          fc.integer({ min: 400, max: 599 }),
          (detailMessage, statusCode) => {
            const axiosError = {
              response: {
                status: statusCode,
                data: { detail: detailMessage },
              },
            };

            const result = extractApiError(axiosError);

            expect(result.message).toBe(detailMessage);
            expect(result.detail).toBe(detailMessage);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('returns ApiError with correct structure for any valid Axios error', () => {
      fc.assert(
        fc.property(
          axiosErrorWithDetailArb,
          (axiosError) => {
            const result = extractApiError(axiosError);

            // Result should be a valid ApiError object
            expect(typeof result).toBe('object');
            expect(result).not.toBeNull();

            // message is required and must be a string
            expect(typeof result.message).toBe('string');
            expect(result.message.length).toBeGreaterThan(0);

            // status should be a number when present
            expect(typeof result.status).toBe('number');

            // detail should match the input detail
            expect(result.detail).toBe(axiosError.response.data.detail);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('falls back to axiosError.message when detail is not present', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }),
          fc.integer({ min: 400, max: 599 }),
          (errorMessage, statusCode) => {
            const axiosError = {
              response: {
                status: statusCode,
                data: {}, // No detail field
              },
              message: errorMessage,
            };

            const result = extractApiError(axiosError);

            // Should fall back to the error message
            expect(result.message).toBe(errorMessage);
            expect(result.detail).toBeUndefined();
            expect(result.status).toBe(statusCode);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('falls back to "Request failed" when neither detail nor message is present', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 400, max: 599 }),
          (statusCode) => {
            const axiosError = {
              response: {
                status: statusCode,
                data: {}, // No detail field
              },
              // No message field
            };

            const result = extractApiError(axiosError);

            expect(result.message).toBe('Request failed');
            expect(result.detail).toBeUndefined();
            expect(result.status).toBe(statusCode);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('handles native Error instances', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }),
          (errorMessage) => {
            const error = new Error(errorMessage);

            const result = extractApiError(error);

            expect(result.message).toBe(errorMessage);
            expect(result.status).toBeUndefined();
            expect(result.detail).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('returns fallback message for unknown error types', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(null),
            fc.constant(undefined),
            fc.integer(),
            fc.boolean(),
            fc.constant({}),
            fc.array(fc.anything())
          ),
          (unknownError) => {
            // Skip Error instances and objects with response property
            if (unknownError instanceof Error) return;
            if (unknownError && typeof unknownError === 'object' && 'response' in unknownError) return;

            const result = extractApiError(unknownError);

            expect(result.message).toBe('An unknown error occurred');
            expect(result.status).toBeUndefined();
            expect(result.detail).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
