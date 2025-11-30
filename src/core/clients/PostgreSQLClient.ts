import { Pool, QueryResult as PgQueryResult } from 'pg';
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
} from '../types';
import { PostgreSQLQueries, getTypeName } from './queries';

/**
 * Type info (PostgreSQL-specific)
 */
export interface TypeInfo {
  name: string;
  schema: string;
  type: string;
}

/**
 * Sequence info (PostgreSQL-specific)
 */
export interface SequenceInfo {
  name: string;
  dataType: string;
  lastValue: string | null;
}

/**
 * PostgreSQL database client implementation
 * Supports connecting to multiple databases on the same server
 */
export class PostgreSQLClient implements IDatabaseClient {
  private mainPool: Pool | null = null;
  private databasePools: Map<string, Pool> = new Map();
  private _status: ConnectionStatus = ConnectionStatus.Disconnected;
  private readonly _config: ConnectionConfig;
  private readonly defaultDatabase: string;

  constructor(config: ConnectionConfig) {
    this._config = config;
    this.defaultDatabase = config.database || 'postgres';
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
      this.mainPool = this.createPool(this.defaultDatabase);
      await this.validateConnection(this.mainPool);
      this._status = ConnectionStatus.Connected;
    } catch (error) {
      this._status = ConnectionStatus.Error;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.closeAllPools();
    this._status = ConnectionStatus.Disconnected;
  }

  async testConnection(): Promise<boolean> {
    const testPool = this.createPool(this.defaultDatabase);

    try {
      await this.validateConnection(testPool);
      await testPool.end();
      return true;
    } catch {
      await testPool.end();
      return false;
    }
  }

  private isConnected(): boolean {
    return this._status === ConnectionStatus.Connected;
  }

  private async validateConnection(pool: Pool): Promise<void> {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
  }

  private async closeAllPools(): Promise<void> {
    const closePromises = Array.from(this.databasePools.values()).map(pool => pool.end());
    await Promise.all(closePromises);
    this.databasePools.clear();

    if (this.mainPool) {
      await this.mainPool.end();
      this.mainPool = null;
    }
  }

  // ============================================
  // Pool Management
  // ============================================

  async getPoolForDatabase(databaseName: string): Promise<Pool> {
    this.ensureConnected();

    if (databaseName === this.defaultDatabase) {
      return this.mainPool!;
    }

    const existingPool = this.databasePools.get(databaseName);
    if (existingPool) {
      return existingPool;
    }

    return this.createAndCachePool(databaseName);
  }

  private async createAndCachePool(databaseName: string): Promise<Pool> {
    const pool = this.createPool(databaseName);

    try {
      await this.validateConnection(pool);
      this.databasePools.set(databaseName, pool);
      return pool;
    } catch (error) {
      await pool.end();
      throw error;
    }
  }

  private createPool(database: string): Pool {
    if (this._config.connectionString) {
      return this.createPoolFromConnectionString(database);
    }

    return this.createPoolFromConfig(database);
  }

  private createPoolFromConnectionString(database: string): Pool {
    const url = new URL(this._config.connectionString!);
    url.pathname = '/' + database;

    return new Pool({
      connectionString: url.toString(),
      ssl: this._config.ssl ? { rejectUnauthorized: false } : undefined,
    });
  }

