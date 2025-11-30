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

/**
 * Trigger information
 */
export interface TriggerInfo {
  name: string;
  table: string;
  event: string;
  timing: string;
  definition?: string;
}

/**
 * Procedure information
 */
export interface ProcedureInfo {
  name: string;
  schema: string;
  returnType: string;
  parameters: { name: string; type: string; mode: 'IN' | 'OUT' | 'INOUT' }[];
  definition?: string;
}

/**
 * Database info
 */
export interface DatabaseInfo {
  name: string;
  owner: string;
  encoding: string;
  size: string;
  isCurrent: boolean;
}

/**
 * Role/User info
 */
export interface RoleInfo {
  name: string;
  isSuper: boolean;
  canLogin: boolean;
  canCreateDb: boolean;
  canCreateRole: boolean;
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
  private defaultDatabase: string;

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

  async connect(): Promise<void> {
    if (this._status === ConnectionStatus.Connected) {
      return;
    }

    this._status = ConnectionStatus.Connecting;

    try {
      // Connect to the default database (usually 'postgres' or specified in config)
      this.mainPool = this.createPool(this.defaultDatabase);

      // Test the connection
      const client = await this.mainPool.connect();
      client.release();

      this._status = ConnectionStatus.Connected;
    } catch (error) {
      this._status = ConnectionStatus.Error;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    // Close all database pools
    for (const pool of this.databasePools.values()) {
      await pool.end();
    }
    this.databasePools.clear();

    if (this.mainPool) {
      await this.mainPool.end();
      this.mainPool = null;
    }
    this._status = ConnectionStatus.Disconnected;
  }

  async testConnection(): Promise<boolean> {
    const testPool = this.createPool(this.defaultDatabase);

    try {
      const client = await testPool.connect();
      await client.query('SELECT 1');
      client.release();
      await testPool.end();
      return true;
    } catch {
      await testPool.end();
      return false;
    }
  }

  /**
   * Get or create a pool for a specific database
   */
  async getPoolForDatabase(databaseName: string): Promise<Pool> {
    this.ensureConnected();

    // If it's the main database, use main pool
    if (databaseName === this.defaultDatabase) {
      return this.mainPool!;
    }

    // Check if we already have a pool for this database
    let pool = this.databasePools.get(databaseName);
    if (pool) {
      return pool;
    }

    // Create a new pool for this database
    pool = this.createPool(databaseName);

    // Test the connection
    try {
      const client = await pool.connect();
      client.release();
      this.databasePools.set(databaseName, pool);
      return pool;
    } catch (error) {
      await pool.end();
      throw error;
    }
  }

  async executeQuery(query: string, options?: QueryOptions): Promise<QueryResult> {
    this.ensureConnected();

    const startTime = Date.now();

    try {
      let finalQuery = query;

      if (options?.limit && !query.toLowerCase().includes('limit')) {
        finalQuery += ` LIMIT ${options.limit}`;
      }
      if (options?.offset) {
        finalQuery += ` OFFSET ${options.offset}`;
      }

      const result = await this.mainPool!.query(finalQuery);
      const executionTime = Date.now() - startTime;

      return this.mapQueryResult(result, executionTime);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      return {
        columns: [],
        rows: [],
        rowCount: 0,
        executionTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute query on a specific database
   */
  async executeQueryOnDatabase(
    databaseName: string,
    query: string,
    options?: QueryOptions
  ): Promise<QueryResult> {
    const pool = await this.getPoolForDatabase(databaseName);
    const startTime = Date.now();

    try {
      let finalQuery = query;

      if (options?.limit && !query.toLowerCase().includes('limit')) {
        finalQuery += ` LIMIT ${options.limit}`;
      }
      if (options?.offset) {
        finalQuery += ` OFFSET ${options.offset}`;
      }

      const result = await pool.query(finalQuery);
      const executionTime = Date.now() - startTime;

      return this.mapQueryResult(result, executionTime);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      return {
        columns: [],
        rows: [],
        rowCount: 0,
        executionTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getSchema(): Promise<DatabaseSchema> {
    this.ensureConnected();

    const schemas = await this.getSchemas();
    const defaultSchema = schemas.includes('public') ? 'public' : schemas[0];

    const [tables, views, functions] = await Promise.all([
      this.getTables(this.defaultDatabase, defaultSchema),
      this.getViews(this.defaultDatabase, defaultSchema),
      this.getFunctions(this.defaultDatabase, defaultSchema),
    ]);

    return {
      name: defaultSchema,
      tables,
      views,
      functions,
    };
  }

  async getSchemas(databaseName?: string): Promise<string[]> {
    const pool = databaseName ? await this.getPoolForDatabase(databaseName) : this.mainPool!;

    this.ensureConnected();

    const result = await pool.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      ORDER BY schema_name
    `);

    return result.rows.map(row => row.schema_name);
  }

  /**
   * Get all databases on the server
   */
  async getDatabases(): Promise<DatabaseInfo[]> {
    this.ensureConnected();

    const result = await this.mainPool!.query(`
      SELECT 
        d.datname AS name,
        pg_catalog.pg_get_userbyid(d.datdba) AS owner,
        pg_catalog.pg_encoding_to_char(d.encoding) AS encoding,
        pg_catalog.pg_size_pretty(pg_catalog.pg_database_size(d.datname)) AS size,
        d.datname = current_database() AS is_current
      FROM pg_catalog.pg_database d
      WHERE d.datistemplate = false
      ORDER BY d.datname
    `);

    return result.rows.map(row => ({
      name: row.name,
      owner: row.owner,
      encoding: row.encoding,
      size: row.size,
      isCurrent: row.is_current,
    }));
  }

  /**
   * Get roles/users
   */
  async getRoles(): Promise<RoleInfo[]> {
    this.ensureConnected();

    const result = await this.mainPool!.query(`
      SELECT 
        rolname AS name,
        rolsuper AS is_super,
        rolcanlogin AS can_login,
        rolcreatedb AS can_create_db,
        rolcreaterole AS can_create_role
      FROM pg_catalog.pg_roles
      WHERE rolname NOT LIKE 'pg_%'
      ORDER BY rolname
    `);

    return result.rows.map(row => ({
      name: row.name,
      isSuper: row.is_super,
      canLogin: row.can_login,
      canCreateDb: row.can_create_db,
      canCreateRole: row.can_create_role,
    }));
  }

  /**
   * Get triggers for a table in a specific database
   */
  async getTriggers(
    databaseName: string,
    tableName: string,
    schema: string = 'public'
  ): Promise<TriggerInfo[]> {
    const pool = await this.getPoolForDatabase(databaseName);

    const result = await pool.query(
      `
      SELECT 
        t.tgname AS trigger_name,
        c.relname AS table_name,
        CASE 
          WHEN t.tgtype & 2 = 2 THEN 'BEFORE'
          WHEN t.tgtype & 64 = 64 THEN 'INSTEAD OF'
          ELSE 'AFTER'
        END AS timing,
        pg_get_triggerdef(t.oid) AS definition
      FROM pg_trigger t
      JOIN pg_class c ON t.tgrelid = c.oid
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = $1 
        AND c.relname = $2
        AND NOT t.tgisinternal
      ORDER BY t.tgname
    `,
      [schema, tableName]
    );

    return result.rows.map(row => ({
      name: row.trigger_name,
      table: row.table_name,
      event: '',
      timing: row.timing,
      definition: row.definition,
    }));
  }

  /**
   * Get procedures (PostgreSQL 11+)
   */
  async getProcedures(databaseName: string, schema: string = 'public'): Promise<ProcedureInfo[]> {
    const pool = await this.getPoolForDatabase(databaseName);

    const result = await pool.query(
      `
      SELECT 
        p.proname AS procedure_name,
        pg_get_function_arguments(p.oid) AS arguments,
        pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = $1 AND p.prokind = 'p'
      ORDER BY p.proname
    `,
      [schema]
    );

    return result.rows.map(row => ({
      name: row.procedure_name,
      schema,
      returnType: 'void',
      parameters: this.parseParameters(row.arguments),
      definition: row.definition,
    }));
  }

  /**
   * Get schema info including tables, views, functions, procedures for a specific database
   */
  async getSchemaObjects(
    databaseName: string,
    schemaName: string
  ): Promise<{
    tables: TableInfo[];
    views: ViewInfo[];
    functions: FunctionInfo[];
    procedures: ProcedureInfo[];
  }> {
    const [tables, views, functions, procedures] = await Promise.all([
      this.getTables(databaseName, schemaName),
      this.getViews(databaseName, schemaName),
      this.getFunctions(databaseName, schemaName),
      this.getProcedures(databaseName, schemaName),
    ]);

    return { tables, views, functions, procedures };
  }

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

    return {
      name: tableName,
      schema,
      columns,
      primaryKey,
      indexes,
      rowCount,
    };
  }

  async getTableData(
    databaseName: string,
    tableName: string,
    options?: QueryOptions & { schema?: string; filter?: string; orderBy?: string }
  ): Promise<QueryResult> {
    const schema = options?.schema || 'public';
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

    return this.executeQueryOnDatabase(databaseName, query);
  }

  async getVersion(): Promise<string> {
    this.ensureConnected();

    const result = await this.mainPool!.query('SELECT version()');
    return result.rows[0]?.version || 'Unknown';
  }

  // Private helper methods

  private createPool(database: string): Pool {
    if (this._config.connectionString) {
      // Parse connection string and replace database
      const url = new URL(this._config.connectionString);
      url.pathname = '/' + database;
      return new Pool({
        connectionString: url.toString(),
        ssl: this._config.ssl ? { rejectUnauthorized: false } : undefined,
      });
    }

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
    if (this._status !== ConnectionStatus.Connected || !this.mainPool) {
      throw new Error('Not connected to database server');
    }
  }

  private mapQueryResult(result: PgQueryResult, executionTime: number): QueryResult {
    const columns = result.fields.map(field => ({
      name: field.name,
      type: this.getTypeName(field.dataTypeID),
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

  private getTypeName(dataTypeId: number): string {
    const typeMap: Record<number, string> = {
      16: 'boolean',
      17: 'bytea',
      20: 'bigint',
      21: 'smallint',
      23: 'integer',
      25: 'text',
      700: 'real',
      701: 'double precision',
      1043: 'varchar',
      1082: 'date',
      1083: 'time',
      1114: 'timestamp',
      1184: 'timestamptz',
      1700: 'numeric',
      2950: 'uuid',
      3802: 'jsonb',
      114: 'json',
    };

    return typeMap[dataTypeId] || 'unknown';
  }

  private async getTables(databaseName: string, schema: string): Promise<TableInfo[]> {
    const pool = await this.getPoolForDatabase(databaseName);

    const result = await pool.query(
      `
      SELECT 
        t.table_name,
        (SELECT reltuples::bigint FROM pg_class WHERE oid = (quote_ident($1) || '.' || quote_ident(t.table_name))::regclass) as row_estimate
      FROM information_schema.tables t
      WHERE t.table_schema = $1 AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name
    `,
      [schema]
    );

    return result.rows.map(row => ({
      name: row.table_name,
      schema,
      columns: [],
      primaryKey: [],
      indexes: [],
      rowCount: parseInt(row.row_estimate) || 0,
    }));
  }

  private async getTableColumns(
    pool: Pool,
    tableName: string,
    schema: string
  ): Promise<ColumnInfo[]> {
    const result = await pool.query(
      `
      SELECT 
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        c.character_maximum_length,
        c.numeric_precision,
        c.numeric_scale,
        CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key,
        CASE WHEN fk.column_name IS NOT NULL THEN true ELSE false END as is_foreign_key,
        fk.foreign_table_name,
        fk.foreign_column_name
      FROM information_schema.columns c
      LEFT JOIN (
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = $1 AND tc.table_name = $2 AND tc.constraint_type = 'PRIMARY KEY'
      ) pk ON c.column_name = pk.column_name
      LEFT JOIN (
        SELECT 
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_schema = $1 AND tc.table_name = $2 AND tc.constraint_type = 'FOREIGN KEY'
      ) fk ON c.column_name = fk.column_name
      WHERE c.table_schema = $1 AND c.table_name = $2
      ORDER BY c.ordinal_position
    `,
      [schema, tableName]
    );

    return result.rows.map(row => {
      let type = row.data_type;
      if (row.character_maximum_length) {
        type = `${row.data_type}(${row.character_maximum_length})`;
      } else if (row.numeric_precision && row.numeric_scale) {
        type = `${row.data_type}(${row.numeric_precision},${row.numeric_scale})`;
      }

      return {
        name: row.column_name,
        type,
        nullable: row.is_nullable === 'YES',
        defaultValue: row.column_default,
        isPrimaryKey: row.is_primary_key,
        isForeignKey: row.is_foreign_key,
        foreignKeyReference: row.is_foreign_key
          ? {
              table: row.foreign_table_name,
              column: row.foreign_column_name,
            }
          : undefined,
      };
    });
  }

  private async getTableIndexes(
    pool: Pool,
    tableName: string,
    schema: string
  ): Promise<IndexInfo[]> {
    const result = await pool.query(
      `
      SELECT
        i.relname AS index_name,
        array_agg(a.attname ORDER BY x.n) AS columns,
        ix.indisunique AS is_unique,
        am.amname AS index_type
      FROM pg_class t
      JOIN pg_index ix ON t.oid = ix.indrelid
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_am am ON i.relam = am.oid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      CROSS JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS x(attnum, n)
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.attnum
      WHERE t.relname = $2 AND n.nspname = $1
      GROUP BY i.relname, ix.indisunique, am.amname
      ORDER BY i.relname
    `,
      [schema, tableName]
    );

    return result.rows.map(row => ({
      name: row.index_name,
      columns: row.columns,
      unique: row.is_unique,
      type: row.index_type,
    }));
  }

  private async getTableRowCount(pool: Pool, tableName: string, schema: string): Promise<number> {
    try {
      const result = await pool.query(
        `
        SELECT reltuples::bigint AS estimate
        FROM pg_class
        WHERE oid = $1::regclass
      `,
        [`"${schema}"."${tableName}"`]
      );

      return result.rows[0]?.estimate || 0;
    } catch {
      return 0;
    }
  }

  private async getViews(databaseName: string, schema: string): Promise<ViewInfo[]> {
    const pool = await this.getPoolForDatabase(databaseName);

    const result = await pool.query(
      `
      SELECT table_name, view_definition
      FROM information_schema.views
      WHERE table_schema = $1
      ORDER BY table_name
    `,
      [schema]
    );

    return result.rows.map(row => ({
      name: row.table_name,
      schema,
      definition: row.view_definition,
    }));
  }

  private async getFunctions(databaseName: string, schema: string): Promise<FunctionInfo[]> {
    const pool = await this.getPoolForDatabase(databaseName);

    const result = await pool.query(
      `
      SELECT 
        p.proname AS function_name,
        pg_get_function_result(p.oid) AS return_type,
        pg_get_function_arguments(p.oid) AS arguments
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = $1 AND p.prokind = 'f'
      ORDER BY p.proname
    `,
      [schema]
    );

    return result.rows.map(row => ({
      name: row.function_name,
      schema,
      returnType: row.return_type || 'void',
      parameters: this.parseParameters(row.arguments),
    }));
  }

  private parseParameters(
    args: string
  ): { name: string; type: string; mode: 'IN' | 'OUT' | 'INOUT' }[] {
    if (!args) return [];

    return args.split(',').map(arg => {
      const parts = arg.trim().split(' ');
      let mode: 'IN' | 'OUT' | 'INOUT' = 'IN';
      let name = '';
      let type = '';

      if (parts[0] === 'OUT' || parts[0] === 'INOUT' || parts[0] === 'IN') {
        mode = parts[0] as 'IN' | 'OUT' | 'INOUT';
        name = parts[1] || '';
        type = parts.slice(2).join(' ');
      } else {
        name = parts[0] || '';
        type = parts.slice(1).join(' ');
      }

      return { name, type, mode };
    });
  }
}
