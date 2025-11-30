import { IDatabaseClient, IDatabaseClientFactory } from '../interfaces';
import { ConnectionConfig, DatabaseType } from '../../types';
import { PostgreSQLClient } from './PostgreSQLClient';

/**
 * Factory for creating database clients
 */
export class DatabaseClientFactory implements IDatabaseClientFactory {
  private static instance: DatabaseClientFactory;

  private constructor() {}

  static getInstance(): DatabaseClientFactory {
    if (!DatabaseClientFactory.instance) {
      DatabaseClientFactory.instance = new DatabaseClientFactory();
    }
    return DatabaseClientFactory.instance;
  }

  createClient(config: ConnectionConfig): IDatabaseClient {
    switch (config.type) {
      case DatabaseType.PostgreSQL:
        return new PostgreSQLClient(config);
      // Future implementations:
      // case DatabaseType.MySQL:
      //   return new MySQLClient(config);
      // case DatabaseType.MongoDB:
      //   return new MongoDBClient(config);
      default:
        throw new Error(`Unsupported database type: ${config.type}`);
    }
  }

  supports(type: string): boolean {
    const supportedTypes = [DatabaseType.PostgreSQL];
    return supportedTypes.includes(type as DatabaseType);
  }

  getSupportedTypes(): DatabaseType[] {
    return [DatabaseType.PostgreSQL];
  }
}
