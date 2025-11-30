import { IDatabaseClient } from '../interfaces';
import { DatabaseClientFactory } from '../clients';
import { ConnectionConfig, ConnectionStatus } from '../../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Event types for connection manager
 */
export type ConnectionEvent =
  | { type: 'connected'; connectionId: string }
  | { type: 'disconnected'; connectionId: string }
  | { type: 'error'; connectionId: string; error: Error }
  | { type: 'statusChanged'; connectionId: string; status: ConnectionStatus };

/**
 * Listener type for connection events
 */
export type ConnectionEventListener = (event: ConnectionEvent) => void;

/**
 * Manages database connections - handles connecting, disconnecting,
 * and maintaining active client instances
 */
export class ConnectionManager {
  private clients: Map<string, IDatabaseClient> = new Map();
  private activeConnectionId: string | null = null;
  private listeners: Set<ConnectionEventListener> = new Set();
  private factory: DatabaseClientFactory;

  constructor() {
    this.factory = DatabaseClientFactory.getInstance();
  }

  /**
   * Get the active connection ID
   */
  getActiveConnectionId(): string | null {
    return this.activeConnectionId;
  }

  /**
   * Get the active client
   */
  getActiveClient(): IDatabaseClient | null {
    if (!this.activeConnectionId) {
      return null;
    }
    return this.clients.get(this.activeConnectionId) || null;
  }

  /**
   * Get a client by connection ID
   */
  getClient(connectionId: string): IDatabaseClient | null {
    return this.clients.get(connectionId) || null;
  }

  /**
   * Check if a connection is active
   */
  isConnected(connectionId: string): boolean {
    const client = this.clients.get(connectionId);
    return client?.status === ConnectionStatus.Connected;
  }

  /**
   * Get connection status
   */
  getConnectionStatus(connectionId: string): ConnectionStatus {
    const client = this.clients.get(connectionId);
    return client?.status ?? ConnectionStatus.Disconnected;
  }

  /**
   * Connect to a database
   */
  async connect(config: ConnectionConfig): Promise<void> {
    // Ensure config has an ID
    const connectionId = config.id || uuidv4();
    const configWithId = { ...config, id: connectionId };

    // Create client if not exists
    let client = this.clients.get(connectionId);
    if (!client) {
      client = this.factory.createClient(configWithId);
      this.clients.set(connectionId, client);
    }

    try {
      await client.connect();
      this.activeConnectionId = connectionId;
      this.emit({ type: 'connected', connectionId });
      this.emit({ type: 'statusChanged', connectionId, status: ConnectionStatus.Connected });
    } catch (error) {
      this.emit({
        type: 'error',
        connectionId,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    }
  }

  /**
   * Disconnect from a database
   */
  async disconnect(connectionId: string): Promise<void> {
    const client = this.clients.get(connectionId);
    if (!client) {
      return;
    }

    try {
      await client.disconnect();
      this.clients.delete(connectionId);

      if (this.activeConnectionId === connectionId) {
        this.activeConnectionId = null;
      }

      this.emit({ type: 'disconnected', connectionId });
      this.emit({ type: 'statusChanged', connectionId, status: ConnectionStatus.Disconnected });
    } catch (error) {
      this.emit({
        type: 'error',
        connectionId,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    }
  }

  /**
   * Disconnect all connections
   */
  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.clients.keys()).map(id =>
      this.disconnect(id).catch(() => {})
    );
    await Promise.all(disconnectPromises);
  }

  /**
   * Test a connection
   */
  async testConnection(config: ConnectionConfig): Promise<boolean> {
    const client = this.factory.createClient(config);
    return client.testConnection();
  }

  /**
   * Set active connection
   */
  setActiveConnection(connectionId: string): void {
    if (this.clients.has(connectionId)) {
      this.activeConnectionId = connectionId;
    }
  }

  /**
   * Get all connected connection IDs
   */
  getConnectedIds(): string[] {
    return Array.from(this.clients.entries())
      .filter(([_, client]) => client.status === ConnectionStatus.Connected)
      .map(([id]) => id);
  }

  /**
   * Subscribe to connection events
   */
  onConnectionEvent(listener: ConnectionEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: ConnectionEvent): void {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    });
  }
}
