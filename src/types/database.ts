/**
 * Database type enumeration
 */
export enum DatabaseType {
  PostgreSQL = 'postgresql',
  MySQL = 'mysql',
  SQLite = 'sqlite',
  MongoDB = 'mongodb',
  Redis = 'redis',
}

/**
 * Connection status
 */
export enum ConnectionStatus {
  Connected = 'connected',
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Error = 'error',
}

/**
 * Database connection configuration
 */
export interface ConnectionConfig {
  id: string;
  name: string;
  type: DatabaseType;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  categoryId?: string;
  color?: string;
  /** Connection string override - if provided, uses this instead of individual fields */
  connectionString?: string;
}

/**
 * Connection category for organizing connections
 */
export interface ConnectionCategory {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  parentId?: string;
}

/**
 * Database schema information
 */
export interface DatabaseSchema {
  name: string;
  tables: TableInfo[];
  views: ViewInfo[];
  functions: FunctionInfo[];
}

/**
 * Table information
 */
export interface TableInfo {
  name: string;
  schema: string;
  columns: ColumnInfo[];
  primaryKey?: string[];
  indexes: IndexInfo[];
  rowCount?: number;
}

/**
 * Column information
 */
export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  foreignKeyReference?: ForeignKeyReference;
  comment?: string;
}

/**
 * Foreign key reference
 */
export interface ForeignKeyReference {
  table: string;
  column: string;
  schema?: string;
}

/**
 * Index information
 */
export interface IndexInfo {
  name: string;
  columns: string[];
  unique: boolean;
  type: string;
}

/**
 * View information
 */
export interface ViewInfo {
  name: string;
  schema: string;
  definition?: string;
}

/**
 * Function/Procedure information
 */
export interface FunctionInfo {
  name: string;
  schema: string;
  returnType: string;
  parameters: ParameterInfo[];
  definition?: string;
}

/**
 * Parameter information
 */
export interface ParameterInfo {
  name: string;
  type: string;
  mode: 'IN' | 'OUT' | 'INOUT';
  defaultValue?: string;
}

/**
 * Query result
 */
export interface QueryResult {
  columns: QueryColumn[];
  rows: Record<string, unknown>[];
  rowCount: number;
  affectedRows?: number;
  executionTime: number;
  error?: string;
}

/**
 * Query column metadata
 */
export interface QueryColumn {
  name: string;
  type: string;
  tableId?: number;
}

/**
 * Query execution options
 */
export interface QueryOptions {
  limit?: number;
  offset?: number;
  timeout?: number;
}

/**
 * Saved query
 */
export interface SavedQuery {
  id: string;
  name: string;
  query: string;
  connectionId?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Query history entry
 */
export interface QueryHistoryEntry {
  id: string;
  query: string;
  connectionId: string;
  executedAt: Date;
  executionTime: number;
  rowCount?: number;
  error?: string;
}
