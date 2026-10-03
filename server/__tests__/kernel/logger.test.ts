import { describe, expect, it } from 'vitest';
import logger, { formatLogLine, getChildLogger } from '../../kernel/logger';

describe('formatLogLine', () => {
  it('formats a basic message with timestamp and level', () => {
    const result = formatLogLine({
      timestamp: '2024-01-01 12:00:00',
      level: 'info',
      message: 'hello world',
    });
    expect(result).toBe('2024-01-01 12:00:00 info: hello world');
  });

  it('includes label tag when label is present', () => {
    const result = formatLogLine({
      timestamp: '2024-01-01 12:00:00',
      level: 'info',
      message: 'request',
      label: 'API',
    });
    expect(result).toBe('2024-01-01 12:00:00 info:[API] request');
  });

  it('includes requestId tag when present', () => {
    const result = formatLogLine({
      timestamp: '2024-01-01 12:00:00',
      level: 'warn',
      message: 'slow query',
      requestId: 'req-abc',
    });
    expect(result).toBe('2024-01-01 12:00:00 warn:[req-abc] slow query');
  });

  it('includes both label and requestId tags', () => {
    const result = formatLogLine({
      timestamp: '2024-01-01 12:00:00',
      level: 'error',
      message: 'boom',
      label: 'DB',
      requestId: 'req-123',
    });
    expect(result).toBe('2024-01-01 12:00:00 error:[DB][req-123] boom');
  });

  it('appends JSON-serialised meta for extra fields', () => {
    const result = formatLogLine({
      timestamp: '2024-01-01 12:00:00',
      level: 'info',
      message: 'started',
      port: 3000,
      env: 'production',
    });
    expect(result).toBe('2024-01-01 12:00:00 info: started {"port":3000,"env":"production"}');
  });

  it('omits meta section when no extra fields are present', () => {
    const result = formatLogLine({
      timestamp: '2024-01-01 12:00:00',
      level: 'debug',
      message: 'tick',
    });
    expect(result).not.toContain('{');
  });
});

describe('logger', () => {
  it('exports a default logger instance', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('logs without throwing', () => {
    expect(() => logger.info('test message')).not.toThrow();
    expect(() => logger.error('test error')).not.toThrow();
    expect(() => logger.warn('test warning')).not.toThrow();
  });
});

describe('getChildLogger', () => {
  it('returns a logger instance', () => {
    const child = getChildLogger('TestModule');
    expect(child).toBeDefined();
    expect(typeof child.info).toBe('function');
    expect(typeof child.error).toBe('function');
    expect(typeof child.warn).toBe('function');
    expect(typeof child.debug).toBe('function');
  });

  it('logs with label metadata without throwing', () => {
    const child = getChildLogger('TestModule');
    expect(() => child.info('child log message')).not.toThrow();
    expect(() => child.info('with context', { requestId: 'test-123' })).not.toThrow();
  });

  it('creates distinct child loggers for different labels', () => {
    const api = getChildLogger('API');
    const db = getChildLogger('Database');
    expect(api).not.toBe(db);
  });
});

describe('log files', () => {
  it('rotates human-readable and JSON logs under the warden- prefix', () => {
    const files = logger.transports
      .map((transport) => (transport as { filename?: string }).filename)
      .filter((filename): filename is string => Boolean(filename));

    expect(files.map((file) => file.split('/').pop())).toEqual([
      'warden-%DATE%.log',
      'warden-%DATE%.json.log',
    ]);
  });
});
