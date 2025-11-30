/**
 * High-level service interfaces that orchestrate business logic
 * These services use the lower-level interfaces and can be used by any platform
 */

import {
  ConnectionConfig,
  QueryResult,
  QueryOptions,
  TableInfo,
  DatabaseSchema,
} from '../../types';
import { SavedQuery } from './IConnectionStorage';

// ============================================================================
// Query Execution Service
// ============================================================================

export interface QueryExecutionRequest {
  connectionId: string;
  query: string;
  databaseName?: string;
  options?: QueryOptions;
}

export interface QueryExecutionResult extends QueryResult {
  connectionId: string;
  databaseName?: string;
  startTime: Date;
  endTime: Date;
}

export interface IQueryExecutionService {
  /**
   * Execute a query
   */
  execute(request: QueryExecutionRequest): Promise<QueryExecutionResult>;

  /**
   * Execute multiple queries in sequence
   */
  executeMultiple(requests: QueryExecutionRequest[]): Promise<QueryExecutionResult[]>;

  /**
   * Cancel a running query (if supported)
   */
  cancel(queryId: string): Promise<boolean>;

  /**
   * Get query history
   */
  getHistory(connectionId?: string, limit?: number): Promise<QueryExecutionResult[]>;

  /**
   * Clear query history
   */
  clearHistory(connectionId?: string): Promise<void>;
}

// ============================================================================
// Schema Service
// ============================================================================

export interface SchemaDatabaseInfo {
  name: string;
  size?: string;
  owner?: string;
  encoding?: string;
}

export interface SchemaObjectsInfo {
  tables: TableInfo[];
  views: SchemaViewInfo[];
  functions: SchemaFunctionInfo[];
  procedures: SchemaProcedureInfo[];
  types: SchemaTypeInfo[];
  sequences: SchemaSequenceInfo[];
}

export interface SchemaViewInfo {
  name: string;
  schema: string;
  definition?: string;
}

export interface SchemaFunctionInfo {
  name: string;
  schema: string;
  returnType: string;
  parameters?: string;
  definition?: string;
}

export interface SchemaProcedureInfo {
  name: string;
  schema: string;
  parameters?: string;
  definition?: string;
}

export interface SchemaTypeInfo {
  name: string;
  schema: string;
  category: string;
}

export interface SchemaSequenceInfo {
  name: string;
  schema: string;
}

export interface SchemaTriggerInfo {
  name: string;
  tableName: string;
  schema: string;
  timing: string;
  event: string;
  definition?: string;
}

export interface ISchemaService {
  /**
   * Get list of databases
   */
  getDatabases(connectionId: string): Promise<SchemaDatabaseInfo[]>;

  /**
   * Get list of schemas in a database
   */
  getSchemas(connectionId: string, databaseName: string): Promise<string[]>;

  /**
   * Get objects in a schema
   */
  getSchemaObjects(
    connectionId: string,
    databaseName: string,
    schemaName: string
  ): Promise<SchemaObjectsInfo>;

  /**
   * Get table information
   */
  getTableInfo(
    connectionId: string,
    databaseName: string,
    tableName: string,
    schemaName?: string
  ): Promise<TableInfo>;

  /**
   * Get triggers for a table
   */
  getTriggers(
    connectionId: string,
    databaseName: string,
    tableName: string,
    schemaName?: string
  ): Promise<SchemaTriggerInfo[]>;

  /**
   * Get object definition (view, function, etc.)
   */
  getObjectDefinition(
    connectionId: string,
    databaseName: string,
    objectName: string,
    objectType: 'view' | 'function' | 'procedure' | 'trigger' | 'type' | 'sequence',
    schemaName?: string
  ): Promise<string>;

  /**
   * Refresh cached schema information
   */
  refresh(connectionId: string, databaseName?: string, schemaName?: string): Promise<void>;
}

// ============================================================================
// Saved Queries Service
// ============================================================================

export interface ISavedQueriesService {
  /**
   * Get all saved queries for a connection
   */
  getQueries(connectionId: string): Promise<SavedQuery[]>;

  /**
   * Get a specific saved query
   */
  getQuery(queryId: string): Promise<SavedQuery | undefined>;

  /**
   * Save a query
   */
  saveQuery(query: Omit<SavedQuery, 'id' | 'createdAt'>): Promise<SavedQuery>;

