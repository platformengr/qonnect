import { ConnectionConfig, ConnectionCategory } from '../../types';

/**
 * Saved query definition
 */
export interface SavedQuery {
  id: string;
  name: string;
  sql: string;
  connectionId: string;
  database?: string;
  createdAt: string;
}

/**
 * Interface for connection storage
 */
export interface IConnectionStorage {
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
  saveConnection(connection: ConnectionConfig): Promise<void>;

  /**
   * Delete a connection
   */
  deleteConnection(id: string): Promise<void>;

  /**
   * Get all categories
   */
  getCategories(): Promise<ConnectionCategory[]>;

  /**
   * Save a category
   */
  saveCategory(category: ConnectionCategory): Promise<void>;

  /**
   * Delete a category
   */
  deleteCategory(id: string): Promise<void>;

  /**
   * Get connections by category
   */
  getConnectionsByCategory(categoryId: string): Promise<ConnectionConfig[]>;

  /**
   * Get saved queries for a connection
   */
  getSavedQueries(connectionId: string): Promise<SavedQuery[]>;

  /**
   * Save a query
   */
  saveQuery(query: SavedQuery): Promise<void>;

  /**
   * Delete a saved query
   */
  deleteQuery(queryId: string): Promise<void>;

  /**
   * Delete all saved queries for a connection
   */
  deleteQueriesForConnection(connectionId: string): Promise<void>;
}
