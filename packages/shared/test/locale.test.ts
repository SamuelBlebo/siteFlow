import { afterEach, describe, expect, it } from 'vitest';
import {
  COUNTRIES, big, companyLocale, companyLocaleInput, companySetupInput, countryOf, getLocale, guessCountry, localClock, money,
  setLocale, siteInput, todayKey, timeHM, validate, waPhone, weekStart,
} from '../src';

afterEach(() => setLocale(null)); // back to the default (Ghana, device clock)

describe('countries', () => {
  it('every country is complete and its time zone is real', () => {
    expect(new Set(COUNTRIES.map((c) => c.code)).size).toBe(COUNTRIES.length);
    for (const c of COUNTRIES) {
      expect(c.code).toMatch(/^[A-Z]{2}$/);
      expect(c.currency).toMatch(/^[A-Z]{3}$/);
      expect(c.dial).toMatch(/^\d{1,3}$/);
      expect(c.cities).toHaveLength(3);
      expect(() => new Intl.DateTimeFormat('en', { timeZone: c.timeZone })).not.toThrow();
    }
  });
  it('companies from before countries existed are treated as Ghana', () => {
    expect(companyLocale({})).toMatchObject({ country: 'GH', currency: 'GHS', symbol: 'GH₵', timeZone: 'Africa/Accra', dial: '233' });
    expect(companyLocale({ country: 'KE', currency: 'KES', timeZone: 'Africa/Nairobi' })).toMatchObject({ symbol: 'KSh', dial: '254' });
    expect(countryOf('nowhere').code).toBe('GH');
  });
  it('guesses the country from the device time zone', () => {
    expect(guessCountry('Africa/Lagos')).toBe('NG');
    expect(guessCountry('Europe/London')).toBe('GB');
    expect(guessCountry('Pacific/Fiji')).toBe('GH');
  });
});

describe('money in the company currency', () => {
  it('uses the signed-in company currency by default, or the one passed', () => {
    expect(money(1234567)).toBe('GH₵1,234,567');
    setLocale({ country: 'KE', currency: 'KES', timeZone: 'Africa/Nairobi' });
    expect(money(1234567)).toBe('KSh 1,234,567');
    expect(big(2_500_000)).toBe('KSh 2.50m');
    expect(money(-500, 'NGN')).toBe('-₦500');
    expect(big(12_400, 'GBP')).toBe('£12k');
    expect(big(3_200_000_000, 'NGN')).toBe('₦3.20bn');
  });
});

describe('phone numbers', () => {
  it('local numbers get the company dialling code; international ones keep theirs', () => {
    expect(waPhone('024 123 4567')).toBe('233241234567');
    expect(waPhone('0712 345 678', '254')).toBe('254712345678');
    expect(waPhone('0803 000 0000', '234')).toBe('2348030000000');
    expect(waPhone('+44 7700 900123', '233')).toBe('447700900123');
    expect(waPhone('00 27 82 000 0000', '233')).toBe('27820000000');
    expect(waPhone('(555) 010 9999', '1')).toBe('15550109999');
    expect(waPhone('')).toBe('');
  });
  it('forms accept numbers from any country', () => {
    const base = { name: 'Lekki duplex', location: 'Lekki, Lagos', stage: 'Foundation', budget: 1000 };
    for (const p of ['0803 000 0000', '+44 7700 900123', '(555) 010-9999', '024 000 0000']) expect(validate(siteInput, { ...base, foremanPhone: p }).ok, p).toBe(true);
    expect(validate(siteInput, { ...base, foremanPhone: 'call me' }).ok).toBe(false);
  });
});

describe('dates in the company time zone', () => {
  // 23:30 UTC on Sunday 11 Oct 2026: still Sunday in Accra, already Monday in Nairobi (UTC+3)
  const t = new Date(Date.UTC(2026, 9, 11, 23, 30));
  it('today, the time and the weekday follow the time zone', () => {
    expect(todayKey(t, 'Africa/Accra')).toBe('2026-10-11');
    expect(todayKey(t, 'Africa/Nairobi')).toBe('2026-10-12');
    expect(timeHM(t, 'Africa/Nairobi')).toBe('02:30');
    expect(localClock(t, 'Africa/Nairobi')).toEqual({ hour: 2, weekday: 1 });
    expect(localClock(t, 'America/New_York')).toEqual({ hour: 19, weekday: 0 });
  });
  it('the apps set the zone once', () => {
    setLocale({ country: 'KE', currency: 'KES', timeZone: 'Africa/Nairobi' });
    expect(todayKey(t)).toBe('2026-10-12');
    expect(getLocale().timeZone).toBe('Africa/Nairobi');
  });
  it('the week starts on the local Monday', () => {
    expect(weekStart(t, 'Africa/Nairobi')).toBe('2026-10-12');
    expect(weekStart(t, 'Africa/Accra')).toBe('2026-10-05');
  });
});

describe('company settings', () => {
  it('sign-up picks a country (Ghana when none is given); settings need a real country, currency and zone', () => {
    expect(validate(companySetupInput, { companyName: 'Okafor Build', name: 'Ada Okafor', country: 'NG' })).toMatchObject({ ok: true, data: { country: 'NG' } });
    expect(validate(companySetupInput, { companyName: 'Mensah Build', name: 'Kofi Mensah' })).toMatchObject({ ok: true, data: { country: 'GH' } });
    expect(validate(companySetupInput, { companyName: 'X Build', name: 'X Y', country: 'ZZ' }).ok).toBe(false);
    expect(validate(companyLocaleInput, { country: 'KE', currency: 'KES', timeZone: 'Africa/Nairobi' }).ok).toBe(true);
    expect(validate(companyLocaleInput, { country: 'KE', currency: 'KES', timeZone: 'Mars/Olympus' }).ok).toBe(false);
    expect(validate(companyLocaleInput, { country: 'KE', currency: 'XYZ', timeZone: 'Africa/Nairobi' }).ok).toBe(false);
  });
});
