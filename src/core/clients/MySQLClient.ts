import * as mysql from 'mysql2/promise';
import { IDatabaseClient } from '../interfaces';
import {
  ConnectionConfig,
  ConnectionStatus,
  DatabaseSchema,
  TableInfo,
  ColumnInfo,
  IndexInfo,
  ViewInfo,
  FunctionInfo,
  QueryResult,
  QueryOptions,
} from '../../types';
import {
  TriggerInfo,
  ProcedureInfo,
  ParameterInfo,
  DatabaseInfo,
  RoleInfo,
  SchemaObjects,
  UserInfo,
} from '../types';
import { MySQLQueries, getMySQLTypeName } from './queries/mysql-queries';

/**
 * MySQL database client implementation
 * Supports connecting to multiple databases on the same server
 */
export class MySQLClient implements IDatabaseClient {
  private mainConnection: mysql.Connection | null = null;
  private databaseConnections: Map<string, mysql.Connection> = new Map();
  private _status: ConnectionStatus = ConnectionStatus.Disconnected;
  private readonly _config: ConnectionConfig;
  private readonly defaultDatabase: string;

  constructor(config: ConnectionConfig) {
    this._config = config;
    this.defaultDatabase = config.database || 'mysql';
  }

  get status(): ConnectionStatus {
    return this._status;
  }

  get config(): ConnectionConfig {
    return this._config;
  }

  // ============================================
  // Connection Management
  // ============================================

