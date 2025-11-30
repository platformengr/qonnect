import * as vscode from 'vscode';
import { ConnectionManager } from '../../../core/services';
import {
  ConnectionTreeDataProvider,
  DatabaseTreeItem,
  ConnectionTreeItem,
} from '../ConnectionTreeDataProvider';
import { VSCodeConnectionStorage } from '../VSCodeConnectionStorage';
import { SqlQueryManager } from '../SqlQueryManager';
import { ConnectionConfig } from '../../../types';

/**
 * Register query-related commands
 */
export function registerQueryCommands(
  context: vscode.ExtensionContext,
  storage: VSCodeConnectionStorage,
  connectionManager: ConnectionManager,
  treeDataProvider: ConnectionTreeDataProvider
): void {
  registerNewQueryCommand(context, storage, connectionManager, treeDataProvider);
  registerOpenSavedQueryCommand(context, storage, connectionManager, treeDataProvider);
  registerDeleteSavedQueryCommand(context, storage, treeDataProvider);
  registerRunQueryCommand(context, connectionManager);
  registerExecuteQueryCommand(context);
  registerSelectConnectionCommand(context);
  registerSelectDatabaseCommand(context);
  registerNewSqlFileCommand(context);
}

function registerNewQueryCommand(
  context: vscode.ExtensionContext,
  storage: VSCodeConnectionStorage,
  connectionManager: ConnectionManager,
  treeDataProvider: ConnectionTreeDataProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'qonnect.newQuery',
      async (item: ConnectionTreeItem | DatabaseTreeItem) => {
        const { connectionId, database } = await extractConnectionInfo(item, storage);
        if (!connectionId) return;

        const conn = await storage.getConnection(connectionId);
        if (!conn) return;

        await ensureConnected(connectionId, conn, connectionManager, treeDataProvider);
        await setQueryManagerConnection(connectionId, database);
        await openNewSqlDocument(conn.name, database || conn.database);
      }
    )
  );
}

async function extractConnectionInfo(
  item: ConnectionTreeItem | DatabaseTreeItem,
  storage: VSCodeConnectionStorage
): Promise<{ connectionId: string | undefined; database: string | undefined }> {
  if ('config' in item && item.config) {
    return {
      connectionId: item.config.id,
      database: item.config.database,
    };
  }

  if ('data' in item && item.data) {
    const data = item.data as Record<string, string>;
    const connectionId = data.connectionId;
    const conn = await storage.getConnection(connectionId);
    return {
      connectionId,
      database: conn?.database,
    };
  }

  return { connectionId: undefined, database: undefined };
}

async function ensureConnected(
  connectionId: string,
  conn: ConnectionConfig,
  connectionManager: ConnectionManager,
  treeDataProvider: ConnectionTreeDataProvider
): Promise<void> {
  if (!connectionManager.isConnected(connectionId)) {
    await connectionManager.connect(conn);
    treeDataProvider.refresh();
  }
}

async function setQueryManagerConnection(
  connectionId: string,
  database: string | undefined
): Promise<void> {
  const manager = SqlQueryManager.getInstance();
  if (manager) {
    await manager.setConnection(connectionId, database);
  }
}

async function openNewSqlDocument(connName: string, database: string | undefined): Promise<void> {
  const doc = await vscode.workspace.openTextDocument({
    language: 'sql',
    content: `-- Query for ${connName}\n-- Database: ${database}\n\n`,
  });
  await vscode.window.showTextDocument(doc);
}

function registerOpenSavedQueryCommand(
  context: vscode.ExtensionContext,
  storage: VSCodeConnectionStorage,
  connectionManager: ConnectionManager,
  treeDataProvider: ConnectionTreeDataProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.openSavedQuery', async (item: DatabaseTreeItem) => {
      if (!item?.data) return;

      const data = item.data as {
        connectionId: string;
        query: string;
        name?: string;
        empty?: boolean;
      };
      if (data.empty) return;

      const conn = await storage.getConnection(data.connectionId);
      if (!conn) return;

      await ensureConnected(data.connectionId, conn, connectionManager, treeDataProvider);
      await setQueryManagerConnection(data.connectionId, conn.database);

      const doc = await vscode.workspace.openTextDocument({
        language: 'sql',
        content: data.query,
      });
      await vscode.window.showTextDocument(doc);
    })
  );
}

function registerDeleteSavedQueryCommand(
  context: vscode.ExtensionContext,
  storage: VSCodeConnectionStorage,
  treeDataProvider: ConnectionTreeDataProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.deleteSavedQuery', async (item: DatabaseTreeItem) => {
      if (!item?.data) return;

      const data = item.data as { queryId: string; empty?: boolean };
      if (data.empty) return;

      const confirm = await vscode.window.showWarningMessage(
        `Delete saved query "${item.label}"?`,
        { modal: true },
        'Delete'
      );

      if (confirm === 'Delete') {
        await storage.deleteQuery(data.queryId);
        treeDataProvider.refresh();
        vscode.window.showInformationMessage('Query deleted');
      }
    })
  );
}

function registerRunQueryCommand(
  context: vscode.ExtensionContext,
  connectionManager: ConnectionManager
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.runQuery', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const query = editor.document.getText(editor.selection) || editor.document.getText();
      const client = connectionManager.getActiveClient();

      if (!client) {
        vscode.window.showWarningMessage('No active database connection');
        return;
      }

      try {
        const result = await client.executeQuery(query);
        if (result.error) {
          vscode.window.showErrorMessage(`Query error: ${result.error}`);
        } else {
          vscode.window.showInformationMessage(
            `Query executed: ${result.rowCount} rows, ${result.executionTime}ms`
          );
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Query failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );
}

function registerExecuteQueryCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.executeQuery', async () => {
      const manager = SqlQueryManager.getInstance();
      if (manager) {
        await manager.executeQuery();
      }
    })
  );
}

function registerSelectConnectionCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.selectConnection', async () => {
      const manager = SqlQueryManager.getInstance();
      if (manager) {
        await manager.selectConnection();
      }
    })
  );
}

function registerSelectDatabaseCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.selectDatabase', async () => {
      const manager = SqlQueryManager.getInstance();
      if (manager) {
        await manager.selectDatabase();
      }
    })
  );
}

function registerNewSqlFileCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.newSqlFile', async () => {
      const doc = await vscode.workspace.openTextDocument({
        language: 'sql',
        content: '-- New SQL Query\n\n',
      });
      await vscode.window.showTextDocument(doc);
    })
  );
}
