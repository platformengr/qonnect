import * as vscode from 'vscode';
import { IConnectionStorage, SavedQuery } from '../../core/interfaces';
import { ConnectionConfig, ConnectionCategory } from '../../types';

const CONNECTIONS_KEY = 'qonnect.connections';
const CATEGORIES_KEY = 'qonnect.categories';
const SAVED_QUERIES_KEY = 'qonnect.savedQueries';
const SECRETS_PREFIX = 'dbclient2_pwd_';

/**
 * VS Code-based connection storage using ExtensionContext
 */
export class VSCodeConnectionStorage implements IConnectionStorage {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async getConnections(): Promise<ConnectionConfig[]> {
    const connections = this.context.globalState.get<ConnectionConfig[]>(CONNECTIONS_KEY, []);

    // Retrieve passwords from secrets
    const connectionsWithPasswords = await Promise.all(
      connections.map(async conn => {
        const password = await this.context.secrets.get(`${SECRETS_PREFIX}${conn.id}`);
        return { ...conn, password: password || '' };
      })
    );

    return connectionsWithPasswords;
  }

  async getConnection(id: string): Promise<ConnectionConfig | undefined> {
    const connections = await this.getConnections();
    return connections.find(c => c.id === id);
  }

  async saveConnection(connection: ConnectionConfig): Promise<void> {
    const connections = await this.getConnections();
    const index = connections.findIndex(c => c.id === connection.id);

    // Store password in secrets separately
    if (connection.password) {
      await this.context.secrets.store(`${SECRETS_PREFIX}${connection.id}`, connection.password);
    }

    // Store connection without password in global state
    const connectionWithoutPassword = { ...connection, password: '' };

    if (index >= 0) {
      connections[index] = connectionWithoutPassword;
    } else {
      connections.push(connectionWithoutPassword);
    }

    await this.context.globalState.update(CONNECTIONS_KEY, connections);
  }

  async deleteConnection(id: string): Promise<void> {
    const connections = await this.getConnections();
    const filtered = connections.filter(c => c.id !== id);

    // Remove password from secrets
    await this.context.secrets.delete(`${SECRETS_PREFIX}${id}`);

    // Remove saved queries for this connection
    await this.deleteQueriesForConnection(id);

    await this.context.globalState.update(CONNECTIONS_KEY, filtered);
  }

  async getCategories(): Promise<ConnectionCategory[]> {
    return this.context.globalState.get<ConnectionCategory[]>(CATEGORIES_KEY, []);
  }

  async saveCategory(category: ConnectionCategory): Promise<void> {
    const categories = await this.getCategories();
    const index = categories.findIndex(c => c.id === category.id);

    if (index >= 0) {
      categories[index] = category;
    } else {
      categories.push(category);
    }

    await this.context.globalState.update(CATEGORIES_KEY, categories);
  }

  async deleteCategory(id: string): Promise<void> {
    const categories = await this.getCategories();
    const filtered = categories.filter(c => c.id !== id);
    await this.context.globalState.update(CATEGORIES_KEY, filtered);

    // Remove category reference from connections
    const connections = await this.getConnections();
    const updatedConnections = connections.map(conn =>
      conn.categoryId === id ? { ...conn, categoryId: undefined } : conn
    );
    await this.context.globalState.update(CONNECTIONS_KEY, updatedConnections);
  }

  async getConnectionsByCategory(categoryId: string): Promise<ConnectionConfig[]> {
    const connections = await this.getConnections();
    return connections.filter(c => c.categoryId === categoryId);
  }

  async getSavedQueries(connectionId: string): Promise<SavedQuery[]> {
    const queries = this.context.globalState.get<SavedQuery[]>(SAVED_QUERIES_KEY, []);
    return queries.filter(q => q.connectionId === connectionId);
  }

  async saveQuery(query: SavedQuery): Promise<void> {
    const queries = this.context.globalState.get<SavedQuery[]>(SAVED_QUERIES_KEY, []);
    const index = queries.findIndex(q => q.id === query.id);

    if (index >= 0) {
      queries[index] = query;
    } else {
      queries.push(query);
    }

    await this.context.globalState.update(SAVED_QUERIES_KEY, queries);
  }

  async deleteQuery(queryId: string): Promise<void> {
    const queries = this.context.globalState.get<SavedQuery[]>(SAVED_QUERIES_KEY, []);
    const filtered = queries.filter(q => q.id !== queryId);
    await this.context.globalState.update(SAVED_QUERIES_KEY, filtered);
  }

  async deleteQueriesForConnection(connectionId: string): Promise<void> {
    const queries = this.context.globalState.get<SavedQuery[]>(SAVED_QUERIES_KEY, []);
    const filtered = queries.filter(q => q.connectionId !== connectionId);
    await this.context.globalState.update(SAVED_QUERIES_KEY, filtered);
  }
}
