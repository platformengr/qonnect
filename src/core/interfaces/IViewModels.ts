/**
 * Platform-agnostic interfaces for panel/view rendering
 * These interfaces define contracts for UI components that can be rendered
 * in VS Code webviews, React components, or any other UI framework
 */

// ============================================================================
// View Model Interfaces
// ============================================================================

/**
 * Connection view model - platform-agnostic representation
 */
export interface ConnectionViewModel {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  type: string;
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  version?: string;
  categoryId?: string;
}

/**
 * Database tree structure - platform-agnostic
 */
export interface DatabaseTreeNode {
  id: string;
  type: TreeNodeType;
  label: string;
  description?: string;
  tooltip?: string;
  children?: DatabaseTreeNode[];
  data?: Record<string, unknown>;
  isExpandable: boolean;
  isExpanded?: boolean;
  icon?: string;
  contextValue?: string;
}

export type TreeNodeType =
  | 'category'
  | 'connection'
  | 'database'
  | 'schema'
  | 'tables-folder'
  | 'views-folder'
  | 'functions-folder'
  | 'procedures-folder'
  | 'types-folder'
  | 'sequences-folder'
  | 'table'
  | 'view'
  | 'function'
  | 'procedure'
  | 'type'
  | 'sequence'
  | 'columns-folder'
  | 'column'
  | 'indexes-folder'
  | 'index'
  | 'triggers-folder'
  | 'trigger'
  | 'security-folder'
  | 'role'
  | 'saved-queries-folder'
  | 'saved-query';

/**
 * Query result view model
 */
export interface QueryResultViewModel {
  columns: Array<{
    name: string;
    type: string;
  }>;
  rows: Record<string, unknown>[];
  rowCount: number;
  affectedRows?: number;
  executionTime: number;
  error?: string;
  query: string;
  database?: string;
}

/**
 * Table data view model
 */
export interface TableDataViewModel {
  tableName: string;
  schemaName: string;
  databaseName: string;
  columns: Array<{
    name: string;
    type: string;
    isPrimaryKey: boolean;
    isForeignKey: boolean;
    nullable: boolean;
  }>;
  rows: Record<string, unknown>[];
  totalRows: number;
  page: number;
  pageSize: number;
  filter?: string;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

/**
 * Object definition view model (for views, functions, triggers, etc.)
 */
export interface ObjectDefinitionViewModel {
  name: string;
  type: 'view' | 'function' | 'procedure' | 'trigger' | 'type' | 'sequence';
  schemaName: string;
  databaseName: string;
  definition: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Panel/View Interfaces
// ============================================================================

/**
 * Base interface for all panels/views
 */
export interface IPanel<TState = unknown> {
  /**
   * Unique identifier for this panel instance
   */
  readonly id: string;

  /**
   * Get current state
   */
  getState(): TState;

  /**
   * Dispose of resources
   */
  dispose(): void;
}

/**
 * Panel that can send/receive messages
 */
export interface IMessageablePanel<TIncoming = unknown, TOutgoing = unknown> extends IPanel {
  /**
   * Send a message to the panel
   */
  postMessage(message: TOutgoing): Promise<boolean>;

  /**
   * Subscribe to messages from the panel
   */
  onMessage(handler: (message: TIncoming) => void): () => void;
}

// ============================================================================
// Panel Factory Interface
// ============================================================================

export interface TableViewerOptions {
  connectionId: string;
  databaseName: string;
  tableName: string;
  schemaName: string;
}

export interface QueryEditorOptions {
  connectionId: string;
  databaseName?: string;
  initialQuery?: string;
}

export interface ObjectViewerOptions {
  connectionId: string;
  databaseName: string;
  objectName: string;
  objectType: 'view' | 'function' | 'procedure' | 'trigger' | 'type' | 'sequence';
  schemaName: string;
}

export interface ConnectionFormOptions {
  editConnection?: ConnectionViewModel;
}

/**
 * Factory for creating platform-specific panels
 * Each platform (VS Code, Backstage, Web) implements this interface
 */
export interface IPanelFactory {
  /**
   * Create or show a table viewer panel
   */
  createTableViewer(options: TableViewerOptions): IPanel<TableDataViewModel>;

  /**
   * Create or show a query editor panel
   */
  createQueryEditor(options: QueryEditorOptions): IPanel<QueryResultViewModel>;

  /**
   * Create or show an object viewer panel
   */
  createObjectViewer(options: ObjectViewerOptions): IPanel<ObjectDefinitionViewModel>;

  /**
   * Create or show a connection form panel
   */
  createConnectionForm(options: ConnectionFormOptions): IPanel<ConnectionViewModel>;
}

// ============================================================================
// Tree Data Provider Interface
// ============================================================================

export interface TreeChangeEvent {
  node?: DatabaseTreeNode;
}

/**
 * Platform-agnostic tree data provider
 */
export interface ITreeDataProvider {
  /**
   * Get root nodes
   */
  getRoots(): Promise<DatabaseTreeNode[]>;

  /**
   * Get children of a node
   */
  getChildren(node: DatabaseTreeNode): Promise<DatabaseTreeNode[]>;

  /**
   * Refresh the tree or a specific node
   */
  refresh(node?: DatabaseTreeNode): void;

  /**
   * Subscribe to tree changes
   */
  onDidChangeTreeData(handler: (event: TreeChangeEvent) => void): () => void;
}
