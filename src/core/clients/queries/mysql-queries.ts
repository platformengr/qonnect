/**
 * MySQL SQL query constants
 * Centralizes all SQL queries for better maintainability and testability
 */

export const MySQLQueries = {
  /**
   * Get list of databases
   */
  getDatabases: `
    SELECT 
      SCHEMA_NAME AS name,
      DEFAULT_CHARACTER_SET_NAME AS encoding,
      DEFAULT_COLLATION_NAME AS collation
    FROM information_schema.SCHEMATA
    WHERE SCHEMA_NAME NOT IN ('information_schema', 'performance_schema', 'mysql', 'sys')
    ORDER BY SCHEMA_NAME
  `,

  /**
   * Get all databases including system databases
   */
  getAllDatabases: `SHOW DATABASES`,

  /**
   * Get MySQL server version
   */
  getVersion: `SELECT VERSION() AS version`,

  /**
   * Get tables for a database with row count estimates
   */
  getTables: `
    SELECT 
      TABLE_NAME AS table_name,
      TABLE_ROWS AS row_estimate,
      DATA_LENGTH AS data_size,
      INDEX_LENGTH AS index_size,
      ENGINE AS engine
    FROM information_schema.TABLES 
    WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
    ORDER BY TABLE_NAME
  `,

  /**
   * Get column information for a table
   */
  getTableColumns: `
    SELECT 
      c.COLUMN_NAME AS column_name,
      c.DATA_TYPE AS data_type,
      c.COLUMN_TYPE AS column_type,
      c.IS_NULLABLE AS is_nullable,
      c.COLUMN_DEFAULT AS column_default,
      c.CHARACTER_MAXIMUM_LENGTH AS character_maximum_length,
      c.NUMERIC_PRECISION AS numeric_precision,
      c.NUMERIC_SCALE AS numeric_scale,
      c.COLUMN_KEY AS column_key,
      c.EXTRA AS extra,
      c.COLUMN_COMMENT AS column_comment,
      CASE WHEN c.COLUMN_KEY = 'PRI' THEN 1 ELSE 0 END AS is_primary_key,
      CASE WHEN kcu.REFERENCED_TABLE_NAME IS NOT NULL THEN 1 ELSE 0 END AS is_foreign_key,
      kcu.REFERENCED_TABLE_NAME AS foreign_table_name,
      kcu.REFERENCED_COLUMN_NAME AS foreign_column_name
    FROM information_schema.COLUMNS c
    LEFT JOIN information_schema.KEY_COLUMN_USAGE kcu 
      ON c.TABLE_SCHEMA = kcu.TABLE_SCHEMA 
      AND c.TABLE_NAME = kcu.TABLE_NAME 
      AND c.COLUMN_NAME = kcu.COLUMN_NAME
      AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
    WHERE c.TABLE_SCHEMA = ? AND c.TABLE_NAME = ?
    ORDER BY c.ORDINAL_POSITION
  `,

  /**
   * Get indexes for a table
   */
  getTableIndexes: `
    SELECT 
      INDEX_NAME AS index_name,
      GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns,
      CASE WHEN NON_UNIQUE = 0 THEN 1 ELSE 0 END AS is_unique,
      INDEX_TYPE AS index_type
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
    GROUP BY INDEX_NAME, NON_UNIQUE, INDEX_TYPE
    ORDER BY INDEX_NAME
  `,

  /**
   * Get row count estimate for a table
   */
  getTableRowCount: `
    SELECT TABLE_ROWS AS estimate
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
  `,

  /**
   * Get views for a database
   */
  getViews: `
    SELECT 
      TABLE_NAME AS table_name,
      VIEW_DEFINITION AS view_definition
    FROM information_schema.VIEWS
    WHERE TABLE_SCHEMA = ?
    ORDER BY TABLE_NAME
  `,

  /**
   * Get functions for a database
   */
  getFunctions: `
    SELECT 
      ROUTINE_NAME AS function_name,
      DATA_TYPE AS return_type,
      ROUTINE_DEFINITION AS definition,
      PARAMETER_STYLE AS parameter_style
    FROM information_schema.ROUTINES
    WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'FUNCTION'
    ORDER BY ROUTINE_NAME
  `,

  /**
   * Get function parameters
   */
  getFunctionParameters: `
    SELECT 
      PARAMETER_NAME AS param_name,
      DATA_TYPE AS param_type,
      PARAMETER_MODE AS param_mode,
      ORDINAL_POSITION AS position
    FROM information_schema.PARAMETERS
    WHERE SPECIFIC_SCHEMA = ? AND SPECIFIC_NAME = ?
    ORDER BY ORDINAL_POSITION
  `,

  /**
   * Get procedures for a database
   */
  getProcedures: `
    SELECT 
      ROUTINE_NAME AS procedure_name,
      ROUTINE_DEFINITION AS definition,
      ROUTINE_COMMENT AS comment
    FROM information_schema.ROUTINES
    WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'PROCEDURE'
    ORDER BY ROUTINE_NAME
  `,

  /**
   * Get procedure parameters
   */
  getProcedureParameters: `
    SELECT 
      PARAMETER_NAME AS param_name,
      DATA_TYPE AS param_type,
      PARAMETER_MODE AS param_mode,
      ORDINAL_POSITION AS position
    FROM information_schema.PARAMETERS
    WHERE SPECIFIC_SCHEMA = ? AND SPECIFIC_NAME = ?
    ORDER BY ORDINAL_POSITION
  `,

  /**
   * Get triggers for a table
   */
  getTriggers: `
    SELECT 
      TRIGGER_NAME AS trigger_name,
      EVENT_OBJECT_TABLE AS table_name,
      EVENT_MANIPULATION AS event,
      ACTION_TIMING AS timing,
      ACTION_STATEMENT AS definition
    FROM information_schema.TRIGGERS
    WHERE TRIGGER_SCHEMA = ? AND EVENT_OBJECT_TABLE = ?
    ORDER BY TRIGGER_NAME
  `,

  /**
   * Get all triggers for a database
   */
  getAllTriggers: `
    SELECT 
      TRIGGER_NAME AS trigger_name,
      EVENT_OBJECT_TABLE AS table_name,
      EVENT_MANIPULATION AS event,
      ACTION_TIMING AS timing,
      ACTION_STATEMENT AS definition
    FROM information_schema.TRIGGERS
    WHERE TRIGGER_SCHEMA = ?
    ORDER BY TRIGGER_NAME
  `,

  /**
   * Get users (requires appropriate privileges)
   */
  getUsers: `
    SELECT 
      User AS name,
      Host AS host,
      CASE WHEN Super_priv = 'Y' THEN 1 ELSE 0 END AS is_super,
      CASE WHEN Create_priv = 'Y' THEN 1 ELSE 0 END AS can_create
    FROM mysql.user
    WHERE User NOT LIKE 'mysql.%'
    ORDER BY User
  `,

  /**
   * Get current user
   */
  getCurrentUser: `SELECT CURRENT_USER() AS current_user`,

  /**
   * Get events for a database
   */
  getEvents: `
    SELECT 
      EVENT_NAME AS event_name,
      EVENT_TYPE AS event_type,
      EXECUTE_AT AS execute_at,
      INTERVAL_VALUE AS interval_value,
      INTERVAL_FIELD AS interval_field,
      STATUS AS status,
      EVENT_DEFINITION AS definition
    FROM information_schema.EVENTS
    WHERE EVENT_SCHEMA = ?
    ORDER BY EVENT_NAME
  `,

  /**
   * Get foreign keys for a table
   */
  getForeignKeys: `
    SELECT 
      CONSTRAINT_NAME AS constraint_name,
      COLUMN_NAME AS column_name,
      REFERENCED_TABLE_NAME AS referenced_table,
      REFERENCED_COLUMN_NAME AS referenced_column
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = ? 
      AND TABLE_NAME = ? 
      AND REFERENCED_TABLE_NAME IS NOT NULL
    ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION
  `,

  /**
   * Get table constraints
   */
  getTableConstraints: `
    SELECT 
      CONSTRAINT_NAME AS constraint_name,
      CONSTRAINT_TYPE AS constraint_type
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
    ORDER BY CONSTRAINT_NAME
  `,

  /**
   * Get character sets
   */
  getCharacterSets: `SHOW CHARACTER SET`,

  /**
   * Get collations
   */
  getCollations: `SHOW COLLATION`,

  /**
   * Get process list
   */
  getProcessList: `SHOW PROCESSLIST`,

  /**
   * Get global variables
   */
  getVariables: `SHOW GLOBAL VARIABLES`,

  /**
   * Get server status
   */
  getStatus: `SHOW GLOBAL STATUS`,

  /**
   * Get storage engines
   */
  getEngines: `SHOW ENGINES`,
} as const;

