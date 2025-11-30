import { ConnectionManager, ConnectionEvent } from '../ConnectionManager';
import { ConnectionConfig, ConnectionStatus, DatabaseType } from '../../../types';

// Mock DatabaseClientFactory
const mockConnect = jest.fn();
const mockDisconnect = jest.fn();
const mockTestConnection = jest.fn();
const mockClient = {
  connect: mockConnect,
  disconnect: mockDisconnect,
  testConnection: mockTestConnection,
  status: ConnectionStatus.Disconnected,
};

jest.mock('../../clients', () => ({
  DatabaseClientFactory: {
    getInstance: jest.fn(() => ({
      createClient: jest.fn(() => mockClient),
    })),
  },
}));

describe('ConnectionManager', () => {
  let manager: ConnectionManager;
  let config: ConnectionConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.status = ConnectionStatus.Disconnected;

    config = {
      id: 'test-connection',
      name: 'Test Connection',
      type: DatabaseType.PostgreSQL,
      host: 'localhost',
      port: 5432,
      database: 'testdb',
      username: 'testuser',
      password: 'testpass',
    };

    manager = new ConnectionManager();
  });

  describe('getActiveConnectionId', () => {
    it('should return null when no connection is active', () => {
      expect(manager.getActiveConnectionId()).toBeNull();
    });
  });

  describe('getActiveClient', () => {
    it('should return null when no connection is active', () => {
      expect(manager.getActiveClient()).toBeNull();
    });
  });

  describe('connect', () => {
    it('should connect successfully and set active connection', async () => {
      mockConnect.mockResolvedValueOnce(undefined);
      mockClient.status = ConnectionStatus.Connected;

      await manager.connect(config);

      expect(mockConnect).toHaveBeenCalled();
      expect(manager.getActiveConnectionId()).toBe(config.id);
    });

    it('should emit connected event', async () => {
      mockConnect.mockResolvedValueOnce(undefined);
      mockClient.status = ConnectionStatus.Connected;

      const listener = jest.fn();
      manager.onConnectionEvent(listener);

      await manager.connect(config);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'connected', connectionId: config.id })
      );
    });

    it('should emit error event on failure', async () => {
      const error = new Error('Connection failed');
      mockConnect.mockRejectedValueOnce(error);

      const listener = jest.fn();
      manager.onConnectionEvent(listener);

      await expect(manager.connect(config)).rejects.toThrow('Connection failed');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', connectionId: config.id })
      );
    });
  });

  describe('disconnect', () => {
    beforeEach(async () => {
      mockConnect.mockResolvedValueOnce(undefined);
      mockClient.status = ConnectionStatus.Connected;
      await manager.connect(config);
    });

    it('should disconnect and clear active connection', async () => {
      mockDisconnect.mockResolvedValueOnce(undefined);

      await manager.disconnect(config.id);

      expect(mockDisconnect).toHaveBeenCalled();
      expect(manager.getActiveConnectionId()).toBeNull();
    });

    it('should emit disconnected event', async () => {
      mockDisconnect.mockResolvedValueOnce(undefined);

      const listener = jest.fn();
      manager.onConnectionEvent(listener);

      await manager.disconnect(config.id);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'disconnected', connectionId: config.id })
      );
    });

    it('should handle disconnect of non-existent connection', async () => {
      await expect(manager.disconnect('non-existent')).resolves.not.toThrow();
    });
  });

  describe('isConnected', () => {
    it('should return false for non-existent connection', () => {
      expect(manager.isConnected('non-existent')).toBe(false);
    });

    it('should return true for connected client', async () => {
      mockConnect.mockResolvedValueOnce(undefined);
      mockClient.status = ConnectionStatus.Connected;

      await manager.connect(config);

      expect(manager.isConnected(config.id)).toBe(true);
    });
  });

  describe('getConnectionStatus', () => {
    it('should return Disconnected for non-existent connection', () => {
      expect(manager.getConnectionStatus('non-existent')).toBe(ConnectionStatus.Disconnected);
    });
  });

  describe('testConnection', () => {
    it('should test connection without storing it', async () => {
      mockTestConnection.mockResolvedValueOnce(true);

      const result = await manager.testConnection(config);

      expect(result).toBe(true);
      expect(manager.getClient(config.id)).toBeNull();
    });
  });

  describe('disconnectAll', () => {
    it('should disconnect all connections', async () => {
      mockConnect.mockResolvedValue(undefined);
      mockDisconnect.mockResolvedValue(undefined);
      mockClient.status = ConnectionStatus.Connected;

      await manager.connect(config);
      await manager.connect({ ...config, id: 'conn-2' });

      await manager.disconnectAll();

      expect(manager.getConnectedIds()).toHaveLength(0);
    });
  });

  describe('setActiveConnection', () => {
    it('should set active connection only if it exists', async () => {
      mockConnect.mockResolvedValueOnce(undefined);
      mockClient.status = ConnectionStatus.Connected;
      await manager.connect(config);

      manager.setActiveConnection(config.id);
      expect(manager.getActiveConnectionId()).toBe(config.id);

      manager.setActiveConnection('non-existent');
      expect(manager.getActiveConnectionId()).toBe(config.id);
    });
  });

  describe('onConnectionEvent', () => {
    it('should return unsubscribe function', async () => {
      const listener = jest.fn();
      const unsubscribe = manager.onConnectionEvent(listener);

      mockConnect.mockResolvedValueOnce(undefined);
      mockClient.status = ConnectionStatus.Connected;
      await manager.connect(config);

      expect(listener).toHaveBeenCalled();

      listener.mockClear();
      unsubscribe();

      mockConnect.mockResolvedValueOnce(undefined);
      await manager.connect({ ...config, id: 'conn-2' });

      expect(listener).not.toHaveBeenCalled();
    });

    it('should handle listener errors gracefully', async () => {
      const badListener = jest.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });
      manager.onConnectionEvent(badListener);

      mockConnect.mockResolvedValueOnce(undefined);
      mockClient.status = ConnectionStatus.Connected;

      // Should not throw despite listener error
      await expect(manager.connect(config)).resolves.not.toThrow();
    });
  });
});
