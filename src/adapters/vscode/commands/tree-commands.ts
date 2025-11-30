import * as vscode from 'vscode';
import { ConnectionManager } from '../../../core/services';
import {
  ConnectionTreeDataProvider,
  DatabaseTreeItem,
  TableTreeItem,
} from '../ConnectionTreeDataProvider';
import { VSCodeConnectionStorage } from '../VSCodeConnectionStorage';
import { TableViewerPanel } from '../TableViewerPanel';
import { ObjectViewerPanel } from '../ObjectViewerPanel';
import { v4 as uuidv4 } from 'uuid';
import { ConnectionConfig, DatabaseType } from '../../../types';
import {
  ViewTreeItem,
  FunctionTreeItem,
  ProcedureTreeItem,
  TriggerTreeItem,
  TypeTreeItem,
  SequenceTreeItem,
} from '../tree-items';

type ObjectTreeItem =
  | ViewTreeItem
  | FunctionTreeItem
  | ProcedureTreeItem
  | TriggerTreeItem
  | TypeTreeItem
  | SequenceTreeItem;

/**
 * Register tree view related commands
 */
export function registerTreeCommands(
  context: vscode.ExtensionContext,
  storage: VSCodeConnectionStorage,
  connectionManager: ConnectionManager,
  treeDataProvider: ConnectionTreeDataProvider
): void {
  registerRefreshCommands(context, treeDataProvider);
  registerViewDataCommand(context, connectionManager);
  registerViewObjectCommand(context, connectionManager);
  registerCreateCategoryCommand(context, storage, treeDataProvider);
  registerConnectToDatabaseCommand(context, storage, connectionManager, treeDataProvider);
}

function registerRefreshCommands(
  context: vscode.ExtensionContext,
  treeDataProvider: ConnectionTreeDataProvider
): void {
  // Refresh all connections
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.refreshConnections', () => {
      treeDataProvider.refresh();
    })
  );

  // Refresh specific item
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.refreshItem', async (item: DatabaseTreeItem) => {
      if (!item) {
        treeDataProvider.refresh();
        return;
      }
      treeDataProvider.clearCacheForItem(item);
      treeDataProvider.refresh(item);
    })
  );
}

function registerViewDataCommand(
  context: vscode.ExtensionContext,
  connectionManager: ConnectionManager
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.viewTableData', async (item: TableTreeItem) => {
      if (!item) return;

      TableViewerPanel.createOrShow(
        context.extensionUri,
        connectionManager,
        item.connectionId,
        item.databaseName,
        item.tableName,
        item.schemaName
      );
    })
  );
}

function registerViewObjectCommand(
  context: vscode.ExtensionContext,
  connectionManager: ConnectionManager
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'qonnect.viewObject',
      async (
        item: ObjectTreeItem,
        objectType: 'view' | 'function' | 'procedure' | 'trigger' | 'type' | 'sequence'
      ) => {
        if (!item) return;

        const data = item.data as Record<string, string>;
        const objectName = extractObjectName(data);

        ObjectViewerPanel.createOrShow(
          context.extensionUri,
          connectionManager,
          data.connectionId,
          data.databaseName,
          objectName,
          objectType,
          data.schemaName
        );
      }
    )
  );
}

function extractObjectName(data: Record<string, string>): string {
  return (
    data.viewName ||
    data.functionName ||
    data.procedureName ||
    data.triggerName ||
    data.typeName ||
    data.sequenceName
  );
}

function registerCreateCategoryCommand(
  context: vscode.ExtensionContext,
  storage: VSCodeConnectionStorage,
  treeDataProvider: ConnectionTreeDataProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.createCategory', async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'Enter category name',
        placeHolder: 'Production Servers',
      });

      if (name) {
        await storage.saveCategory({
          id: uuidv4(),
          name,
        });
        treeDataProvider.refresh();
        vscode.window.showInformationMessage(`Category "${name}" created`);
      }
    })
  );
}

function registerConnectToDatabaseCommand(
  context: vscode.ExtensionContext,
  storage: VSCodeConnectionStorage,
  connectionManager: ConnectionManager,
  treeDataProvider: ConnectionTreeDataProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.connectToDatabase', async (item: DatabaseTreeItem) => {
      if (!item?.data) return;

      const { databaseName, host, port, username, password } = item.data as {
        databaseName: string;
        host: string;
        port: number;
        username: string;
        password: string;
      };

      const newConfig: ConnectionConfig = {
        id: uuidv4(),
        name: `${host}@${port}/${databaseName}`,
        type: DatabaseType.PostgreSQL,
        host,
        port,
        database: databaseName,
        username,
        password,
      };

      try {
        await storage.saveConnection(newConfig);

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Connecting to ${databaseName}...`,
            cancellable: false,
          },
          async () => {
            await connectionManager.connect(newConfig);
          }
        );

        treeDataProvider.refresh();
        vscode.window.showInformationMessage(`Connected to ${databaseName}`);
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to connect to ${databaseName}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );
}
