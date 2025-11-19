import { describe, it, expect, vi } from 'vitest';
import { Readable } from 'stream';
import { parseBulkUsers } from '../services/bulkUserParser';

// Mock dependencies if any, e.g., a logger
vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('bulkUserParser', () => {
  it('should correctly parse a valid CSV file with standard headers', async () => {
    const csvData = `first_name,last_name,email,role\nJohn,Doe,john.doe@example.com,docente\nJane,Smith,jane.smith@example.com,consultor`;
    const stream = Readable.from(csvData);

    const result = await parseBulkUsers(stream);

    expect(result.users).toHaveLength(2);
    expect(result.users[0]).toEqual({
      first_name: 'John',
      last_name: 'Doe',
      email: 'john.doe@example.com',
      role: 'docente',
    });
    expect(result.errors).toHaveLength(0);
  });

  it('should throw an error for a CSV with missing required columns', async () => {
    const csvData = `first_name,email\nJohn,john.doe@example.com`;
    const stream = Readable.from(csvData);

    await expect(parseBulkUsers(stream)).rejects.toThrow(
      'El archivo CSV debe contener las siguientes columnas: first_name, last_name, email, role.'
    );
  });

  it('should handle rows with missing data and report them as errors', async () => {
    const csvData = `first_name,last_name,email,role\nJohn,Doe,,docente\nJane,,jane.smith@example.com,consultor`;
    const stream = Readable.from(csvData);

    const result = await parseBulkUsers(stream);

    expect(result.users).toHaveLength(0);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].message).toContain('Falta el email en la fila 2');
    expect(result.errors[1].message).toContain('Falta el apellido en la fila 3');
  });

  it('should handle an empty CSV file', async () => {
    const csvData = `first_name,last_name,email,role\n`;
    const stream = Readable.from(csvData);

    const result = await parseBulkUsers(stream);

    expect(result.users).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});