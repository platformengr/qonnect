import {
  ConnectionConfig,
  ConnectionStatus,
  DatabaseSchema,
  TableInfo,
  QueryResult,
  QueryOptions,
} from '../../types';

// Import database client-specific types
import type { TriggerInfo, DatabaseInfo, RoleInfo, SchemaObjects } from '../types';

/**
 * Interface for database client implementations
 * Each database type (PostgreSQL, MySQL, etc.) must implement this interface
 */
export interface IDatabaseClient {
  /**
   * Get the current connection status
   */
  readonly status: ConnectionStatus;

  /**
   * Get the connection configuration
   */
  readonly config: ConnectionConfig;

  /**
   * Connect to the database server
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the database server
   */
  disconnect(): Promise<void>;

  /**
   * Test the connection without establishing a persistent connection
   */
  testConnection(): Promise<boolean>;

  /**
   * Execute a SQL query on the default database
   */
  executeQuery(query: string, options?: QueryOptions): Promise<QueryResult>;

  /**
   * Execute a SQL query on a specific database
   * @param databaseName - The database to execute the query on
   * @param query - The SQL query
   * @param options - Query options
   */
  executeQueryOnDatabase(
    databaseName: string,
    query: string,
    options?: QueryOptions
  ): Promise<QueryResult>;

  /**
   * Get database schema information for the default database
   */
  getSchema(): Promise<DatabaseSchema>;

  /**
   * Get list of schemas in a database
   * @param databaseName - Optional database name (uses default if not specified)
   */
  getSchemas(databaseName?: string): Promise<string[]>;

  /**
   * Get list of databases
   */
  getDatabases(): Promise<DatabaseInfo[]>;

  /**
   * Get list of roles/users
   */
  getRoles(): Promise<RoleInfo[]>;

  /**
   * Get schema objects (tables, views, functions, procedures)
   * @param databaseName - The database name
   * @param schemaName - Optional schema name (PostgreSQL only, MySQL ignores this)
   */
  getSchemaObjects(databaseName: string, schemaName?: string): Promise<SchemaObjects>;

  /**
   * Get triggers for a table
   * @param databaseName - The database containing the table
   * @param tableName - The table name
   * @param schema - Optional schema name (PostgreSQL only)
   */
  getTriggers(databaseName: string, tableName: string, schema?: string): Promise<TriggerInfo[]>;

  /**
   * Get table information
   * @param databaseName - The database containing the table
   * @param tableName - The table name
   * @param schema - The schema name (default: 'public' for PostgreSQL)
   */
  getTableInfo(databaseName: string, tableName: string, schema?: string): Promise<TableInfo>;

  /**
   * Get table data with pagination
   * @param databaseName - The database containing the table
   * @param tableName - The table name
   * @param options - Query options including schema, filter, orderBy
   */
  getTableData(
    databaseName: string,
    tableName: string,
    options?: QueryOptions & { schema?: string; filter?: string; orderBy?: string }
  ): Promise<QueryResult>;

  /**
   * Get server version
   */
  getVersion(): Promise<string>;
}

/**
 * Factory interface for creating database clients
 */
export interface IDatabaseClientFactory {
  /**
   * Create a database client for the given configuration
   */
  createClient(config: ConnectionConfig): IDatabaseClient;

  /**
   * Check if the factory supports the given database type
   */
  supports(type: string): boolean;
}
