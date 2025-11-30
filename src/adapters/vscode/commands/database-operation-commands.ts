import * as vscode from 'vscode';
import { ConnectionManager } from '../../../core/services';
import {
  ConnectionTreeDataProvider,
  ConnectionTreeItem,
  CategoryTreeItem,
  TableTreeItem,
  DatabaseTreeItem,
  ViewTreeItem,
  FunctionTreeItem,
  SequenceTreeItem,
  TriggerTreeItem,
} from '../ConnectionTreeDataProvider';
import { DatabaseOperationsPanel, DatabaseOperation } from '../DatabaseOperationsPanel';

/**
 * Connection info extracted from tree items
 */
interface ConnectionInfo {
  connectionId: string;
  databaseName: string;
  schema: string;
  tableName?: string;
}

/**
 * Register database operation commands
 */
export function registerDatabaseOperationCommands(
  context: vscode.ExtensionContext,
  connectionManager: ConnectionManager,
  treeDataProvider: ConnectionTreeDataProvider
): void {
  const showPanel = createPanelFactory(context, connectionManager, treeDataProvider);

  registerCreateCommands(context, showPanel);
  registerDropCommands(context, connectionManager, treeDataProvider, showPanel);
  registerTableOperationCommands(context, showPanel);
  registerQuickPickCommand(context, showPanel);
}

type ShowPanelFn = (
  connectionId: string,
  databaseName: string,
  operation: DatabaseOperation,
  schema: string
) => void;

function createPanelFactory(
  context: vscode.ExtensionContext,
  connectionManager: ConnectionManager,
  treeDataProvider: ConnectionTreeDataProvider
): ShowPanelFn {
  return (connectionId, databaseName, operation, schema) => {
    const panel = DatabaseOperationsPanel.createOrShow(
      context.extensionUri,
      connectionManager,
      connectionId,
      databaseName,
      operation,
      schema
    );
    panel.onSuccess(() => treeDataProvider.refresh());
  };
}

function registerCreateCommands(context: vscode.ExtensionContext, showPanel: ShowPanelFn): void {
  // Create Table
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'qonnect.createTable',
      async (item: CategoryTreeItem | TableTreeItem) => {
        const connInfo = getConnectionInfo(item);
        if (!connInfo) return;
        showPanel(connInfo.connectionId, connInfo.databaseName, 'createTable', connInfo.schema);
      }
    )
  );

  // Create View
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.createView', async (item: CategoryTreeItem) => {
      const connInfo = getConnectionInfo(item);
      if (!connInfo) return;
      showPanel(connInfo.connectionId, connInfo.databaseName, 'createView', connInfo.schema);
    })
  );

  // Create Index
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.createIndex', async (item: TableTreeItem) => {
      const connInfo = getConnectionInfo(item);
      if (!connInfo) return;
      showPanel(connInfo.connectionId, connInfo.databaseName, 'createIndex', connInfo.schema);
    })
  );

  // Create User/Role
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'qonnect.createUser',
      async (item: ConnectionTreeItem | DatabaseTreeItem) => {
        const connInfo = getConnectionInfoFromItem(item);
        if (!connInfo) return;
        showPanel(
          connInfo.connectionId,
          connInfo.databaseName || 'postgres',
          'createUser',
          'public'
        );
      }
    )
  );

  // Create Schema
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'qonnect.createSchema',
      async (item: ConnectionTreeItem | DatabaseTreeItem) => {
        const connInfo = getConnectionInfo(item);
        if (!connInfo) return;
        showPanel(
          connInfo.connectionId,
          connInfo.databaseName || 'postgres',
          'createSchema',
          'public'
        );
      }
    )
  );

  // Create Sequence
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.createSequence', async (item: CategoryTreeItem) => {
      const connInfo = getConnectionInfo(item);
      if (!connInfo) return;
      showPanel(connInfo.connectionId, connInfo.databaseName, 'createSequence', connInfo.schema);
    })
  );

  // Create Function
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.createFunction', async (item: CategoryTreeItem) => {
      const connInfo = getConnectionInfo(item);
      if (!connInfo) return;
      showPanel(connInfo.connectionId, connInfo.databaseName, 'createFunction', connInfo.schema);
    })
  );

  // Create Procedure (uses function panel for PostgreSQL)
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.createProcedure', async (item: DatabaseTreeItem) => {
      const connInfo = getConnectionInfo(item);
      if (!connInfo) return;
      showPanel(connInfo.connectionId, connInfo.databaseName, 'createFunction', connInfo.schema);
    })
  );

  // Create Type (shows info message)
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.createType', async () => {
      vscode.window.showInformationMessage(
        'Use Query Editor to create custom types with CREATE TYPE statement'
      );
    })
  );

  // Create Trigger (shows info message)
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.createTrigger', async () => {
      vscode.window.showInformationMessage(
        'Use Query Editor to create triggers with CREATE TRIGGER statement'
      );
    })
  );

  // Add Column
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.addColumn', async (item: DatabaseTreeItem) => {
      const connInfo = getConnectionInfo(item);
      if (!connInfo) return;
      showPanel(connInfo.connectionId, connInfo.databaseName, 'alterTable', connInfo.schema);
    })
  );
}

