import { formatJid, removeSuffixFromJid } from '../helpers/utils';

describe('formatJid', () => {
  it('returns the value unchanged when jid is undefined', () => {
    // @ts-ignore - intentionally passing undefined to guard against runtime crashes
    expect(formatJid(undefined)).toBeUndefined();
  });

  it('returns the value unchanged when jid is null', () => {
    // @ts-ignore - intentionally passing null to guard against runtime crashes
    expect(formatJid(null)).toBeNull();
  });

  it('returns the value unchanged when jid is empty string', () => {
    expect(formatJid('')).toBe('');
  });

  it('returns jid as-is when it already carries a valid suffix', () => {
    expect(formatJid('51983724476@s.whatsapp.net')).toBe(
      '51983724476@s.whatsapp.net',
    );
    expect(formatJid('123@lid')).toBe('123@lid');
    expect(formatJid('1-1@g.us')).toBe('1-1@g.us');
  });

  it('appends @s.whatsapp.net when no suffix is present', () => {
    expect(formatJid('51983724476')).toBe('51983724476@s.whatsapp.net');
  });
});

describe('removeSuffixFromJid', () => {
  it('returns empty string when jid is undefined (no throw)', () => {
    expect(() => {
      // @ts-ignore - intentionally passing undefined
      removeSuffixFromJid(undefined);
    }).not.toThrow();
    // @ts-ignore - intentionally passing undefined
    expect(removeSuffixFromJid(undefined)).toBe('');
  });

  it('returns empty string when jid is null (no throw)', () => {
    expect(() => {
      // @ts-ignore - intentionally passing null
      removeSuffixFromJid(null);
    }).not.toThrow();
    // @ts-ignore - intentionally passing null
    expect(removeSuffixFromJid(null)).toBe('');
  });

  it('returns empty string when jid is empty string', () => {
    expect(removeSuffixFromJid('')).toBe('');
  });

  it('strips known suffixes', () => {
    expect(removeSuffixFromJid('51983724476@s.whatsapp.net')).toBe(
      '51983724476',
    );
    expect(removeSuffixFromJid('123@lid')).toBe('123');
    expect(removeSuffixFromJid('1-1@g.us')).toBe('1-1');
    expect(removeSuffixFromJid('abc@broadcast')).toBe('abc');
    expect(removeSuffixFromJid('news@newsletter')).toBe('news');
  });

  it('returns jid unchanged when no known suffix is present', () => {
    expect(removeSuffixFromJid('51983724476')).toBe('51983724476');
  });
});
