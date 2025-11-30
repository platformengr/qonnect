import * as vscode from 'vscode';
import { ConnectionManager, DockerService } from './core/services';
import {
  VSCodeConnectionStorage,
  ConnectionTreeDataProvider,
  SqlQueryManager,
} from './adapters/vscode';
import { CopilotToolsHandler } from './features/copilot';
import {
  registerConnectionCommands,
  registerQueryCommands,
  registerDatabaseOperationCommands,
  registerDockerCommands,
  registerTreeCommands,
} from './adapters/vscode/commands';

// ============================================================================
// Module-level state
// ============================================================================

let connectionManager: ConnectionManager;
let treeDataProvider: ConnectionTreeDataProvider;
let sqlQueryManager: SqlQueryManager;

// ============================================================================
// Extension Lifecycle
// ============================================================================

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext): void {
  console.log('Qonnect is now active!');

  const { storage, dockerService } = initializeServices(context);
  initializeTreeView(context, storage);
  initializeCopilotTools(context, storage, dockerService);
  registerAllCommands(context, storage, dockerService);
}

/**
 * Extension deactivation
 */
export async function deactivate(): Promise<void> {
  if (connectionManager) {
    await connectionManager.disconnectAll();
  }
}

// ============================================================================
// Initialization
// ============================================================================

interface InitializedServices {
  storage: VSCodeConnectionStorage;
  dockerService: DockerService;
}

function initializeServices(context: vscode.ExtensionContext): InitializedServices {
  const storage = new VSCodeConnectionStorage(context);
  connectionManager = new ConnectionManager();
  const dockerService = DockerService.getInstance();

  // Initialize SQL Query Manager for native editor support
  sqlQueryManager = SqlQueryManager.initialize(connectionManager, storage);
  context.subscriptions.push({ dispose: () => sqlQueryManager.dispose() });

  return { storage, dockerService };
}

function initializeTreeView(
  context: vscode.ExtensionContext,
  storage: VSCodeConnectionStorage
): void {
  treeDataProvider = new ConnectionTreeDataProvider(storage, connectionManager);

  const treeView = vscode.window.createTreeView('databaseConnections', {
    treeDataProvider,
    showCollapseAll: true,
  });

  context.subscriptions.push(treeView);
}

function initializeCopilotTools(
  context: vscode.ExtensionContext,
  storage: VSCodeConnectionStorage,
  dockerService: DockerService
): void {
  const copilotHandler = new CopilotToolsHandler(connectionManager, storage, dockerService);
  copilotHandler.registerTools(context);
}

// ============================================================================
// Command Registration
// ============================================================================

function registerAllCommands(
  context: vscode.ExtensionContext,
  storage: VSCodeConnectionStorage,
  dockerService: DockerService
): void {
  registerConnectionCommands(context, storage, connectionManager, treeDataProvider);
  registerQueryCommands(context, storage, connectionManager, treeDataProvider);
  registerDatabaseOperationCommands(context, connectionManager, treeDataProvider);
  registerDockerCommands(context, dockerService);
  registerTreeCommands(context, storage, connectionManager, treeDataProvider);
}
