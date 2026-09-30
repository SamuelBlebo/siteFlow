import { describe, expect, it } from 'vitest';
import {
  companySettingsInput, inviteInput, memberActiveInput, memberUpdateInput, passwordInput, profileInput, validate,
} from '../src';

describe('profile', () => {
  it('accepts Ghana numbers in common formats and tidies them', () => {
    for (const p of ['024 123 4567', '0241234567', '+233 24 123 4567', '233241234567', '024-123-4567']) {
      expect(validate(profileInput, { name: 'Ama Mensah', phone: p }).ok).toBe(true);
    }
    expect(validate(profileInput, { name: 'Ama Mensah', phone: '024 123 4567' })).toMatchObject({ ok: true, data: { phone: '0241234567' } });
  });
  it('rejects bad numbers and names', () => {
    expect(validate(profileInput, { name: 'Ama', phone: '12345' })).toEqual({ ok: false, error: 'Enter a Ghana number, e.g. 024 000 0000.' });
    expect(validate(profileInput, { name: 'A', phone: '' }).ok).toBe(false);
    expect(validate(profileInput, { name: 'x'.repeat(101) }).ok).toBe(false);
  });
  it('phone is optional', () => {
    expect(validate(profileInput, { name: 'Ama Mensah' })).toMatchObject({ ok: true, data: { phone: '' } });
  });
});

describe('password', () => {
  it('needs 8 characters and a matching confirmation', () => {
    expect(validate(passwordInput, { password: 'short', confirm: 'short' })).toEqual({ ok: false, error: 'Use at least 8 characters.' });
    expect(validate(passwordInput, { password: 'longenough', confirm: 'different' })).toEqual({ ok: false, error: "The two passwords don't match." });
    expect(validate(passwordInput, { password: 'longenough', confirm: 'longenough' }).ok).toBe(true);
  });
});

describe('company settings', () => {
  it('validates name, phone and location', () => {
    expect(validate(companySettingsInput, { name: 'Mensah Builders', phone: '0302123456', location: 'Accra' }).ok).toBe(true);
    expect(validate(companySettingsInput, { name: 'M' }).ok).toBe(false);
  });
});

describe('team inputs', () => {
  it('invite lower-cases the email and takes an optional phone', () => {
    expect(validate(inviteInput, { name: 'Kofi Asante', email: 'Kofi@Example.COM', role: 'viewer', phone: '0241234567' }))
      .toMatchObject({ ok: true, data: { email: 'kofi@example.com', phone: '0241234567' } });
  });
  it('member updates never make an owner', () => {
    expect(validate(memberUpdateInput, { uid: 'u1', role: 'owner' }).ok).toBe(false);
    expect(validate(memberUpdateInput, { uid: 'u1', role: 'supervisor', siteIds: ['s1'] }).ok).toBe(true);
    expect(validate(memberUpdateInput, { uid: '', role: 'viewer' }).ok).toBe(false);
    expect(validate(memberActiveInput, { uid: 'u1', active: 'no' }).ok).toBe(false);
  });
});
