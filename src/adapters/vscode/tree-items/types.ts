/**
 * Tree item types for the database explorer - PostgreSQL specific structure
 */
export type TreeItemType =
  | 'category'
  | 'connection'
  | 'security-folder'
  | 'role'
  | 'database'
  | 'saved-queries-folder'
  | 'saved-query'
  | 'schema'
  | 'tables-folder'
  | 'views-folder'
  | 'functions-folder'
  | 'procedures-folder'
  | 'types-folder'
  | 'sequences-folder'
  | 'extensions-folder'
  | 'materialized-views-folder'
  | 'table'
  | 'view'
  | 'materialized-view'
  | 'function'
  | 'procedure'
  | 'type'
  | 'sequence'
  | 'extension'
  | 'columns-folder'
  | 'column'
  | 'index-folder'
  | 'index'
  | 'triggers-folder'
  | 'trigger';

/**
 * Icon mapping for tree item types
 */
export const TREE_ITEM_ICONS: Record<TreeItemType, string> = {
  category: 'folder',
  connection: 'database',
  'security-folder': 'shield',
  role: 'person',
  database: 'database',
  'saved-queries-folder': 'bookmark',
  'saved-query': 'file-code',
  schema: 'symbol-namespace',
  'tables-folder': 'table',
  'views-folder': 'eye',
  'functions-folder': 'symbol-function',
  'procedures-folder': 'symbol-method',
  'types-folder': 'symbol-class',
  'sequences-folder': 'symbol-number',
  'extensions-folder': 'extensions',
  'materialized-views-folder': 'layers',
  table: 'table',
  view: 'eye',
  'materialized-view': 'layers',
  function: 'symbol-function',
  procedure: 'symbol-method',
  type: 'symbol-class',
  sequence: 'symbol-number',
  extension: 'extensions',
  'columns-folder': 'symbol-field',
  column: 'symbol-field',
  'index-folder': 'key',
  index: 'key',
  'triggers-folder': 'zap',
  trigger: 'zap',
};
