import { PostgreSQLClient } from '../PostgreSQLClient';
import { getTypeName } from '../queries';
import { ConnectionConfig, ConnectionStatus, DatabaseType } from '../../../types';

// Mock pg module
const mockQuery = jest.fn();
const mockConnect = jest.fn();
const mockRelease = jest.fn();
const mockEnd = jest.fn();

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: mockQuery,
    connect: mockConnect.mockResolvedValue({
      release: mockRelease,
      query: mockQuery,
    }),
    end: mockEnd.mockResolvedValue(undefined),
  })),
}));

describe('PostgreSQLClient', () => {
  let client: PostgreSQLClient;
  let config: ConnectionConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    config = {
      id: 'test-connection',
      name: 'Test Connection',
      type: DatabaseType.PostgreSQL,
      host: 'localhost',
      port: 5432,
      database: 'testdb',
      username: 'testuser',
      password: 'testpass',
    };

    client = new PostgreSQLClient(config);
  });

  describe('constructor', () => {
    it('should initialize with disconnected status', () => {
      expect(client.status).toBe(ConnectionStatus.Disconnected);
    });

    it('should store config', () => {
      expect(client.config).toEqual(config);
    });
  });

  describe('connect', () => {
    it('should connect successfully', async () => {
      await client.connect();

      expect(client.status).toBe(ConnectionStatus.Connected);
      expect(mockConnect).toHaveBeenCalled();
      expect(mockRelease).toHaveBeenCalled();
    });

    it('should not reconnect if already connected', async () => {
      await client.connect();
      await client.connect();

      expect(mockConnect).toHaveBeenCalledTimes(1);
    });

    it('should set error status on connection failure', async () => {
      const error = new Error('Connection failed');
      mockConnect.mockRejectedValueOnce(error);

      await expect(client.connect()).rejects.toThrow('Connection failed');
      expect(client.status).toBe(ConnectionStatus.Error);
    });
  });

  describe('disconnect', () => {
    it('should disconnect and clear pools', async () => {
      await client.connect();
      await client.disconnect();

      expect(client.status).toBe(ConnectionStatus.Disconnected);
      expect(mockEnd).toHaveBeenCalled();
    });
  });

  describe('testConnection', () => {
    it('should return true on successful connection', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });

      const result = await client.testConnection();

      expect(result).toBe(true);
    });

    it('should return false on failed connection', async () => {
      mockConnect.mockRejectedValueOnce(new Error('Connection failed'));

      const result = await client.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('executeQuery', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('should execute query and return results', async () => {
      const mockResult = {
        fields: [{ name: 'id', dataTypeID: 23 }],
        rows: [{ id: 1 }, { id: 2 }],
        rowCount: 2,
      };
      mockQuery.mockResolvedValueOnce(mockResult);

      const result = await client.executeQuery('SELECT * FROM test');

      expect(result.columns).toHaveLength(1);
      expect(result.columns[0].name).toBe('id');
      expect(result.rows).toHaveLength(2);
      expect(result.rowCount).toBe(2);
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should add LIMIT clause when specified', async () => {
      const mockResult = {
        fields: [],
        rows: [],
        rowCount: 0,
      };
      mockQuery.mockResolvedValueOnce(mockResult);

      await client.executeQuery('SELECT * FROM test', { limit: 10 });

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('LIMIT 10'));
    });

    it('should add OFFSET clause when specified', async () => {
      const mockResult = {
        fields: [],
        rows: [],
        rowCount: 0,
      };
      mockQuery.mockResolvedValueOnce(mockResult);

      await client.executeQuery('SELECT * FROM test', { limit: 10, offset: 5 });

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('OFFSET 5'));
    });

    it('should return error on query failure', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Query failed'));

      const result = await client.executeQuery('SELECT * FROM invalid');

      expect(result.error).toBe('Query failed');
      expect(result.rows).toHaveLength(0);
    });

    it('should throw error when not connected', async () => {
      await client.disconnect();

      await expect(client.executeQuery('SELECT 1')).rejects.toThrow('Not connected');
    });
  });

  describe('getDatabases', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('should return list of databases', async () => {
      const mockResult = {
        rows: [
          { name: 'db1', owner: 'postgres', encoding: 'UTF8', size: '8 MB', is_current: true },
          { name: 'db2', owner: 'postgres', encoding: 'UTF8', size: '16 MB', is_current: false },
        ],
      };
      mockQuery.mockResolvedValueOnce(mockResult);

      const databases = await client.getDatabases();

      expect(databases).toHaveLength(2);
      expect(databases[0].name).toBe('db1');
      expect(databases[0].isCurrent).toBe(true);
    });
  });

  describe('getRoles', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('should return list of roles', async () => {
      const mockResult = {
        rows: [
          {
            name: 'admin',
            is_super: true,
            can_login: true,
            can_create_db: true,
            can_create_role: true,
          },
          {
            name: 'readonly',
            is_super: false,
            can_login: true,
            can_create_db: false,
            can_create_role: false,
          },
        ],
      };
      mockQuery.mockResolvedValueOnce(mockResult);

      const roles = await client.getRoles();

      expect(roles).toHaveLength(2);
      expect(roles[0].isSuper).toBe(true);
      expect(roles[1].canLogin).toBe(true);
    });
  });

  describe('getSchemas', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('should return list of schemas', async () => {
      const mockResult = {
        rows: [{ schema_name: 'public' }, { schema_name: 'custom' }],
      };
      mockQuery.mockResolvedValueOnce(mockResult);

      const schemas = await client.getSchemas();

      expect(schemas).toEqual(['public', 'custom']);
    });
  });

  describe('getVersion', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('should return version string', async () => {
      const mockResult = {
        rows: [{ version: 'PostgreSQL 15.1' }],
      };
      mockQuery.mockResolvedValueOnce(mockResult);

      const version = await client.getVersion();

      expect(version).toBe('PostgreSQL 15.1');
    });
  });

  describe('getTypeName', () => {
    it('should map known type IDs correctly', () => {
      expect(getTypeName(23)).toBe('integer');
      expect(getTypeName(25)).toBe('text');
      expect(getTypeName(16)).toBe('boolean');
      expect(getTypeName(1114)).toBe('timestamp');
      expect(getTypeName(3802)).toBe('jsonb');
      expect(getTypeName(99999)).toBe('unknown');
    });
  });

  describe('parseParameters', () => {
    it('should parse function parameters correctly', () => {
      const clientAny = client as any;

      const result = clientAny.parseParameters('id integer, name text');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ name: 'id', type: 'integer', mode: 'IN' });
      expect(result[1]).toEqual({ name: 'name', type: 'text', mode: 'IN' });
    });

    it('should handle OUT parameters', () => {
      const clientAny = client as any;

      const result = clientAny.parseParameters('OUT result integer');

      expect(result[0]).toEqual({ name: 'result', type: 'integer', mode: 'OUT' });
    });

    it('should handle empty parameters', () => {
      const clientAny = client as any;

      const result = clientAny.parseParameters('');

      expect(result).toEqual([]);
    });
  });
});
