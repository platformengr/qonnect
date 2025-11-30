import * as vscode from 'vscode';
import { ConnectionManager } from '../../../core/services';
import { ConnectionTreeDataProvider, ConnectionTreeItem } from '../ConnectionTreeDataProvider';
import { VSCodeConnectionStorage } from '../VSCodeConnectionStorage';
import { ConnectionFormPanel } from '../ConnectionFormPanel';

/**
 * Register connection-related commands
 */
export function registerConnectionCommands(
  context: vscode.ExtensionContext,
  storage: VSCodeConnectionStorage,
  connectionManager: ConnectionManager,
  treeDataProvider: ConnectionTreeDataProvider
): void {
  registerAddConnectionCommand(context, storage, connectionManager, treeDataProvider);
  registerEditConnectionCommand(context, storage, connectionManager, treeDataProvider);
  registerDeleteConnectionCommand(context, storage, connectionManager, treeDataProvider);
  registerConnectCommand(context, connectionManager, treeDataProvider);
  registerDisconnectCommand(context, connectionManager, treeDataProvider);
}

function registerAddConnectionCommand(
  context: vscode.ExtensionContext,
  storage: VSCodeConnectionStorage,
  connectionManager: ConnectionManager,
  treeDataProvider: ConnectionTreeDataProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.addConnection', () => {
      const panel = ConnectionFormPanel.createOrShow(
        context.extensionUri,
        storage,
        connectionManager
      );
      panel.onSave(() => treeDataProvider.refresh());
    })
  );
}

function registerEditConnectionCommand(
  context: vscode.ExtensionContext,
  storage: VSCodeConnectionStorage,
  connectionManager: ConnectionManager,
  treeDataProvider: ConnectionTreeDataProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.editConnection', async (item: ConnectionTreeItem) => {
      if (!item?.config) return;

      const panel = ConnectionFormPanel.createOrShow(
        context.extensionUri,
        storage,
        connectionManager,
        item.config
      );
      panel.onSave(() => treeDataProvider.refresh());
    })
  );
}

function registerDeleteConnectionCommand(
  context: vscode.ExtensionContext,
  storage: VSCodeConnectionStorage,
  connectionManager: ConnectionManager,
  treeDataProvider: ConnectionTreeDataProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'qonnect.deleteConnection',
      async (item: ConnectionTreeItem) => {
        if (!item?.config) return;

        const confirm = await vscode.window.showWarningMessage(
          `Delete connection "${item.config.name}"?`,
          { modal: true },
          'Delete'
        );

        if (confirm === 'Delete') {
          await connectionManager.disconnect(item.config.id);
          await storage.deleteConnection(item.config.id);
          treeDataProvider.refresh();
          vscode.window.showInformationMessage(`Connection "${item.config.name}" deleted.`);
        }
      }
    )
  );
}

function registerConnectCommand(
  context: vscode.ExtensionContext,
  connectionManager: ConnectionManager,
  treeDataProvider: ConnectionTreeDataProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.connect', async (item: ConnectionTreeItem) => {
      if (!item?.config) return;

      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Connecting to ${item.config.name}...`,
            cancellable: false,
          },
          async () => {
            await connectionManager.connect(item.config);
          }
        );

        treeDataProvider.refresh();
        vscode.window.showInformationMessage(`Connected to ${item.config.name}`);
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to connect: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );
}

function registerDisconnectCommand(
  context: vscode.ExtensionContext,
  connectionManager: ConnectionManager,
  treeDataProvider: ConnectionTreeDataProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.disconnect', async (item: ConnectionTreeItem) => {
      if (!item?.config) return;

      try {
        await connectionManager.disconnect(item.config.id);
        treeDataProvider.refresh();
        vscode.window.showInformationMessage(`Disconnected from ${item.config.name}`);
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to disconnect: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );
}