function registerDropCommands(
  context: vscode.ExtensionContext,
  connectionManager: ConnectionManager,
  treeDataProvider: ConnectionTreeDataProvider,
  showPanel: ShowPanelFn
): void {
  // Drop View
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.dropView', async (item: ViewTreeItem) => {
      if (!item?.data) return;
      const data = item.data as Record<string, string>;

      const confirm = await confirmDrop('view', data.viewName);
      if (confirm) {
        showPanel(data.connectionId, data.databaseName, 'dropView', data.schemaName);
      }
    })
  );

  // Drop Function
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.dropFunction', async (item: FunctionTreeItem) => {
      if (!item?.data) return;
      const data = item.data as Record<string, string>;

      const confirm = await confirmDrop('function', data.functionName);
      if (confirm) {
        await executeDropQuery(
          connectionManager,
          data.connectionId,
          `DROP FUNCTION IF EXISTS "${data.schemaName}"."${data.functionName}" CASCADE`,
          'Function',
          data.functionName,
          treeDataProvider
        );
      }
    })
  );

  // Drop Sequence
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.dropSequence', async (item: SequenceTreeItem) => {
      if (!item?.data) return;
      const data = item.data as Record<string, string>;

      const confirm = await confirmDrop('sequence', data.sequenceName);
      if (confirm) {
        await executeDropQuery(
          connectionManager,
          data.connectionId,
          `DROP SEQUENCE IF EXISTS "${data.schemaName}"."${data.sequenceName}" CASCADE`,
          'Sequence',
          data.sequenceName,
          treeDataProvider
        );
      }
    })
  );

  // Drop Index
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.dropIndex', async (item: DatabaseTreeItem) => {
      if (!item?.data) return;
      const data = item.data as { index: { name: string } };
      const indexName = data.index?.name;
      if (!indexName) return;

      const confirm = await confirmDrop('index', indexName);
      if (confirm) {
        vscode.window.showInformationMessage(
          `Use Query Editor to drop index: DROP INDEX "${indexName}"`
        );
      }
    })
  );

  // Drop Column
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.dropColumn', async (item: DatabaseTreeItem) => {
      if (!item?.data) return;
      const data = item.data as { column: { name: string } };
      const columnName = data.column?.name;
      if (!columnName) return;

      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to drop column "${columnName}"? This cannot be undone!`,
        { modal: true },
        'Drop Column'
      );

      if (confirm === 'Drop Column') {
        vscode.window.showInformationMessage('Use Alter Table to drop this column');
      }
    })
  );

  // Drop Trigger
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.dropTrigger', async (item: TriggerTreeItem) => {
      if (!item?.data) return;
      const data = item.data as Record<string, string>;

      const confirm = await confirmDrop('trigger', data.triggerName);
      if (confirm) {
        await executeDropQuery(
          connectionManager,
          data.connectionId,
          `DROP TRIGGER IF EXISTS "${data.triggerName}" ON "${data.schemaName}"."${data.tableName}"`,
          'Trigger',
          data.triggerName,
          treeDataProvider
        );
      }
    })
  );

  // Drop User/Role
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.dropUser', async (item: DatabaseTreeItem) => {
      if (!item?.data) return;
      const data = item.data as { role: { name: string } };
      const roleName = data.role?.name;
      if (!roleName) return;

      const confirm = await confirmDrop('user/role', roleName);
      if (confirm) {
        vscode.window.showInformationMessage(
          `Use Query Editor to drop role: DROP ROLE "${roleName}"`
        );
      }
    })
  );
}

function registerTableOperationCommands(
  context: vscode.ExtensionContext,
  showPanel: ShowPanelFn
): void {
  // Drop Table
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.dropTable', async (item: TableTreeItem) => {
      if (!item) return;
      showPanel(item.connectionId, item.databaseName, 'dropTable', item.schemaName);
    })
  );

  // Truncate Table
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.truncateTable', async (item: TableTreeItem) => {
      if (!item) return;
      showPanel(item.connectionId, item.databaseName, 'truncateTable', item.schemaName);
    })
  );

  // Alter Table
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.alterTable', async (item: TableTreeItem) => {
      if (!item) return;
      showPanel(item.connectionId, item.databaseName, 'alterTable', item.schemaName);
    })
  );
}

function registerQuickPickCommand(context: vscode.ExtensionContext, showPanel: ShowPanelFn): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'qonnect.databaseOperations',
      async (item: ConnectionTreeItem | CategoryTreeItem | TableTreeItem) => {
        const operations = [
          { label: '$(add) Create Table', value: 'createTable' },
          { label: '$(eye) Create View', value: 'createView' },
          { label: '$(list-tree) Create Index', value: 'createIndex' },
          { label: '$(person-add) Create User/Role', value: 'createUser' },
          { label: '$(folder-library) Create Schema', value: 'createSchema' },
          { label: '$(symbol-number) Create Sequence', value: 'createSequence' },
          { label: '$(symbol-method) Create Function', value: 'createFunction' },
          { label: '$(trash) Drop Table', value: 'dropTable' },
          { label: '$(eye-closed) Drop View', value: 'dropView' },
          { label: '$(warning) Truncate Table', value: 'truncateTable' },
          { label: '$(edit) Alter Table', value: 'alterTable' },
        ];

        const selected = await vscode.window.showQuickPick(operations, {
          placeHolder: 'Select database operation',
        });

        if (!selected) return;

        const connInfo = getConnectionInfo(item);
        if (!connInfo) {
          vscode.window.showErrorMessage('Could not determine connection info');
          return;
        }

        showPanel(
          connInfo.connectionId,
          connInfo.databaseName,
          selected.value as DatabaseOperation,
          connInfo.schema
        );
      }
    )
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

async function confirmDrop(objectType: string, objectName: string): Promise<boolean> {
  const capitalizedType = objectType.charAt(0).toUpperCase() + objectType.slice(1);
  const confirm = await vscode.window.showWarningMessage(
    `Are you sure you want to drop ${objectType} "${objectName}"?`,
    { modal: true },
    `Drop ${capitalizedType}`
  );
  return confirm === `Drop ${capitalizedType}`;
}

async function executeDropQuery(
  connectionManager: ConnectionManager,
  connectionId: string,
  query: string,
  objectType: string,
  objectName: string,
  treeDataProvider: ConnectionTreeDataProvider
): Promise<void> {
  try {
    const client = connectionManager.getClient(connectionId);
    if (client) {
      await client.executeQuery(query);
      vscode.window.showInformationMessage(`${objectType} "${objectName}" dropped successfully`);
      treeDataProvider.refresh();
    }
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to drop ${objectType.toLowerCase()}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function getConnectionInfo(
  item: ConnectionTreeItem | CategoryTreeItem | TableTreeItem | DatabaseTreeItem | undefined
): ConnectionInfo | null {
  if (!item) return null;

  if ('config' in item && item.config) {
    return {
      connectionId: item.config.id,
      databaseName: item.config.database,
      schema: 'public',
    };
  }

  if ('connectionId' in item && 'databaseName' in item) {
    return {
      connectionId: item.connectionId,
      databaseName: item.databaseName,
      schema: (item as TableTreeItem).schemaName || 'public',
      tableName: (item as TableTreeItem).tableName,
    };
  }

  if ('data' in item && item.data) {
    const data = item.data as Record<string, string>;
    return {
      connectionId: data.connectionId,
      databaseName: data.databaseName,
      schema: data.schemaName || 'public',
      tableName: data.tableName,
    };
  }

  return null;
}

function getConnectionInfoFromItem(
  item: ConnectionTreeItem | DatabaseTreeItem
): ConnectionInfo | null {
  // First try standard extraction
  const connInfo = getConnectionInfo(item);
  if (connInfo) return connInfo;

  // Try to get from data if it's a security-folder
  if ('data' in item && item.data) {
    const data = item.data as Record<string, string>;
    const connectionId = data.connectionId;
    if (connectionId) {
      return {
        connectionId,
        databaseName: 'postgres',
        schema: 'public',
      };
    }
  }

  return null;
}
