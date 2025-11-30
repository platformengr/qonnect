import * as vscode from 'vscode';
import { ConnectionManager } from '../../core/services';
import { IConnectionStorage } from '../../core/interfaces';
import { QueryResultsPanel } from './QueryResultsPanel';

/**
 * Manages SQL query execution from VS Code's native editor
 * This allows Copilot and other VS Code features to work with SQL
 */
export class SqlQueryManager {
  private static instance: SqlQueryManager | undefined;
  private currentConnectionId: string | undefined;
  private currentDatabase: string | undefined;
  private statusBarItem: vscode.StatusBarItem;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly connectionManager: ConnectionManager,
    private readonly storage: IConnectionStorage
  ) {
    // Create status bar item for showing current connection
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusBarItem.command = 'qonnect.selectConnection';
    this.updateStatusBar();
    this.statusBarItem.show();

    // Listen for active editor changes to show/hide status bar
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor?.document.languageId === 'sql') {
          this.statusBarItem.show();
        } else {
          this.statusBarItem.hide();
        }
      })
    );
  }

  public static initialize(
    connectionManager: ConnectionManager,
    storage: IConnectionStorage
  ): SqlQueryManager {
    if (!SqlQueryManager.instance) {
      SqlQueryManager.instance = new SqlQueryManager(connectionManager, storage);
    }
    return SqlQueryManager.instance;
  }

  public static getInstance(): SqlQueryManager | undefined {
    return SqlQueryManager.instance;
  }

  public getCurrentConnectionId(): string | undefined {
    return this.currentConnectionId;
  }

  public getCurrentDatabase(): string | undefined {
    return this.currentDatabase;
  }

  public async setConnection(connectionId: string, database?: string): Promise<void> {
    const conn = await this.storage.getConnection(connectionId);
    if (!conn) {
      vscode.window.showErrorMessage('Connection not found');
      return;
    }

    // Connect if not already connected
    if (!this.connectionManager.isConnected(connectionId)) {
      try {
        await this.connectionManager.connect(conn);
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to connect: ${error instanceof Error ? error.message : String(error)}`
        );
        return;
      }
    }

    this.currentConnectionId = connectionId;
    this.currentDatabase = database || conn.database;
    this.updateStatusBar();
  }

  public async selectConnection(): Promise<void> {
    const connections = await this.storage.getConnections();

    if (connections.length === 0) {
      vscode.window.showWarningMessage('No connections configured. Add a connection first.');
      return;
    }

    const items = connections.map(conn => ({
      label:
        (this.connectionManager.isConnected(conn.id) ? '$(database) ' : '$(plug) ') + conn.name,
      description: this.connectionManager.isConnected(conn.id) ? 'Connected' : 'Disconnected',
      detail: `${conn.host}:${conn.port}/${conn.database}`,
      connectionId: conn.id,
      database: conn.database,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a database connection',
      title: 'Database Connection',
    });

    if (selected) {
      await this.setConnection(selected.connectionId, selected.database);

      // Now ask for database
      await this.selectDatabase();
    }
  }

  public async selectDatabase(): Promise<void> {
    if (!this.currentConnectionId) {
      await this.selectConnection();
      return;
    }

    const client = this.connectionManager.getClient(this.currentConnectionId);
    if (!client) {
      vscode.window.showErrorMessage('Not connected to database');
      return;
    }

    try {
      // Get list of databases
      const result = await client.executeQuery(
        'SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname'
      );

      const databases = result.rows.map(r => r.datname as string);

      const selected = await vscode.window.showQuickPick(databases, {
        placeHolder: 'Select a database',
        title: 'Select Database',
      });

      if (selected) {
        this.currentDatabase = selected;
        this.updateStatusBar();
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to get databases: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  public async executeQuery(query?: string): Promise<void> {
    // Get query from selection or entire document
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor');
      return;
    }

    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);
    const queryText = query || (selectedText.trim() ? selectedText : editor.document.getText());

    if (!queryText.trim()) {
      vscode.window.showWarningMessage('No query to execute');
      return;
    }

    // Ensure we have a connection
    if (!this.currentConnectionId) {
      await this.selectConnection();
      if (!this.currentConnectionId) {
        return;
      }
    }

    const client = this.connectionManager.getClient(this.currentConnectionId);
    if (!client) {
      vscode.window.showErrorMessage('Not connected to database. Please select a connection.');
      return;
    }

    // Show results panel
    const resultsPanel = QueryResultsPanel.createOrShow();
    resultsPanel.showLoading();

    try {
      let result;
      if (this.currentDatabase) {
        result = await client.executeQueryOnDatabase(this.currentDatabase, queryText);
      } else {
        result = await client.executeQuery(queryText);
      }
      resultsPanel.showResults(result);
    } catch (error) {
      resultsPanel.showError(error instanceof Error ? error.message : String(error));
    }
  }

  private async updateStatusBar(): Promise<void> {
    if (this.currentConnectionId) {
      const conn = await this.storage.getConnection(this.currentConnectionId);
      if (conn) {
        const dbInfo = this.currentDatabase ? `/${this.currentDatabase}` : '';
        this.statusBarItem.text = `$(database) ${conn.name}${dbInfo}`;
        this.statusBarItem.tooltip = `Connected to ${conn.host}:${conn.port}${dbInfo}\nClick to change connection`;
      }
    } else {
      this.statusBarItem.text = '$(plug) No Connection';
      this.statusBarItem.tooltip = 'Click to select a database connection';
    }
  }

  public dispose(): void {
    this.statusBarItem.dispose();
    this.disposables.forEach(d => d.dispose());
    SqlQueryManager.instance = undefined;
  }
}
