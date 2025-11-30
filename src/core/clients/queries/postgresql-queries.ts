/**
 * PostgreSQL SQL query constants
 * Centralizes all SQL queries for better maintainability and testability
 */

export const PostgreSQLQueries = {
  /**
   * Get list of schemas excluding system schemas
   */
  getSchemas: `
    SELECT schema_name 
    FROM information_schema.schemata 
    WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    ORDER BY schema_name
  `,

  /**
   * Get list of all databases with metadata
   */
  getDatabases: `
    SELECT 
      d.datname AS name,
      pg_catalog.pg_get_userbyid(d.datdba) AS owner,
      pg_catalog.pg_encoding_to_char(d.encoding) AS encoding,
      pg_catalog.pg_size_pretty(pg_catalog.pg_database_size(d.datname)) AS size,
      d.datname = current_database() AS is_current
    FROM pg_catalog.pg_database d
    WHERE d.datistemplate = false
    ORDER BY d.datname
  `,

  /**
   * Get list of roles/users excluding system roles
   */
  getRoles: `
    SELECT 
      rolname AS name,
      rolsuper AS is_super,
      rolcanlogin AS can_login,
      rolcreatedb AS can_create_db,
      rolcreaterole AS can_create_role
    FROM pg_catalog.pg_roles
    WHERE rolname NOT LIKE 'pg_%'
    ORDER BY rolname
  `,

  /**
   * Get PostgreSQL server version
   */
  getVersion: 'SELECT version()',

  /**
   * Get tables for a schema with row count estimates
   */
  getTables: (schema: string) => `
    SELECT 
      t.table_name,
      (SELECT reltuples::bigint FROM pg_class WHERE oid = (quote_ident($1) || '.' || quote_ident(t.table_name))::regclass) as row_estimate
    FROM information_schema.tables t
    WHERE t.table_schema = $1 AND t.table_type = 'BASE TABLE'
    ORDER BY t.table_name
  `,

  /**
   * Get column information for a table
   */
  getTableColumns: `
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

  /**
   * Get indexes for a table
   */
  getTableIndexes: `
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

  /**
   * Get row count estimate for a table
   */
  getTableRowCount: `
    SELECT reltuples::bigint AS estimate
    FROM pg_class
    WHERE oid = $1::regclass
  `,

  /**
   * Get views for a schema
   */
  getViews: `
    SELECT table_name, view_definition
    FROM information_schema.views
    WHERE table_schema = $1
    ORDER BY table_name
  `,

  /**
   * Get functions for a schema (excludes procedures)
   */
  getFunctions: `
    SELECT 
      p.proname AS function_name,
      pg_get_function_result(p.oid) AS return_type,
      pg_get_function_arguments(p.oid) AS arguments
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = $1 AND p.prokind = 'f'
    ORDER BY p.proname
  `,

  /**
   * Get procedures for a schema (PostgreSQL 11+)
   */
  getProcedures: `
    SELECT 
      p.proname AS procedure_name,
      pg_get_function_arguments(p.oid) AS arguments,
      pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = $1 AND p.prokind = 'p'
    ORDER BY p.proname
  `,

  /**
   * Get triggers for a table
   */
  getTriggers: `
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

  /**
   * Get types for a schema (enum, composite, domain, range)
   */
  getTypes: (schema: string) => `
    SELECT t.typname, 
           CASE t.typtype 
             WHEN 'e' THEN 'enum'
             WHEN 'c' THEN 'composite'
             WHEN 'd' THEN 'domain'
             WHEN 'r' THEN 'range'
             ELSE 'other'
           END as type_category
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = '${schema}'
    AND t.typtype IN ('e', 'c', 'd', 'r')
    ORDER BY t.typname
  `,

  /**
   * Get sequences for a schema
   */
  getSequences: (schema: string) => `
    SELECT sequencename FROM pg_sequences WHERE schemaname = '${schema}' ORDER BY sequencename
  `,
} as const;

/**
 * PostgreSQL data type mapping from OID to name
 */
export const PostgreSQLTypeMap: Record<number, string> = {
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

/**
 * Get type name from PostgreSQL OID
 */
export function getTypeName(dataTypeId: number): string {
  return PostgreSQLTypeMap[dataTypeId] || 'unknown';
}