  /**
   * Update a saved query
   */
  updateQuery(
    queryId: string,
    updates: Partial<Omit<SavedQuery, 'id' | 'createdAt'>>
  ): Promise<SavedQuery>;

  /**
   * Delete a saved query
   */
  deleteQuery(queryId: string): Promise<void>;

  /**
   * Import queries from a file
   */
  importQueries(
    connectionId: string,
    queries: Array<{ name: string; sql: string }>
  ): Promise<SavedQuery[]>;

  /**
   * Export queries to a file format
   */
  exportQueries(connectionId: string): Promise<Array<{ name: string; sql: string }>>;
}

// ============================================================================
// Connection Service (extends ConnectionManager with higher-level operations)
// ============================================================================

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  version?: string;
  latency?: number;
}

export interface IConnectionService {
  /**
   * Get all saved connections
   */
  getConnections(): Promise<ConnectionConfig[]>;

  /**
   * Get a connection by ID
   */
  getConnection(id: string): Promise<ConnectionConfig | undefined>;

  /**
   * Save a connection
   */
  saveConnection(config: ConnectionConfig): Promise<void>;

  /**
   * Delete a connection
   */
  deleteConnection(id: string): Promise<void>;

  /**
   * Connect to a database
   */
  connect(config: ConnectionConfig): Promise<void>;

  /**
   * Disconnect from a database
   */
  disconnect(connectionId: string): Promise<void>;

  /**
   * Test a connection
   */
  testConnection(config: ConnectionConfig): Promise<ConnectionTestResult>;

  /**
   * Check if connected
   */
  isConnected(connectionId: string): boolean;

  /**
   * Get connection status
   */
  getStatus(connectionId: string): 'connected' | 'disconnected' | 'connecting' | 'error';
}

// ============================================================================
// DDL Operations Service
// ============================================================================

export interface CreateTableRequest {
  connectionId: string;
  databaseName: string;
  schemaName: string;
  tableName: string;
  columns: Array<{
    name: string;
    type: string;
    nullable?: boolean;
    defaultValue?: string;
    isPrimaryKey?: boolean;
  }>;
}

export interface CreateIndexRequest {
  connectionId: string;
  databaseName: string;
  schemaName: string;
  tableName: string;
  indexName: string;
  columns: string[];
  unique?: boolean;
}

export interface IDDLService {
  /**
   * Create a table
   */
  createTable(request: CreateTableRequest): Promise<void>;

  /**
   * Drop a table
   */
  dropTable(
    connectionId: string,
    databaseName: string,
    schemaName: string,
    tableName: string,
    cascade?: boolean
  ): Promise<void>;

  /**
   * Truncate a table
   */
  truncateTable(
    connectionId: string,
    databaseName: string,
    schemaName: string,
    tableName: string
  ): Promise<void>;

  /**
   * Create an index
   */
  createIndex(request: CreateIndexRequest): Promise<void>;

  /**
   * Drop an index
   */
  dropIndex(
    connectionId: string,
    databaseName: string,
    schemaName: string,
    indexName: string
  ): Promise<void>;

  /**
   * Create a schema
   */
  createSchema(connectionId: string, databaseName: string, schemaName: string): Promise<void>;

  /**
   * Drop a schema
   */
  dropSchema(
    connectionId: string,
    databaseName: string,
    schemaName: string,
    cascade?: boolean
  ): Promise<void>;

  /**
   * Generate DDL script for an object
   */
  generateDDL(
    connectionId: string,
    databaseName: string,
    objectType: 'table' | 'view' | 'function' | 'procedure' | 'schema',
    objectName: string,
    schemaName?: string
  ): Promise<string>;
}

// ============================================================================
// Export Service
// ============================================================================

export type ExportFormat = 'csv' | 'json' | 'sql' | 'excel';

export interface ExportOptions {
  format: ExportFormat;
  includeHeaders?: boolean;
  delimiter?: string;
  dateFormat?: string;
  nullValue?: string;
}

export interface IExportService {
  /**
   * Export query results
   */
  exportQueryResults(results: QueryResult, options: ExportOptions): Promise<string>;

  /**
   * Export table data
   */
  exportTable(
    connectionId: string,
    databaseName: string,
    tableName: string,
    schemaName: string,
    options: ExportOptions
  ): Promise<string>;

  /**
   * Get supported formats
   */
  getSupportedFormats(): ExportFormat[];
}
