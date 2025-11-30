import { MySQLClient } from '../MySQLClient';
import { getMySQLTypeName } from '../queries/mysql-queries';
import { ConnectionConfig, ConnectionStatus, DatabaseType } from '../../../types';

// Mock mysql2/promise module
const mockQuery = jest.fn();
const mockEnd = jest.fn();

jest.mock('mysql2/promise', () => ({
  createConnection: jest.fn().mockImplementation(() =>
    Promise.resolve({
      query: mockQuery,
      end: mockEnd.mockResolvedValue(undefined),
    })
  ),
}));

// Get the mocked module
import * as mysql from 'mysql2/promise';
const mockedMysql = mysql as jest.Mocked<typeof mysql>;

describe('MySQLClient', () => {
  let client: MySQLClient;
  let config: ConnectionConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    config = {
      id: 'test-connection',
      name: 'Test Connection',
      type: DatabaseType.MySQL,
      host: 'localhost',
      port: 3306,
      database: 'testdb',
      username: 'testuser',
      password: 'testpass',
    };

    client = new MySQLClient(config);
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
      mockQuery.mockResolvedValueOnce([[{ '1': 1 }], []]);

      await client.connect();

      expect(client.status).toBe(ConnectionStatus.Connected);
    });

    it('should not reconnect if already connected', async () => {
      mockQuery.mockResolvedValue([[{ '1': 1 }], []]);

      await client.connect();
      await client.connect();

      // createConnection should only be called once
      expect(mockedMysql.createConnection).toHaveBeenCalledTimes(1);
    });

    it('should set error status on connection failure', async () => {
      mockedMysql.createConnection.mockRejectedValueOnce(new Error('Connection failed'));

      await expect(client.connect()).rejects.toThrow('Connection failed');
      expect(client.status).toBe(ConnectionStatus.Error);
    });
  });

  describe('disconnect', () => {
    it('should disconnect and clear connections', async () => {
      mockQuery.mockResolvedValueOnce([[{ '1': 1 }], []]);

      await client.connect();
      await client.disconnect();

      expect(client.status).toBe(ConnectionStatus.Disconnected);
      expect(mockEnd).toHaveBeenCalled();
    });
  });

  describe('testConnection', () => {
    it('should return true on successful connection', async () => {
      mockQuery.mockResolvedValueOnce([[{ '1': 1 }], []]);

      const result = await client.testConnection();

      expect(result).toBe(true);
    });

    it('should return false on failed connection', async () => {
      mockedMysql.createConnection.mockRejectedValueOnce(new Error('Connection failed'));

      const result = await client.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('executeQuery', () => {
    beforeEach(async () => {
      mockQuery.mockResolvedValueOnce([[{ '1': 1 }], []]);
      await client.connect();
      mockQuery.mockClear();
    });

    it('should execute query and return results', async () => {
      const mockFields = [{ name: 'id', type: 3 }];
      const mockRows = [{ id: 1 }, { id: 2 }];
      mockQuery.mockResolvedValueOnce([mockRows, mockFields]);

      const result = await client.executeQuery('SELECT * FROM test');

      expect(result.columns).toHaveLength(1);
      expect(result.columns[0].name).toBe('id');
      expect(result.rows).toHaveLength(2);
      expect(result.rowCount).toBe(2);
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should add LIMIT clause when specified', async () => {
      mockQuery.mockResolvedValueOnce([[], []]);

      await client.executeQuery('SELECT * FROM test', { limit: 10 });

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('LIMIT 10'));
    });

    it('should add OFFSET clause when specified', async () => {
      mockQuery.mockResolvedValueOnce([[], []]);

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

    it('should handle INSERT/UPDATE/DELETE results', async () => {
      const mockResult = {
        affectedRows: 5,
        insertId: 10,
        warningCount: 0,
      };
      mockQuery.mockResolvedValueOnce([mockResult, undefined]);

      const result = await client.executeQuery('UPDATE test SET name = "test"');

      expect(result.affectedRows).toBe(5);
      expect(result.rows).toHaveLength(0);
    });
  });

  describe('getDatabases', () => {
    beforeEach(async () => {
      mockQuery.mockResolvedValueOnce([[{ '1': 1 }], []]);
      await client.connect();
      mockQuery.mockClear();
    });

    it('should return list of databases', async () => {
      const mockResult = [
        { name: 'db1', encoding: 'utf8mb4', collation: 'utf8mb4_general_ci' },
        { name: 'db2', encoding: 'utf8mb4', collation: 'utf8mb4_general_ci' },
      ];
      mockQuery.mockResolvedValueOnce([mockResult, []]);

      const databases = await client.getDatabases();

      expect(databases).toHaveLength(2);
      expect(databases[0].name).toBe('db1');
      expect(databases[0].encoding).toBe('utf8mb4');
    });
  });

  describe('getUsers', () => {
    beforeEach(async () => {
      mockQuery.mockResolvedValueOnce([[{ '1': 1 }], []]);
      await client.connect();
      mockQuery.mockClear();
    });

    it('should return list of users', async () => {
      const mockResult = [
        { name: 'root', host: 'localhost', is_super: 1, can_create: 1 },
        { name: 'app', host: '%', is_super: 0, can_create: 0 },
      ];
      mockQuery.mockResolvedValueOnce([mockResult, []]);

      const users = await client.getUsers();

      expect(users).toHaveLength(2);
      expect(users[0].name).toBe('root');
      expect(users[0].isSuperUser).toBe(true);
      expect(users[1].hasCreatePrivilege).toBe(false);
    });

    it('should return empty array on permission error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Access denied'));

      const users = await client.getUsers();

      expect(users).toEqual([]);
    });
  });

  describe('getSchemas', () => {
    beforeEach(async () => {
      mockQuery.mockResolvedValueOnce([[{ '1': 1 }], []]);
      await client.connect();
      mockQuery.mockClear();
    });

    it('should return list of databases as schemas', async () => {
      const mockResult = [
        { name: 'db1', encoding: 'utf8mb4', collation: 'utf8mb4_general_ci' },
        { name: 'db2', encoding: 'utf8mb4', collation: 'utf8mb4_general_ci' },
      ];
      mockQuery.mockResolvedValueOnce([mockResult, []]);

      const schemas = await client.getSchemas();

      expect(schemas).toEqual(['db1', 'db2']);
    });
  });

  describe('getVersion', () => {
    beforeEach(async () => {
      mockQuery.mockResolvedValueOnce([[{ '1': 1 }], []]);
      await client.connect();
      mockQuery.mockClear();
    });

    it('should return version string', async () => {
      const mockResult = [{ version: '8.0.32' }];
      mockQuery.mockResolvedValueOnce([mockResult, []]);

      const version = await client.getVersion();

      expect(version).toBe('8.0.32');
    });
  });

  describe('getTableInfo', () => {
    beforeEach(async () => {
      mockQuery.mockResolvedValueOnce([[{ '1': 1 }], []]);
      await client.connect();
      mockQuery.mockClear();
    });

    it('should return table information', async () => {
      // Mock columns query
      mockQuery.mockResolvedValueOnce([
        [
          {
            column_name: 'id',
            data_type: 'int',
            column_type: 'int(11)',
            is_nullable: 'NO',
            column_default: null,
            is_primary_key: 1,
            is_foreign_key: 0,
          },
          {
            column_name: 'name',
            data_type: 'varchar',
            column_type: 'varchar(255)',
            is_nullable: 'YES',
            column_default: null,
            is_primary_key: 0,
            is_foreign_key: 0,
          },
        ],
        [],
      ]);

      // Mock indexes query
      mockQuery.mockResolvedValueOnce([
        [{ index_name: 'PRIMARY', columns: 'id', is_unique: 1, index_type: 'BTREE' }],
        [],
      ]);

      // Mock row count query
      mockQuery.mockResolvedValueOnce([[{ estimate: 100 }], []]);

      const tableInfo = await client.getTableInfo('testdb', 'users');

      expect(tableInfo.name).toBe('users');
      expect(tableInfo.columns).toHaveLength(2);
      expect(tableInfo.columns[0].name).toBe('id');
      expect(tableInfo.columns[0].isPrimaryKey).toBe(true);
      expect(tableInfo.indexes).toHaveLength(1);
      expect(tableInfo.rowCount).toBe(100);
    });
  });

  describe('getTableData', () => {
    beforeEach(async () => {
      mockQuery.mockResolvedValueOnce([[{ '1': 1 }], []]);
      await client.connect();
      mockQuery.mockClear();
    });

    it('should return table data with pagination', async () => {
      const mockRows = [
        { id: 1, name: 'Test 1' },
        { id: 2, name: 'Test 2' },
      ];
      const mockFields = [
        { name: 'id', type: 3 },
        { name: 'name', type: 253 },
      ];
      mockQuery.mockResolvedValueOnce([mockRows, mockFields]);

      const result = await client.getTableData('testdb', 'users', { limit: 10, offset: 0 });

      expect(result.rows).toHaveLength(2);
      expect(result.columns).toHaveLength(2);
    });

    it('should apply filter when provided', async () => {
      mockQuery.mockResolvedValueOnce([[], []]);

      await client.getTableData('testdb', 'users', { filter: "name = 'test'" });

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("WHERE name = 'test'"));
    });

    it('should apply orderBy when provided', async () => {
      mockQuery.mockResolvedValueOnce([[], []]);

      await client.getTableData('testdb', 'users', { orderBy: 'id DESC' });

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('ORDER BY id DESC'));
    });
  });

  describe('getTriggers', () => {
    beforeEach(async () => {
      mockQuery.mockResolvedValueOnce([[{ '1': 1 }], []]);
      await client.connect();
      mockQuery.mockClear();
    });

    it('should return triggers for a table', async () => {
      const mockResult = [
        {
          trigger_name: 'before_insert',
          table_name: 'users',
          event: 'INSERT',
          timing: 'BEFORE',
          definition: 'SET NEW.created_at = NOW()',
        },
      ];
      mockQuery.mockResolvedValueOnce([mockResult, []]);

      const triggers = await client.getTriggers('testdb', 'users');

      expect(triggers).toHaveLength(1);
      expect(triggers[0].name).toBe('before_insert');
      expect(triggers[0].timing).toBe('BEFORE');
      expect(triggers[0].event).toBe('INSERT');
    });
  });

  describe('getProcedures', () => {
    beforeEach(async () => {
      mockQuery.mockResolvedValueOnce([[{ '1': 1 }], []]);
      await client.connect();
      mockQuery.mockClear();
    });

    it('should return procedures for a database', async () => {
      const mockProcedures = [{ procedure_name: 'update_stats', definition: 'BEGIN ... END' }];
      mockQuery.mockResolvedValueOnce([mockProcedures, []]);

      // Mock parameters query
      mockQuery.mockResolvedValueOnce([
        [{ param_name: 'user_id', param_type: 'int', param_mode: 'IN' }],
        [],
      ]);

      const procedures = await client.getProcedures('testdb');

      expect(procedures).toHaveLength(1);
      expect(procedures[0].name).toBe('update_stats');
      expect(procedures[0].parameters).toHaveLength(1);
    });
  });

  describe('getMySQLTypeName', () => {
    it('should map known types correctly', () => {
      expect(getMySQLTypeName('INT')).toBe('integer');
      expect(getMySQLTypeName('VARCHAR(255)')).toBe('varchar');
      expect(getMySQLTypeName('DECIMAL(10,2)')).toBe('decimal');
      expect(getMySQLTypeName('TEXT')).toBe('text');
      expect(getMySQLTypeName('JSON')).toBe('json');
      expect(getMySQLTypeName('TIMESTAMP')).toBe('timestamp');
    });

    it('should handle unknown types', () => {
      expect(getMySQLTypeName('CUSTOM_TYPE')).toBe('CUSTOM_TYPE');
    });
  });

  describe('buildColumnType', () => {
    it('should use column_type when available', () => {
      const clientAny = client as unknown as { buildColumnType: (row: unknown) => string };

      const result = clientAny.buildColumnType({
        column_type: 'int(11)',
        data_type: 'int',
      });

      expect(result).toBe('int(11)');
    });

    it('should build type from components when column_type is not available', () => {
      const clientAny = client as unknown as { buildColumnType: (row: unknown) => string };

      const result = clientAny.buildColumnType({
        data_type: 'varchar',
        character_maximum_length: 255,
      });

      expect(result).toBe('varchar(255)');
    });

    it('should handle numeric precision and scale', () => {
      const clientAny = client as unknown as { buildColumnType: (row: unknown) => string };

      const result = clientAny.buildColumnType({
        data_type: 'decimal',
        numeric_precision: 10,
        numeric_scale: 2,
      });

      expect(result).toBe('decimal(10,2)');
    });
  });
});
