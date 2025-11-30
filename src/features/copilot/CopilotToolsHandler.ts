import * as vscode from 'vscode';
import { ConnectionManager, DockerService } from '../../core/services';
import { IConnectionStorage } from '../../core/interfaces';
import { DATABASE_TEMPLATES } from '../../types';

/**
 * Handles AI/Copilot tool invocations for database operations
 */
export class CopilotToolsHandler {
  constructor(
    private readonly connectionManager: ConnectionManager,
    private readonly storage: IConnectionStorage,
    private readonly dockerService: DockerService
  ) {}

  /**
   * Register all language model tools
   */
  registerTools(context: vscode.ExtensionContext): void {
    // Register database_query tool
    context.subscriptions.push(
      vscode.lm.registerTool('database_query', {
        invoke: async (options, token) => {
          return this.handleQueryTool(options.input as { connectionId?: string; query: string });
        },
      })
    );

    // Register database_list_tables tool
    context.subscriptions.push(
      vscode.lm.registerTool('database_list_tables', {
        invoke: async (options, token) => {
          return this.handleListTablesTool(options.input as { connectionId?: string });
        },
      })
    );

    // Register database_describe_table tool
    context.subscriptions.push(
      vscode.lm.registerTool('database_describe_table', {
        invoke: async (options, token) => {
          return this.handleDescribeTableTool(
            options.input as { connectionId?: string; tableName: string }
          );
        },
      })
    );

    // Register database_list_connections tool
    context.subscriptions.push(
      vscode.lm.registerTool('database_list_connections', {
        invoke: async (options, token) => {
          return this.handleListConnectionsTool();
        },
      })
    );

    // Register docker_database_start tool
    context.subscriptions.push(
      vscode.lm.registerTool('docker_database_start', {
        invoke: async (options, token) => {
          return this.handleDockerStartTool(
            options.input as {
              databaseType: string;
              containerName?: string;
              port?: number;
              password?: string;
            }
          );
        },
      })
    );

    // Register docker_database_stop tool
    context.subscriptions.push(
      vscode.lm.registerTool('docker_database_stop', {
        invoke: async (options, token) => {
          return this.handleDockerStopTool(options.input as { containerName: string });
        },
      })
    );
  }