/**
 * MySQL data type mapping
 */
export const MySQLTypeMap: Record<string, string> = {
  tinyint: 'tinyint',
  smallint: 'smallint',
  mediumint: 'mediumint',
  int: 'integer',
  integer: 'integer',
  bigint: 'bigint',
  decimal: 'decimal',
  numeric: 'numeric',
  float: 'float',
  double: 'double',
  real: 'real',
  bit: 'bit',
  boolean: 'boolean',
  bool: 'boolean',
  date: 'date',
  datetime: 'datetime',
  timestamp: 'timestamp',
  time: 'time',
  year: 'year',
  char: 'char',
  varchar: 'varchar',
  binary: 'binary',
  varbinary: 'varbinary',
  tinyblob: 'tinyblob',
  blob: 'blob',
  mediumblob: 'mediumblob',
  longblob: 'longblob',
  tinytext: 'tinytext',
  text: 'text',
  mediumtext: 'mediumtext',
  longtext: 'longtext',
  enum: 'enum',
  set: 'set',
  json: 'json',
  geometry: 'geometry',
  point: 'point',
  linestring: 'linestring',
  polygon: 'polygon',
};

/**
 * Get normalized type name for MySQL data type
 */
export function getMySQLTypeName(dataType: string): string {
  const normalizedType = dataType.toLowerCase().split('(')[0].trim();
  return MySQLTypeMap[normalizedType] || dataType;
}
