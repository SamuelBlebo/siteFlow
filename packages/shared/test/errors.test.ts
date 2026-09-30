import { describe, expect, it } from 'vitest';
import { GENERIC_ERROR, errorCode, friendlyError, isRetryable } from '../src';

describe('friendlyError', () => {
  it('normalises SDK codes', () => {
    expect(errorCode({ code: 'firestore/permission-denied' })).toBe('permission-denied');
    expect(errorCode({ code: 'permission-denied' })).toBe('permission-denied');
    expect(errorCode({ code: 'auth/wrong-password' })).toBe('auth/wrong-password');
  });

  it('never returns the raw error', () => {
    const e = { code: 'permission-denied', message: 'FirebaseError: PERMISSION_DENIED: Missing or insufficient permissions.' };
    expect(friendlyError(e)).toBe("You don't have permission to do this. Ask your manager if you need access.");
    expect(friendlyError(new Error('boom'))).toBe(GENERIC_ERROR);
    expect(friendlyError(null)).toBe(GENERIC_ERROR);
    expect(friendlyError({ code: 'storage/unauthorized' })).toMatch(/permission/);
  });

  it('keeps messages from our own functions, except internal errors', () => {
    expect(friendlyError({ code: 'functions/already-exists', message: 'That email already has a SiteFlow account.' }))
      .toBe('That email already has a SiteFlow account.');
    expect(friendlyError({ code: 'functions/internal', message: 'INTERNAL' })).toBe(GENERIC_ERROR);
  });

  it('knows which errors are worth retrying', () => {
    expect(isRetryable({ code: 'firestore/unavailable' })).toBe(true);
    expect(isRetryable({ code: 'permission-denied' })).toBe(false);
  });
});