  private async handleQueryTool(input: {
    connectionId?: string;
    query: string;
  }): Promise<vscode.LanguageModelToolResult> {
    try {
      const client = this.getClient(input.connectionId);
      const result = await client.executeQuery(input.query);

      if (result.error) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(`Error: ${result.error}`),
        ]);
      }

      const response = {
        columns: result.columns.map(c => c.name),
        rows: result.rows,
        rowCount: result.rowCount,
        affectedRows: result.affectedRows,
        executionTime: result.executionTime,
      };

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify(response, null, 2)),
      ]);
    } catch (error) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `Error: ${error instanceof Error ? error.message : String(error)}`
        ),
      ]);
    }
  }

  private async handleListTablesTool(input: {
    connectionId?: string;
  }): Promise<vscode.LanguageModelToolResult> {
    try {
      const client = this.getClient(input.connectionId);
      const schema = await client.getSchema();

      const tables = schema.tables.map(t => ({
        name: t.name,
        schema: t.schema,
        columns: t.columns.length,
        rowCount: t.rowCount,
      }));

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          JSON.stringify(
            {
              schemaName: schema.name,
              tables,
            },
            null,
            2
          )
        ),
      ]);
    } catch (error) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `Error: ${error instanceof Error ? error.message : String(error)}`
        ),
      ]);
    }
  }

  private async handleDescribeTableTool(input: {
    connectionId?: string;
    tableName: string;
    databaseName?: string;
  }): Promise<vscode.LanguageModelToolResult> {
    try {
      const client = this.getClient(input.connectionId);
      const databaseName = input.databaseName || client.config.database;
      const tableInfo = await client.getTableInfo(databaseName, input.tableName);

      const response = {
        name: tableInfo.name,
        schema: tableInfo.schema,
        rowCount: tableInfo.rowCount,
        columns: tableInfo.columns.map(c => ({
          name: c.name,
          type: c.type,
          nullable: c.nullable,
          isPrimaryKey: c.isPrimaryKey,
          isForeignKey: c.isForeignKey,
          defaultValue: c.defaultValue,
          foreignKeyReference: c.foreignKeyReference,
        })),
        indexes: tableInfo.indexes.map(i => ({
          name: i.name,
          columns: i.columns,
          unique: i.unique,
          type: i.type,
        })),
      };

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify(response, null, 2)),
      ]);
    } catch (error) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `Error: ${error instanceof Error ? error.message : String(error)}`
        ),
      ]);
    }
  }

  private async handleListConnectionsTool(): Promise<vscode.LanguageModelToolResult> {
    try {
      const connections = await this.storage.getConnections();

      const connectionList = connections.map(conn => ({
        id: conn.id,
        name: conn.name,
        type: conn.type,
        host: conn.host,
        port: conn.port,
        database: conn.database,
        isConnected: this.connectionManager.isConnected(conn.id),
      }));

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify({ connections: connectionList }, null, 2)),
      ]);
    } catch (error) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `Error: ${error instanceof Error ? error.message : String(error)}`
        ),
      ]);
    }
  }

  private async handleDockerStartTool(input: {
    databaseType: string;
    containerName?: string;
    port?: number;
    password?: string;
  }): Promise<vscode.LanguageModelToolResult> {
    try {
      const isAvailable = await this.dockerService.isDockerAvailable();
      if (!isAvailable) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(
            'Error: Docker is not available. Please ensure Docker is installed and running.'
          ),
        ]);
      }

      const template = DATABASE_TEMPLATES.find(t => t.type === input.databaseType);
      if (!template) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(
            `Error: Unknown database type: ${input.databaseType}. Supported types: postgresql, mysql, mongodb, redis`
          ),
        ]);
      }

      const containerName = input.containerName || `dbclient-${input.databaseType}`;
      const port = input.port || template.defaultPort;
      const password = input.password || 'password123';

      // Check if container already exists
      const existingStatus = await this.dockerService.getContainerStatus(containerName);

      if (existingStatus !== 'not-found') {
        // Container exists, just start it
        await this.dockerService.startContainer(containerName);
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(
            JSON.stringify(
              {
                success: true,
                message: `Started existing container: ${containerName}`,
                containerName,
                port,
                databaseType: input.databaseType,
              },
              null,
              2
            )
          ),
        ]);
      }

      // Build environment variables
      const environment: Record<string, string> = {};
      for (const envVar of template.environmentVariables) {
        if (envVar.name.includes('PASSWORD')) {
          environment[envVar.name] = password;
        } else if (envVar.default) {
          environment[envVar.name] = envVar.default;
        }
      }

      // Create and start container
      const containerId = await this.dockerService.createContainer({
        name: containerName,
        image: template.image,
        ports: [{ hostPort: port, containerPort: template.defaultPort }],
        environment,
      });

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          JSON.stringify(
            {
              success: true,
              message: `Created and started ${template.name} container`,
              containerId,
              containerName,
              port,
              databaseType: input.databaseType,
              image: template.image,
              connectionInfo: {
                host: 'localhost',
                port,
                username: environment['POSTGRES_USER'] || environment['MYSQL_USER'] || 'root',
                password,
              },
            },
            null,
            2
          )
        ),
      ]);
    } catch (error) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `Error: ${error instanceof Error ? error.message : String(error)}`
        ),
      ]);
    }
  }

  private async handleDockerStopTool(input: {
    containerName: string;
  }): Promise<vscode.LanguageModelToolResult> {
    try {
      const isAvailable = await this.dockerService.isDockerAvailable();
      if (!isAvailable) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart('Error: Docker is not available.'),
        ]);
      }

      await this.dockerService.stopContainer(input.containerName);

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          JSON.stringify(
            {
              success: true,
              message: `Stopped container: ${input.containerName}`,
            },
            null,
            2
          )
        ),
      ]);
    } catch (error) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `Error: ${error instanceof Error ? error.message : String(error)}`
        ),
      ]);
    }
  }

  private getClient(connectionId?: string) {
    const client = connectionId
      ? this.connectionManager.getClient(connectionId)
      : this.connectionManager.getActiveClient();

    if (!client) {
      throw new Error('No database connection available. Please connect to a database first.');
    }

    return client;
  }
}