  private createPoolFromConfig(database: string): Pool {
    return new Pool({
      host: this._config.host,
      port: this._config.port,
      database: database,
      user: this._config.username,
      password: this._config.password,
      ssl: this._config.ssl ? { rejectUnauthorized: false } : undefined,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }

  private ensureConnected(): void {
    if (!this.isConnected() || !this.mainPool) {
      throw new Error('Not connected to database server');
    }
  }

  // ============================================
  // Query Execution
  // ============================================

  async executeQuery(query: string, options?: QueryOptions): Promise<QueryResult> {
    this.ensureConnected();
    return this.executeQueryWithPool(this.mainPool!, query, options);
  }

  async executeQueryOnDatabase(
    databaseName: string,
    query: string,
    options?: QueryOptions
  ): Promise<QueryResult> {
    const pool = await this.getPoolForDatabase(databaseName);
    return this.executeQueryWithPool(pool, query, options);
  }

  private async executeQueryWithPool(
    pool: Pool,
    query: string,
    options?: QueryOptions
  ): Promise<QueryResult> {
    const startTime = Date.now();

    try {
      const finalQuery = this.buildQueryWithPagination(query, options);
      const result = await pool.query(finalQuery);
      return this.mapQueryResult(result, Date.now() - startTime);
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

  private mapQueryResult(result: PgQueryResult, executionTime: number): QueryResult {
    const columns = result.fields.map(field => ({
      name: field.name,
      type: getTypeName(field.dataTypeID),
      tableId: field.tableID,
    }));

    return {
      columns,
      rows: result.rows,
      rowCount: result.rows.length,
      affectedRows: result.rowCount ?? undefined,
      executionTime,
    };
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

    const schemas = await this.getSchemas();
    const defaultSchema = schemas.includes('public') ? 'public' : schemas[0];

    const [tables, views, functions] = await Promise.all([
      this.getTables(this.defaultDatabase, defaultSchema),
      this.getViews(this.defaultDatabase, defaultSchema),
      this.getFunctions(this.defaultDatabase, defaultSchema),
    ]);

    return { name: defaultSchema, tables, views, functions };
  }

  async getSchemas(databaseName?: string): Promise<string[]> {
    const pool = databaseName ? await this.getPoolForDatabase(databaseName) : this.mainPool!;

    this.ensureConnected();

    const result = await pool.query(PostgreSQLQueries.getSchemas);
    return result.rows.map(row => row.schema_name);
  }

  async getDatabases(): Promise<DatabaseInfo[]> {
    this.ensureConnected();

    const result = await this.mainPool!.query(PostgreSQLQueries.getDatabases);
    return result.rows.map(this.mapDatabaseRow);
  }

  private mapDatabaseRow(row: Record<string, unknown>): DatabaseInfo {
    return {
      name: row.name as string,
      owner: row.owner as string,
      encoding: row.encoding as string,
      size: row.size as string,
      isCurrent: row.is_current as boolean,
    };
  }

  async getRoles(): Promise<RoleInfo[]> {
    this.ensureConnected();

    const result = await this.mainPool!.query(PostgreSQLQueries.getRoles);
    return result.rows.map(this.mapRoleRow);
  }

  private mapRoleRow(row: Record<string, unknown>): RoleInfo {
    return {
      name: row.name as string,
      isSuper: row.is_super as boolean,
      canLogin: row.can_login as boolean,
      canCreateDb: row.can_create_db as boolean,
      canCreateRole: row.can_create_role as boolean,
    };
  }

  async getVersion(): Promise<string> {
    this.ensureConnected();

    const result = await this.mainPool!.query(PostgreSQLQueries.getVersion);
    return result.rows[0]?.version || 'Unknown';
  }

  // ============================================
  // Schema Objects
  // ============================================

  async getSchemaObjects(
    databaseName: string,
    schemaName: string = 'public'
  ): Promise<SchemaObjects> {
    const [tables, views, functions, procedures] = await Promise.all([
      this.getTables(databaseName, schemaName),
      this.getViews(databaseName, schemaName),
      this.getFunctions(databaseName, schemaName),
      this.getProcedures(databaseName, schemaName),
    ]);

    return { tables, views, functions, procedures };
  }

  private async getTables(databaseName: string, schema: string): Promise<TableInfo[]> {
    const pool = await this.getPoolForDatabase(databaseName);

    const result = await pool.query(PostgreSQLQueries.getTables(schema), [schema]);

    return result.rows.map(row => ({
      name: row.table_name,
      schema,
      columns: [],
      primaryKey: [],
      indexes: [],
      rowCount: parseInt(row.row_estimate) || 0,
    }));
  }

  private async getViews(databaseName: string, schema: string): Promise<ViewInfo[]> {
    const pool = await this.getPoolForDatabase(databaseName);

    const result = await pool.query(PostgreSQLQueries.getViews, [schema]);

    return result.rows.map(row => ({
      name: row.table_name,
      schema,
      definition: row.view_definition,
    }));
  }

  private async getFunctions(databaseName: string, schema: string): Promise<FunctionInfo[]> {
    const pool = await this.getPoolForDatabase(databaseName);

    const result = await pool.query(PostgreSQLQueries.getFunctions, [schema]);

    return result.rows.map(row => ({
      name: row.function_name,
      schema,
      returnType: row.return_type || 'void',
      parameters: this.parseParameters(row.arguments),
    }));
  }

  async getProcedures(databaseName: string, schema: string = 'public'): Promise<ProcedureInfo[]> {
    const pool = await this.getPoolForDatabase(databaseName);

    const result = await pool.query(PostgreSQLQueries.getProcedures, [schema]);

    return result.rows.map(row => ({
      name: row.procedure_name,
      schema,
      returnType: 'void',
      parameters: this.parseParameters(row.arguments),
      definition: row.definition,
    }));
  }

  async getTriggers(
    databaseName: string,
    tableName: string,
    schema: string = 'public'
  ): Promise<TriggerInfo[]> {
    const pool = await this.getPoolForDatabase(databaseName);

    const result = await pool.query(PostgreSQLQueries.getTriggers, [schema, tableName]);

    return result.rows.map(row => ({
      name: row.trigger_name,
      table: row.table_name,
      event: '',
      timing: row.timing,
      definition: row.definition,
    }));
  }

  // ============================================
  // Table Information
  // ============================================

  async getTableInfo(
    databaseName: string,
    tableName: string,
    schema: string = 'public'
  ): Promise<TableInfo> {
    const pool = await this.getPoolForDatabase(databaseName);

    const [columns, indexes, rowCount] = await Promise.all([
      this.getTableColumns(pool, tableName, schema),
      this.getTableIndexes(pool, tableName, schema),
      this.getTableRowCount(pool, tableName, schema),
    ]);

    const primaryKey = columns.filter(col => col.isPrimaryKey).map(col => col.name);

    return { name: tableName, schema, columns, primaryKey, indexes, rowCount };
  }

  private async getTableColumns(
    pool: Pool,
    tableName: string,
    schema: string
  ): Promise<ColumnInfo[]> {
    const result = await pool.query(PostgreSQLQueries.getTableColumns, [schema, tableName]);

    return result.rows.map(row => this.mapColumnRow(row));
  }

  private mapColumnRow(row: Record<string, unknown>): ColumnInfo {
    const type = this.buildColumnType(row);
    const isForeignKey = row.is_foreign_key as boolean;

    return {
      name: row.column_name as string,
      type,
      nullable: row.is_nullable === 'YES',
      defaultValue: row.column_default as string | undefined,
      isPrimaryKey: row.is_primary_key as boolean,
      isForeignKey,
      foreignKeyReference: isForeignKey
        ? {
            table: row.foreign_table_name as string,
            column: row.foreign_column_name as string,
          }
        : undefined,
    };
  }

  private buildColumnType(row: Record<string, unknown>): string {
    const dataType = row.data_type as string;
    const maxLength = row.character_maximum_length as number | null;
    const precision = row.numeric_precision as number | null;
    const scale = row.numeric_scale as number | null;

    if (maxLength) {
      return `${dataType}(${maxLength})`;
    }
    if (precision && scale) {
      return `${dataType}(${precision},${scale})`;
    }
    return dataType;
  }

  private async getTableIndexes(
    pool: Pool,
    tableName: string,
    schema: string
  ): Promise<IndexInfo[]> {
    const result = await pool.query(PostgreSQLQueries.getTableIndexes, [schema, tableName]);

    return result.rows.map(row => ({
      name: row.index_name,
      columns: row.columns,
      unique: row.is_unique,
      type: row.index_type,
    }));
  }

  private async getTableRowCount(pool: Pool, tableName: string, schema: string): Promise<number> {
    try {
      const result = await pool.query(PostgreSQLQueries.getTableRowCount, [
        `"${schema}"."${tableName}"`,
      ]);
      return result.rows[0]?.estimate || 0;
    } catch {
      return 0;
    }
  }

  async getTableData(
    databaseName: string,
    tableName: string,
    options?: QueryOptions & { schema?: string; filter?: string; orderBy?: string }
  ): Promise<QueryResult> {
    const schema = options?.schema || 'public';
    const query = this.buildTableDataQuery(tableName, schema, options);
    return this.executeQueryOnDatabase(databaseName, query);
  }

  private buildTableDataQuery(
    tableName: string,
    schema: string,
    options?: QueryOptions & { filter?: string; orderBy?: string }
  ): string {
    const limit = options?.limit || 100;
    const offset = options?.offset || 0;

    let query = `SELECT * FROM "${schema}"."${tableName}"`;

    if (options?.filter) {
      query += ` WHERE ${options.filter}`;
    }

    if (options?.orderBy) {
      query += ` ORDER BY ${options.orderBy}`;
    }

    query += ` LIMIT ${limit} OFFSET ${offset}`;

    return query;
  }

  // ============================================
  // Utilities
  // ============================================

  private parseParameters(args: string): ParameterInfo[] {
    if (!args) {
      return [];
    }

    return args.split(',').map(arg => this.parseParameter(arg.trim()));
  }

  private parseParameter(arg: string): ParameterInfo {
    const parts = arg.split(' ');
    const modeKeywords = ['IN', 'OUT', 'INOUT'];

    if (modeKeywords.includes(parts[0])) {
      return {
        mode: parts[0] as 'IN' | 'OUT' | 'INOUT',
        name: parts[1] || '',
        type: parts.slice(2).join(' '),
      };
    }

    return {
      mode: 'IN',
      name: parts[0] || '',
      type: parts.slice(1).join(' '),
    };
  }
}
