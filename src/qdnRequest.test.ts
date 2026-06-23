import { describe, expect, it } from 'vitest';
import { sanitizeNodePath, sanitizeReadMethod } from './qdnRequest';

describe('sanitizeNodePath', () => {
  it('requires paths to be absolute and rejects protocol-relative inputs', () => {
    expect(() => sanitizeNodePath('')).toThrowError('Node API paths must start with /.');
    expect(() => sanitizeNodePath('status')).toThrowError('Node API paths must start with /.');
    expect(() => sanitizeNodePath('//admin/status')).toThrowError('Node API paths must start with /.');
  });

  it('keeps leading and trailing slashes plus query strings', () => {
    expect(sanitizeNodePath('/')).toBe('/');
    expect(sanitizeNodePath('/api/status')).toBe('/api/status');
    expect(sanitizeNodePath('/api/status/')).toBe('/api/status/');
    expect(sanitizeNodePath('/api/status?limit=10&query=test')).toBe('/api/status?limit=10&query=test');
  });

  it('normalizes traversal-like segments in the URL path', () => {
    expect(sanitizeNodePath('/a/../admin')).toBe('/admin');
    expect(sanitizeNodePath('/a/b/../../admin')).toBe('/admin');
    expect(sanitizeNodePath('/../admin')).toBe('/admin');
    expect(sanitizeNodePath('/.../status')).toBe('/.../status');
  });
});

describe('sanitizeReadMethod', () => {
  it('returns GET for missing or blank method values', () => {
    expect(sanitizeReadMethod(undefined)).toBe('GET');
    expect(sanitizeReadMethod('')).toBe('GET');
    expect(sanitizeReadMethod('  ')).toBe('GET');
    expect(sanitizeReadMethod(null)).toBe('GET');
    expect(sanitizeReadMethod(123)).toBe('GET');
  });

  it('normalizes GET and HEAD case and whitespace', () => {
    expect(sanitizeReadMethod('get')).toBe('GET');
    expect(sanitizeReadMethod('head')).toBe('HEAD');
    expect(sanitizeReadMethod('  GeT  ')).toBe('GET');
  });

  it('rejects unsupported methods', () => {
    expect(() => sanitizeReadMethod('POST')).toThrowError(
      'Only GET and HEAD node API requests are supported.',
    );
    expect(() => sanitizeReadMethod('delete')).toThrowError(
      'Only GET and HEAD node API requests are supported.',
    );
  });
});