  async connect(): Promise<void> {
    if (this.isConnected()) {
      return;
    }

    this._status = ConnectionStatus.Connecting;

    try {
      this.mainConnection = await this.createConnection(this.defaultDatabase);
      await this.validateConnection(this.mainConnection);
      this._status = ConnectionStatus.Connected;
    } catch (error) {
      this._status = ConnectionStatus.Error;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.closeAllConnections();
    this._status = ConnectionStatus.Disconnected;
  }

  async testConnection(): Promise<boolean> {
    let testConnection: mysql.Connection | null = null;

    try {
      testConnection = await this.createConnection(this.defaultDatabase);
      await this.validateConnection(testConnection);
      await testConnection.end();
      return true;
    } catch {
      if (testConnection) {
        await testConnection.end();
      }
      return false;
    }
  }

  private isConnected(): boolean {
    return this._status === ConnectionStatus.Connected;
  }

  private async validateConnection(connection: mysql.Connection): Promise<void> {
    await connection.query('SELECT 1');
  }

  private async closeAllConnections(): Promise<void> {
    const closePromises = Array.from(this.databaseConnections.values()).map(conn => conn.end());
    await Promise.all(closePromises);
    this.databaseConnections.clear();

    if (this.mainConnection) {
      await this.mainConnection.end();
      this.mainConnection = null;
    }
  }

  // ============================================
  // Connection Management
  // ============================================

  async getConnectionForDatabase(databaseName: string): Promise<mysql.Connection> {
    this.ensureConnected();

    if (databaseName === this.defaultDatabase) {
      return this.mainConnection!;
    }

    const existingConnection = this.databaseConnections.get(databaseName);
    if (existingConnection) {
      return existingConnection;
    }

    return this.createAndCacheConnection(databaseName);
  }

  private async createAndCacheConnection(databaseName: string): Promise<mysql.Connection> {
    const connection = await this.createConnection(databaseName);

    try {
      await this.validateConnection(connection);
      this.databaseConnections.set(databaseName, connection);
      return connection;
    } catch (error) {
      await connection.end();
      throw error;
    }
  }

  private async createConnection(database: string): Promise<mysql.Connection> {
    if (this._config.connectionString) {
      return this.createConnectionFromConnectionString(database);
    }

    return this.createConnectionFromConfig(database);
  }

  private async createConnectionFromConnectionString(database: string): Promise<mysql.Connection> {
    const url = new URL(this._config.connectionString!);
    url.pathname = '/' + database;

    return mysql.createConnection({
      uri: url.toString(),
    });
  }

  private async createConnectionFromConfig(database: string): Promise<mysql.Connection> {
    return mysql.createConnection({
      host: this._config.host,
      port: this._config.port,
      database: database,
      user: this._config.username,
      password: this._config.password,
      ssl: this._config.ssl ? { rejectUnauthorized: false } : undefined,
      connectTimeout: 10000,
    });
  }

  private ensureConnected(): void {
    if (!this.isConnected() || !this.mainConnection) {
      throw new Error('Not connected to database server');
    }
  }

  // ============================================
  // Query Execution
  // ============================================

  async executeQuery(query: string, options?: QueryOptions): Promise<QueryResult> {
    this.ensureConnected();
    return this.executeQueryWithConnection(this.mainConnection!, query, options);
  }

  async executeQueryOnDatabase(
    databaseName: string,
    query: string,
    options?: QueryOptions
  ): Promise<QueryResult> {
    const connection = await this.getConnectionForDatabase(databaseName);
    return this.executeQueryWithConnection(connection, query, options);
  }

  private async executeQueryWithConnection(
    connection: mysql.Connection,
    query: string,
    options?: QueryOptions
  ): Promise<QueryResult> {
    const startTime = Date.now();

    try {
      const finalQuery = this.buildQueryWithPagination(query, options);
      const [rows, fields] = await connection.query(finalQuery);
      return this.mapQueryResult(rows, fields, Date.now() - startTime);
    } catch (error) {
      return this.createErrorResult(error, Date.now() - startTime);
    }
  }

  private buildQueryWithPagination(query: string, options?: QueryOptions): string {
    let finalQuery = query;
    const lowerQuery = query.toLowerCase();

    if (options?.limit && !lowerQuery.includes('limit')) {
      finalQuery += ` LIMIT ${options.limit}`;
    }
    if (options?.offset) {
      finalQuery += ` OFFSET ${options.offset}`;
    }

    return finalQuery;
  }

  private mapQueryResult(
    rows: unknown,
    fields: mysql.FieldPacket[] | mysql.ResultSetHeader | undefined,
    executionTime: number
  ): QueryResult {
    // Handle INSERT/UPDATE/DELETE results
    if (!Array.isArray(rows)) {
      const result = rows as mysql.ResultSetHeader;
      return {
        columns: [],
        rows: [],
        rowCount: 0,
        affectedRows: result.affectedRows,
        executionTime,
      };
    }

    const fieldArray = fields as mysql.FieldPacket[];
    const columns = fieldArray
      ? fieldArray.map(field => ({
          name: field.name,
          type: getMySQLTypeName(this.getFieldTypeName(field.type)),
          tableId: field.table ? undefined : undefined,
        }))
      : [];

    const rowArray = rows as Record<string, unknown>[];

    return {
      columns,
      rows: rowArray,
      rowCount: rowArray.length,
      executionTime,
    };
  }

  private getFieldTypeName(typeId: number | undefined): string {
    // MySQL field type constants
    const typeMap: Record<number, string> = {
      0: 'decimal',
      1: 'tinyint',
      2: 'smallint',
      3: 'int',
      4: 'float',
      5: 'double',
      6: 'null',
      7: 'timestamp',
      8: 'bigint',
      9: 'mediumint',
      10: 'date',
      11: 'time',
      12: 'datetime',
      13: 'year',
      14: 'newdate',
      15: 'varchar',
      16: 'bit',
      245: 'json',
      246: 'newdecimal',
      247: 'enum',
      248: 'set',
      249: 'tinyblob',
      250: 'mediumblob',
      251: 'longblob',
      252: 'blob',
      253: 'varchar',
      254: 'char',
      255: 'geometry',
    };

    return typeMap[typeId ?? 253] || 'unknown';
  }

  private createErrorResult(error: unknown, executionTime: number): QueryResult {
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      executionTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  // ============================================
  // Schema and Database Information
  // ============================================

  async getSchema(): Promise<DatabaseSchema> {
    this.ensureConnected();

    const [tables, views, functions] = await Promise.all([
      this.getTables(this.defaultDatabase),
      this.getViews(this.defaultDatabase),
      this.getFunctions(this.defaultDatabase),
    ]);

    return { name: this.defaultDatabase, tables, views, functions };
  }

  async getSchemas(databaseName?: string): Promise<string[]> {
    // In MySQL, schemas are databases
    const databases = await this.getDatabases();
    if (databaseName) {
      return databases.filter(db => db.name === databaseName).map(db => db.name);
    }
    return databases.map(db => db.name);
  }

  async getDatabases(): Promise<DatabaseInfo[]> {
    this.ensureConnected();

    const [rows] = await this.mainConnection!.query(MySQLQueries.getDatabases);
    const rowArray = rows as Record<string, unknown>[];

    return rowArray.map(row => ({
      name: row.name as string,
      encoding: row.encoding as string,
      collation: row.collation as string,
      owner: undefined, // MySQL doesn't have database owners
      size: undefined, // Size not readily available without aggregating table sizes
      isCurrent: row.name === this.defaultDatabase,
    }));
  }

  async getUsers(): Promise<UserInfo[]> {
    this.ensureConnected();

    try {
      const [rows] = await this.mainConnection!.query(MySQLQueries.getUsers);
      const rowArray = rows as Record<string, unknown>[];

      return rowArray.map(row => ({
        name: row.name as string,
        host: row.host as string,
        isSuperUser: Boolean(row.is_super),
        hasCreatePrivilege: Boolean(row.can_create),
        hasPasswordExpired: false, // MySQL doesn't track this easily
      }));
    } catch {
      // User might not have privileges to query mysql.user
      return [];
    }
  }

  /**
   * Get roles (MySQL users) in a format compatible with PostgreSQL's RoleInfo
   * MySQL uses users instead of roles, but we map them for compatibility
   */
  async getRoles(): Promise<RoleInfo[]> {
    this.ensureConnected();

    try {
      const [rows] = await this.mainConnection!.query(MySQLQueries.getUsers);
      const rowArray = rows as Record<string, unknown>[];

      return rowArray.map(row => ({
        name: `${row.name}@${row.host}`,
        isSuper: Boolean(row.is_super),
        canLogin: true, // MySQL users can login by default
        canCreateDb: Boolean(row.can_create),
        canCreateRole: Boolean(row.can_create), // Approximate based on create privilege
      }));
    } catch {
      // User might not have privileges to query mysql.user
      return [];
    }
  }

  async getVersion(): Promise<string> {
    this.ensureConnected();

    const [rows] = await this.mainConnection!.query(MySQLQueries.getVersion);
    const rowArray = rows as Record<string, unknown>[];
    return (rowArray[0]?.version as string) || 'Unknown';
  }

  // ============================================
  // Schema Objects
  // ============================================

  async getSchemaObjects(databaseName: string, _schemaName?: string): Promise<SchemaObjects> {
    const [tables, views, functions, procedures] = await Promise.all([
      this.getTables(databaseName),
      this.getViews(databaseName),
      this.getFunctions(databaseName),
      this.getProcedures(databaseName),
    ]);

    return { tables, views, functions, procedures };
  }

  private async getTables(databaseName: string): Promise<TableInfo[]> {
    const connection = await this.getConnectionForDatabase(databaseName);

    const [rows] = await connection.query(MySQLQueries.getTables, [databaseName]);
    const rowArray = rows as Record<string, unknown>[];

    return rowArray.map(row => ({
      name: row.table_name as string,
      schema: databaseName,
      columns: [],
      primaryKey: [],
      indexes: [],
      rowCount: parseInt(String(row.row_estimate)) || 0,
    }));
  }

  private async getViews(databaseName: string): Promise<ViewInfo[]> {
    const connection = await this.getConnectionForDatabase(databaseName);

    const [rows] = await connection.query(MySQLQueries.getViews, [databaseName]);
    const rowArray = rows as Record<string, unknown>[];

    return rowArray.map(row => ({
      name: row.table_name as string,
      schema: databaseName,
      definition: row.view_definition as string,
    }));
  }

  private async getFunctions(databaseName: string): Promise<FunctionInfo[]> {
    const connection = await this.getConnectionForDatabase(databaseName);

    const [rows] = await connection.query(MySQLQueries.getFunctions, [databaseName]);
    const rowArray = rows as Record<string, unknown>[];

    const functions: FunctionInfo[] = [];

    for (const row of rowArray) {
      const name = row.function_name as string;
      const parameters = await this.getFunctionParameters(databaseName, name);

      functions.push({
        name,
        schema: databaseName,
        returnType: (row.return_type as string) || 'void',
        parameters,
        definition: row.definition as string,
      });
    }

    return functions;
  }

  private async getFunctionParameters(
    databaseName: string,
    functionName: string
  ): Promise<ParameterInfo[]> {
    const connection = await this.getConnectionForDatabase(databaseName);

    try {
      const [rows] = await connection.query(MySQLQueries.getFunctionParameters, [
        databaseName,
        functionName,
      ]);
      const rowArray = rows as Record<string, unknown>[];

      return rowArray
        .filter(row => row.param_name) // Filter out return value (has no name)
        .map(row => ({
          name: (row.param_name as string) || '',
          type: row.param_type as string,
          mode: (row.param_mode as 'IN' | 'OUT' | 'INOUT') || 'IN',
        }));
    } catch {
      return [];
    }
  }

  async getProcedures(databaseName: string): Promise<ProcedureInfo[]> {
    const connection = await this.getConnectionForDatabase(databaseName);

    const [rows] = await connection.query(MySQLQueries.getProcedures, [databaseName]);
    const rowArray = rows as Record<string, unknown>[];

    const procedures: ProcedureInfo[] = [];

    for (const row of rowArray) {
      const name = row.procedure_name as string;
      const parameters = await this.getProcedureParameters(databaseName, name);

      procedures.push({
        name,
        schema: databaseName,
        returnType: 'void',
        parameters,
        definition: row.definition as string,
      });
    }

    return procedures;
  }

  private async getProcedureParameters(
    databaseName: string,
    procedureName: string
  ): Promise<ParameterInfo[]> {
    const connection = await this.getConnectionForDatabase(databaseName);

    try {
      const [rows] = await connection.query(MySQLQueries.getProcedureParameters, [
        databaseName,
        procedureName,
      ]);
      const rowArray = rows as Record<string, unknown>[];

      return rowArray.map(row => ({
        name: (row.param_name as string) || '',
        type: row.param_type as string,
        mode: (row.param_mode as 'IN' | 'OUT' | 'INOUT') || 'IN',
      }));
    } catch {
      return [];
    }
  }

  async getTriggers(
    databaseName: string,
    tableName: string,
    _schema?: string
  ): Promise<TriggerInfo[]> {
    const connection = await this.getConnectionForDatabase(databaseName);

    const [rows] = await connection.query(MySQLQueries.getTriggers, [databaseName, tableName]);
    const rowArray = rows as Record<string, unknown>[];

    return rowArray.map(row => ({
      name: row.trigger_name as string,
      table: row.table_name as string,
      event: row.event as string,
      timing: row.timing as string,
      definition: row.definition as string,
    }));
  }

  // ============================================
  // Table Information
  // ============================================

  async getTableInfo(
    databaseName: string,
    tableName: string,
    _schema?: string
  ): Promise<TableInfo> {
    const connection = await this.getConnectionForDatabase(databaseName);

    const [columns, indexes, rowCount] = await Promise.all([
      this.getTableColumns(connection, databaseName, tableName),
      this.getTableIndexes(connection, databaseName, tableName),
      this.getTableRowCount(connection, databaseName, tableName),
    ]);

    const primaryKey = columns.filter(col => col.isPrimaryKey).map(col => col.name);

    return { name: tableName, schema: databaseName, columns, primaryKey, indexes, rowCount };
  }

  private async getTableColumns(
    connection: mysql.Connection,
    databaseName: string,
    tableName: string
  ): Promise<ColumnInfo[]> {
    const [rows] = await connection.query(MySQLQueries.getTableColumns, [databaseName, tableName]);
    const rowArray = rows as Record<string, unknown>[];

    return rowArray.map(row => this.mapColumnRow(row));
  }

  private mapColumnRow(row: Record<string, unknown>): ColumnInfo {
    const type = this.buildColumnType(row);
    const isForeignKey = Boolean(row.is_foreign_key);

    return {
      name: row.column_name as string,
      type,
      nullable: row.is_nullable === 'YES',
      defaultValue: row.column_default as string | undefined,
      isPrimaryKey: Boolean(row.is_primary_key),
      isForeignKey,
      foreignKeyReference: isForeignKey
        ? {
            table: row.foreign_table_name as string,
            column: row.foreign_column_name as string,
          }
        : undefined,
      comment: row.column_comment as string | undefined,
    };
  }

  private buildColumnType(row: Record<string, unknown>): string {
    // MySQL's COLUMN_TYPE includes the full type with length/precision
    const columnType = row.column_type as string;
    if (columnType) {
      return columnType;
    }

    const dataType = row.data_type as string;
    const maxLength = row.character_maximum_length as number | null;
    const precision = row.numeric_precision as number | null;
    const scale = row.numeric_scale as number | null;

    if (maxLength) {
      return `${dataType}(${maxLength})`;
    }
    if (precision && scale !== null && scale !== undefined) {
      return `${dataType}(${precision},${scale})`;
    }
    if (precision) {
      return `${dataType}(${precision})`;
    }
    return dataType;
  }

  private async getTableIndexes(
    connection: mysql.Connection,
    databaseName: string,
    tableName: string
  ): Promise<IndexInfo[]> {
    const [rows] = await connection.query(MySQLQueries.getTableIndexes, [databaseName, tableName]);
    const rowArray = rows as Record<string, unknown>[];

    return rowArray.map(row => ({
      name: row.index_name as string,
      columns: ((row.columns as string) || '').split(','),
      unique: Boolean(row.is_unique),
      type: row.index_type as string,
    }));
  }

  private async getTableRowCount(
    connection: mysql.Connection,
    databaseName: string,
    tableName: string
  ): Promise<number> {
    try {
      const [rows] = await connection.query(MySQLQueries.getTableRowCount, [
        databaseName,
        tableName,
      ]);
      const rowArray = rows as Record<string, unknown>[];
      return parseInt(String(rowArray[0]?.estimate)) || 0;
    } catch {
      return 0;
    }
  }

  async getTableData(
    databaseName: string,
    tableName: string,
    options?: QueryOptions & { schema?: string; filter?: string; orderBy?: string }
  ): Promise<QueryResult> {
    const query = this.buildTableDataQuery(tableName, options);
    return this.executeQueryOnDatabase(databaseName, query);
  }

  private buildTableDataQuery(
    tableName: string,
    options?: QueryOptions & { filter?: string; orderBy?: string }
  ): string {
    const limit = options?.limit || 100;
    const offset = options?.offset || 0;

    // MySQL uses backticks for identifier quoting
    let query = `SELECT * FROM \`${tableName}\``;

    if (options?.filter) {
      query += ` WHERE ${options.filter}`;
    }

    if (options?.orderBy) {
      query += ` ORDER BY ${options.orderBy}`;
    }

    query += ` LIMIT ${limit} OFFSET ${offset}`;

    return query;
  }
}
