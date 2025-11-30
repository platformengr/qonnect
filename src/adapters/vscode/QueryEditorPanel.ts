import * as vscode from 'vscode';
import { ConnectionManager } from '../../core/services';
import { IConnectionStorage } from '../../core/interfaces';
import { QueryResult, DatabaseType, ConnectionConfig } from '../../types';

/**
 * Manages the query editor webview panel
 */
export class QueryEditorPanel {
  public static currentPanel: QueryEditorPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly connectionManager: ConnectionManager;
  private readonly storage: IConnectionStorage;
  private currentConnectionId: string;
  private currentDatabase: string | undefined;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    connectionManager: ConnectionManager,
    storage: IConnectionStorage,
    connectionId: string,
    database?: string
  ) {
    this.panel = panel;
    this.connectionManager = connectionManager;
    this.storage = storage;
    this.currentConnectionId = connectionId;
    this.currentDatabase = database;

    this.panel.webview.html = this.getHtmlContent(extensionUri);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      message => this.handleMessage(message),
      null,
      this.disposables
    );

    // Send initial connection data
    this.sendConnectionsAndDatabases();
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    connectionManager: ConnectionManager,
    storage: IConnectionStorage,
    connectionId: string,
    connectionName: string,
    database?: string
  ): QueryEditorPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (QueryEditorPanel.currentPanel) {
      QueryEditorPanel.currentPanel.panel.reveal(column);
      // Update connection if different
      if (QueryEditorPanel.currentPanel.currentConnectionId !== connectionId) {
        QueryEditorPanel.currentPanel.currentConnectionId = connectionId;
        QueryEditorPanel.currentPanel.currentDatabase = database;
        QueryEditorPanel.currentPanel.sendConnectionsAndDatabases();
      }
      return QueryEditorPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'databaseQuery',
      `Query Editor`,
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
      }
    );

    QueryEditorPanel.currentPanel = new QueryEditorPanel(
      panel,
      extensionUri,
      connectionManager,
      storage,
      connectionId,
      database
    );

    return QueryEditorPanel.currentPanel;
  }

  /**
   * Set the query text in the editor
   */
  public setQuery(query: string): void {
    this.sendMessage({ type: 'setQuery', query });
  }

  private async sendConnectionsAndDatabases(): Promise<void> {
    try {
      const connections = await this.storage.getConnections();
      const connectedIds = connections
        .filter(c => this.connectionManager.isConnected(c.id))
        .map(c => c.id);

      // Get databases for current connection
      let databases: string[] = [];
      const client = this.connectionManager.getClient(this.currentConnectionId);
      if (client) {
        try {
          const result = await client.executeQuery(
            'SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname'
          );
          databases = result.rows.map(r => r.datname as string);
        } catch {
          // Fallback - use connection's database
          const conn = await this.storage.getConnection(this.currentConnectionId);
          if (conn?.database) {
            databases = [conn.database];
          }
        }
      }

      this.sendMessage({
        type: 'connectionsData',
        connections: connections.map(c => ({
          id: c.id,
          name: c.name,
          type: c.type,
          isConnected: connectedIds.includes(c.id),
        })),
        currentConnectionId: this.currentConnectionId,
        databases,
        currentDatabase: this.currentDatabase,
      });
    } catch (error) {
      console.error('Failed to load connections:', error);
    }
  }

  private async handleMessage(message: {
    type: string;
    query?: string;
    [key: string]: unknown;
  }): Promise<void> {
    switch (message.type) {
      case 'executeQuery':
        await this.executeQuery(message.query || '');
        break;
      case 'exportResults':
        await this.exportResults(message.format as string);
        break;
      case 'openFile':
        await this.openFile();
        break;
      case 'saveFile':
        await this.saveFile(message.query || '');
        break;
      case 'changeConnection':
        await this.changeConnection(message.connectionId as string);
        break;
      case 'changeDatabase':
        this.currentDatabase = message.database as string;
        break;
      case 'refreshConnections':
        await this.sendConnectionsAndDatabases();
        break;
    }
  }

  private async changeConnection(connectionId: string): Promise<void> {
    const conn = await this.storage.getConnection(connectionId);
    if (!conn) return;

    // Connect if not connected
    if (!this.connectionManager.isConnected(connectionId)) {
      try {
        await this.connectionManager.connect(conn);
      } catch (error) {
        this.sendError(
          `Failed to connect: ${error instanceof Error ? error.message : String(error)}`
        );
        return;
      }
    }

    this.currentConnectionId = connectionId;
    this.currentDatabase = conn.database;
    await this.sendConnectionsAndDatabases();
  }

  private async openFile(): Promise<void> {
    const result = await vscode.window.showOpenDialog({
      filters: { 'SQL Files': ['sql'], 'All Files': ['*'] },
      canSelectMany: false,
    });

    if (result && result[0]) {
      const content = await vscode.workspace.fs.readFile(result[0]);
      const query = Buffer.from(content).toString('utf8');
      this.setQuery(query);
    }
  }

  private async saveFile(query: string): Promise<void> {
    const result = await vscode.window.showSaveDialog({
      filters: { 'SQL Files': ['sql'] },
      defaultUri: vscode.Uri.file('query.sql'),
    });

    if (result) {
      await vscode.workspace.fs.writeFile(result, Buffer.from(query, 'utf8'));
      vscode.window.showInformationMessage('Query saved successfully');
    }
  }

  private async executeQuery(query: string): Promise<void> {
    const client = this.connectionManager.getClient(this.currentConnectionId);
    if (!client) {
      this.sendError('Not connected to database. Please select a connection.');
      return;
    }

    try {
      this.sendMessage({ type: 'queryStart' });
      let result: QueryResult;

      if (this.currentDatabase) {
        result = await client.executeQueryOnDatabase(this.currentDatabase, query);
      } else {
        result = await client.executeQuery(query);
      }

      this.sendMessage({ type: 'queryResult', result });
    } catch (error) {
      this.sendError(error instanceof Error ? error.message : String(error));
    }
  }

  private async exportResults(format: string): Promise<void> {
    vscode.window.showInformationMessage(`Export to ${format} - Coming soon!`);
  }

  private sendMessage(message: unknown): void {
    this.panel.webview.postMessage(message);
  }

  private sendError(error: string): void {
    this.sendMessage({ type: 'error', error });
  }

  private dispose(): void {
    QueryEditorPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private getHtmlContent(extensionUri: vscode.Uri): string {
    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Query Editor</title>
  <style>
    :root {
      --bg-primary: var(--vscode-editor-background);
      --bg-secondary: var(--vscode-sideBar-background);
      --bg-tertiary: var(--vscode-editorGroupHeader-tabsBackground);
      --text-primary: var(--vscode-editor-foreground);
      --text-secondary: var(--vscode-descriptionForeground);
      --border-color: var(--vscode-panel-border);
      --accent-color: var(--vscode-button-background);
      --accent-hover: var(--vscode-button-hoverBackground);
      --success-color: var(--vscode-charts-green);
      --error-color: var(--vscode-errorForeground);
      
      /* SQL Syntax Colors */
      --sql-keyword: #569cd6;
      --sql-function: #dcdcaa;
      --sql-string: #ce9178;
      --sql-number: #b5cea8;
      --sql-comment: #6a9955;
      --sql-operator: #d4d4d4;
      --sql-identifier: #9cdcfe;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--text-primary);
      background: var(--bg-primary);
      height: 100vh;
      overflow: hidden;
    }

    .container {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }

    /* Toolbar */
    .toolbar {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 12px;
      background: var(--bg-tertiary);
      border-bottom: 1px solid var(--border-color);
      flex-shrink: 0;
    }

    .toolbar-group {
      display: flex;
      align-items: center;
      gap: 2px;
    }

    .toolbar-separator {
      width: 1px;
      height: 20px;
      background: var(--border-color);
      margin: 0 8px;
    }

    .toolbar-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 4px 8px;
      font-size: 12px;
      background: transparent;
      color: var(--text-primary);
      border: none;
      border-radius: 3px;
      cursor: pointer;
      transition: background 0.1s;
    }

    .toolbar-btn:hover {
      background: var(--vscode-toolbar-hoverBackground);
    }

    .toolbar-btn.primary {
      background: var(--accent-color);
      color: var(--vscode-button-foreground);
    }

    .toolbar-btn.primary:hover {
      background: var(--accent-hover);
    }

    .toolbar-btn svg {
      width: 16px;
      height: 16px;
      fill: currentColor;
    }

    .toolbar-spacer {
      flex: 1;
    }

    .status-text {
      font-size: 11px;
      color: var(--text-secondary);
      padding: 0 8px;
    }

    /* Dropdown selects */
    .toolbar-select {
      padding: 4px 8px;
      font-size: 12px;
      background: var(--bg-secondary);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
      border-radius: 3px;
      cursor: pointer;
      min-width: 120px;
      max-width: 200px;
    }

    .toolbar-select:focus {
      outline: 1px solid var(--accent-color);
      border-color: var(--accent-color);
    }

    .toolbar-select option {
      background: var(--bg-secondary);
      color: var(--text-primary);
    }

    .toolbar-label {
      font-size: 11px;
      color: var(--text-secondary);
      margin-right: 4px;
    }

    .connection-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
      margin-right: 4px;
    }

    .connection-indicator.connected {
      background: var(--success-color);
    }

    .connection-indicator.disconnected {
      background: var(--text-secondary);
    }

    /* Split Container */
    .split-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      position: relative;
    }

    /* Query Panel */
    .query-panel {
      display: flex;
      flex-direction: column;
      min-height: 100px;
      overflow: hidden;
    }

    .query-panel.maximized {
      flex: 1;
    }

    .editor-wrapper {
      flex: 1;
      position: relative;
      overflow: hidden;
    }

    .code-editor {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      font-family: var(--vscode-editor-font-family), 'Consolas', 'Monaco', monospace;
      font-size: 14px;
      line-height: 1.5;
      tab-size: 2;
      overflow: auto;
      background: var(--bg-secondary);
      padding: 12px;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    .code-input {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      font-family: inherit;
      font-size: inherit;
      line-height: inherit;
      tab-size: inherit;
      background: transparent;
      color: transparent;
      caret-color: var(--text-primary);
      border: none;
      outline: none;
      resize: none;
      padding: 12px;
      white-space: pre-wrap;
      word-wrap: break-word;
      overflow: auto;
    }

    .code-highlight {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      font-family: inherit;
      font-size: inherit;
      line-height: inherit;
      tab-size: inherit;
      padding: 12px;
      white-space: pre-wrap;
      word-wrap: break-word;
      overflow: auto;
    }

    /* Syntax highlighting classes */
    .sql-keyword { color: var(--sql-keyword); font-weight: 500; }
    .sql-function { color: var(--sql-function); }
    .sql-string { color: var(--sql-string); }
    .sql-number { color: var(--sql-number); }
    .sql-comment { color: var(--sql-comment); font-style: italic; }
    .sql-operator { color: var(--sql-operator); }
    .sql-identifier { color: var(--sql-identifier); }

    /* Splitter */
    .splitter {
      height: 6px;
      background: var(--bg-tertiary);
      cursor: ns-resize;
      display: flex;
      align-items: center;
      justify-content: center;
      border-top: 1px solid var(--border-color);
      border-bottom: 1px solid var(--border-color);
      flex-shrink: 0;
    }

    .splitter:hover {
      background: var(--accent-color);
    }

    .splitter-handle {
      width: 40px;
      height: 3px;
      background: var(--border-color);
      border-radius: 2px;
    }

    .splitter.hidden {
      display: none;
    }

    /* Results Panel */
    .results-panel {
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
      background: var(--bg-primary);
    }

    .results-panel.hidden {
      display: none;
    }

    .results-panel.maximized {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 10;
    }

    .results-header {
      display: flex;
      align-items: center;
      padding: 6px 12px;
      background: var(--bg-tertiary);
      border-bottom: 1px solid var(--border-color);
      gap: 8px;
      flex-shrink: 0;
    }

    .results-tabs {
      display: flex;
      gap: 2px;
    }

    .results-tab {
      padding: 4px 12px;
      font-size: 12px;
      background: transparent;
      color: var(--text-secondary);
      border: none;
      border-radius: 3px;
      cursor: pointer;
    }

    .results-tab.active {
      background: var(--accent-color);
      color: var(--vscode-button-foreground);
    }

    .results-info {
      font-size: 11px;
      color: var(--text-secondary);
    }

    .results-actions {
      margin-left: auto;
      display: flex;
      gap: 2px;
    }

    .results-content {
      flex: 1;
      overflow: auto;
    }

    /* Table styles */
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    .data-table th,
    .data-table td {
      padding: 6px 12px;
      text-align: left;
      border-bottom: 1px solid var(--border-color);
      border-right: 1px solid var(--border-color);
      white-space: nowrap;
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .data-table th {
      background: var(--bg-tertiary);
      font-weight: 600;
      position: sticky;
      top: 0;
      z-index: 1;
    }

    .data-table tr:hover td {
      background: var(--vscode-list-hoverBackground);
    }

    .data-table td.null-value {
      color: var(--text-secondary);
      font-style: italic;
    }

    /* Messages */
    .message-container {
      display: flex;
      flex-direction: column;
      padding: 12px;
      gap: 8px;
    }

    .message {
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 13px;
    }

    .message.error {
      background: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      color: var(--error-color);
    }

    .message.success {
      background: rgba(0, 128, 0, 0.1);
      border: 1px solid var(--success-color);
      color: var(--success-color);
    }

    .message.info {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      color: var(--text-secondary);
    }

    /* Loading */
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      color: var(--text-secondary);
      gap: 12px;
    }

    .spinner {
      width: 20px;
      height: 20px;
      border: 2px solid var(--border-color);
      border-top-color: var(--accent-color);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Empty state */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px;
      color: var(--text-secondary);
      gap: 8px;
    }

    .empty-state-icon {
      font-size: 32px;
      opacity: 0.5;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Toolbar -->
    <div class="toolbar">
      <div class="toolbar-group">
        <span class="toolbar-label">Server:</span>
        <select class="toolbar-select" id="connectionSelect" title="Select Connection">
          <option value="">-- Select Connection --</option>
        </select>
      </div>

      <div class="toolbar-group">
        <span class="toolbar-label">Database:</span>
        <select class="toolbar-select" id="databaseSelect" title="Select Database">
          <option value="">-- Select Database --</option>
        </select>
      </div>

      <div class="toolbar-separator"></div>

      <div class="toolbar-group">
        <button class="toolbar-btn" id="openBtn" title="Open SQL File (Ctrl+O)">
          <svg viewBox="0 0 16 16"><path d="M5.5 3A1.5 1.5 0 0 0 4 4.5v7A1.5 1.5 0 0 0 5.5 13h5a1.5 1.5 0 0 0 1.5-1.5V6.707L8.293 3H5.5zM4 4.5A1.5 1.5 0 0 1 5.5 3H8v3.5A.5.5 0 0 0 8.5 7H12v4.5a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 4 11.5v-7z"/></svg>
        </button>
        <button class="toolbar-btn" id="saveBtn" title="Save SQL File (Ctrl+S)">
          <svg viewBox="0 0 16 16"><path d="M2 2.5A1.5 1.5 0 0 1 3.5 1h6.379a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 1 .439 1.061V12.5A1.5 1.5 0 0 1 12.5 14h-9A1.5 1.5 0 0 1 2 12.5v-10zm1.5-.5a.5.5 0 0 0-.5.5v10a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5V4.621a.5.5 0 0 0-.146-.354l-2.121-2.12A.5.5 0 0 0 9.879 2H3.5zM6 4h4v2H6V4zm1 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/></svg>
        </button>
      </div>

      <div class="toolbar-separator"></div>

      <div class="toolbar-group">
        <button class="toolbar-btn primary" id="executeBtn" title="Execute Query (Ctrl+Enter)">
          <svg viewBox="0 0 16 16"><path d="M4 2l10 6-10 6V2z"/></svg>
          Execute
        </button>
      </div>

      <div class="toolbar-separator"></div>

      <div class="toolbar-group">
        <button class="toolbar-btn" id="toggleResultsBtn" title="Toggle Results Panel">
          <svg viewBox="0 0 16 16"><path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h11A1.5 1.5 0 0 1 15 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-9zM2.5 3a.5.5 0 0 0-.5.5V8h12V3.5a.5.5 0 0 0-.5-.5h-11zM14 9H2v3.5a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5V9z"/></svg>
        </button>
        <button class="toolbar-btn" id="maximizeQueryBtn" title="Maximize Query Panel">
          <svg viewBox="0 0 16 16"><path d="M1.5 1A1.5 1.5 0 0 0 0 2.5v11A1.5 1.5 0 0 0 1.5 15h13a1.5 1.5 0 0 0 1.5-1.5v-11A1.5 1.5 0 0 0 14.5 1h-13zM1 2.5a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 .5.5v11a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5v-11z"/><path d="M2 4h12v1H2V4z"/></svg>
        </button>
        <button class="toolbar-btn" id="maximizeResultsBtn" title="Maximize Results Panel">
          <svg viewBox="0 0 16 16"><path d="M1.5 1A1.5 1.5 0 0 0 0 2.5v11A1.5 1.5 0 0 0 1.5 15h13a1.5 1.5 0 0 0 1.5-1.5v-11A1.5 1.5 0 0 0 14.5 1h-13zM1 2.5a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 .5.5v11a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5v-11z"/><path d="M2 11h12v1H2v-1z"/></svg>
        </button>
        <button class="toolbar-btn" id="resetLayoutBtn" title="Reset Layout">
          <svg viewBox="0 0 16 16"><path d="M1.5 1A1.5 1.5 0 0 0 0 2.5v11A1.5 1.5 0 0 0 1.5 15h13a1.5 1.5 0 0 0 1.5-1.5v-11A1.5 1.5 0 0 0 14.5 1h-13zM1 2.5a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 .5.5v11a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5v-11z"/><path d="M2 8h12v1H2V8z"/></svg>
        </button>
      </div>

      <div class="toolbar-spacer"></div>

      <span class="status-text" id="statusText">Ready</span>
    </div>

    <!-- Split Container -->
    <div class="split-container">
      <!-- Query Panel -->
      <div class="query-panel" id="queryPanel" style="height: 50%;">
        <div class="editor-wrapper">
          <div class="code-highlight" id="codeHighlight"></div>
          <textarea class="code-input" id="codeInput" spellcheck="false" placeholder="-- Enter your SQL query here..."></textarea>
        </div>
      </div>

      <!-- Splitter -->
      <div class="splitter" id="splitter">
        <div class="splitter-handle"></div>
      </div>

      <!-- Results Panel -->
      <div class="results-panel" id="resultsPanel" style="flex: 1;">
        <div class="results-header">
          <div class="results-tabs">
            <button class="results-tab active" data-tab="results">Results</button>
            <button class="results-tab" data-tab="messages">Messages</button>
          </div>
          <span class="results-info" id="resultsInfo"></span>
          <div class="results-actions">
            <button class="toolbar-btn" id="exportCsvBtn" title="Export to CSV">
              <svg viewBox="0 0 16 16"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/></svg>
            </button>
          </div>
        </div>
        <div class="results-content" id="resultsContent">
          <div class="empty-state">
            <div class="empty-state-icon">📊</div>
            <div>Execute a query to see results</div>
            <div style="font-size: 11px; margin-top: 8px;">Press Ctrl+Enter or click Execute</div>
          </div>
        </div>
        <div class="results-content" id="messagesContent" style="display: none;">
          <div class="message-container" id="messagesList"></div>
        </div>
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    
    // Elements
    const codeInput = document.getElementById('codeInput');
    const codeHighlight = document.getElementById('codeHighlight');
    const queryPanel = document.getElementById('queryPanel');
    const resultsPanel = document.getElementById('resultsPanel');
    const splitter = document.getElementById('splitter');
    const resultsContent = document.getElementById('resultsContent');
    const messagesContent = document.getElementById('messagesContent');
    const messagesList = document.getElementById('messagesList');
    const resultsInfo = document.getElementById('resultsInfo');
    const statusText = document.getElementById('statusText');
    const connectionSelect = document.getElementById('connectionSelect');
    const databaseSelect = document.getElementById('databaseSelect');

    // Connection/Database handling
    connectionSelect.addEventListener('change', () => {
      const connectionId = connectionSelect.value;
      if (connectionId) {
        statusText.textContent = 'Connecting...';
        vscode.postMessage({ type: 'changeConnection', connectionId });
      }
    });

    databaseSelect.addEventListener('change', () => {
      const database = databaseSelect.value;
      if (database) {
        vscode.postMessage({ type: 'changeDatabase', database });
        statusText.textContent = 'Database: ' + database;
      }
    });

    function updateConnectionsDropdown(connections, currentConnectionId) {
      connectionSelect.innerHTML = '<option value="">-- Select Connection --</option>';
      connections.forEach(conn => {
        const option = document.createElement('option');
        option.value = conn.id;
        option.textContent = (conn.isConnected ? '● ' : '○ ') + conn.name;
        option.selected = conn.id === currentConnectionId;
        connectionSelect.appendChild(option);
      });
    }

    function updateDatabasesDropdown(databases, currentDatabase) {
      databaseSelect.innerHTML = '<option value="">-- Select Database --</option>';
      databases.forEach(db => {
        const option = document.createElement('option');
        option.value = db;
        option.textContent = db;
        option.selected = db === currentDatabase;
        databaseSelect.appendChild(option);
      });
    }

    // SQL Keywords for syntax highlighting
    const sqlKeywords = [
      'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN',
      'ORDER', 'BY', 'ASC', 'DESC', 'LIMIT', 'OFFSET', 'GROUP', 'HAVING',
      'JOIN', 'INNER', 'LEFT', 'RIGHT', 'OUTER', 'FULL', 'CROSS', 'ON',
      'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'TRUNCATE',
      'CREATE', 'ALTER', 'DROP', 'TABLE', 'INDEX', 'VIEW', 'DATABASE', 'SCHEMA',
      'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'CONSTRAINT', 'UNIQUE',
      'NULL', 'DEFAULT', 'AUTO_INCREMENT', 'SERIAL', 'IDENTITY',
      'IF', 'EXISTS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
      'AS', 'DISTINCT', 'ALL', 'UNION', 'INTERSECT', 'EXCEPT',
      'BEGIN', 'COMMIT', 'ROLLBACK', 'TRANSACTION', 'SAVEPOINT',
      'GRANT', 'REVOKE', 'CASCADE', 'RESTRICT', 'RETURNING',
      'WITH', 'RECURSIVE', 'OVER', 'PARTITION', 'WINDOW', 'FETCH', 'NEXT', 'ONLY',
      'TRUE', 'FALSE', 'IS', 'ISNULL', 'NOTNULL', 'NULLS', 'FIRST', 'LAST',
      'EXPLAIN', 'ANALYZE', 'VACUUM', 'REINDEX', 'CLUSTER'
    ];

    const sqlFunctions = [
      'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'NULLIF',
      'CAST', 'CONVERT', 'EXTRACT', 'DATE_PART', 'DATE_TRUNC',
      'UPPER', 'LOWER', 'TRIM', 'LTRIM', 'RTRIM', 'SUBSTRING', 'CONCAT',
      'LENGTH', 'CHAR_LENGTH', 'POSITION', 'REPLACE', 'SPLIT_PART',
      'NOW', 'CURRENT_DATE', 'CURRENT_TIME', 'CURRENT_TIMESTAMP',
      'TO_CHAR', 'TO_DATE', 'TO_TIMESTAMP', 'TO_NUMBER',
      'ARRAY_AGG', 'STRING_AGG', 'JSON_AGG', 'JSONB_AGG',
      'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'LAG', 'LEAD', 'FIRST_VALUE', 'LAST_VALUE',
      'ABS', 'CEIL', 'FLOOR', 'ROUND', 'TRUNC', 'MOD', 'POWER', 'SQRT',
      'RANDOM', 'GREATEST', 'LEAST', 'GENERATE_SERIES'
    ];

    const sqlDataTypes = [
      'INTEGER', 'INT', 'SMALLINT', 'BIGINT', 'SERIAL', 'BIGSERIAL',
      'NUMERIC', 'DECIMAL', 'REAL', 'DOUBLE', 'PRECISION', 'FLOAT',
      'VARCHAR', 'CHAR', 'TEXT', 'BYTEA', 'UUID',
      'BOOLEAN', 'BOOL', 'BIT', 'VARBIT',
      'DATE', 'TIME', 'TIMESTAMP', 'TIMESTAMPTZ', 'INTERVAL',
      'JSON', 'JSONB', 'XML', 'ARRAY',
      'POINT', 'LINE', 'POLYGON', 'CIRCLE', 'BOX', 'PATH',
      'INET', 'CIDR', 'MACADDR'
    ];

    // Syntax highlighting function
    function highlightSQL(code) {
      if (!code) return '';
      
      let highlighted = escapeHtml(code);
      
      // Comments (-- and /* */)
      highlighted = highlighted.replace(/(--[^\\n]*)/g, '<span class="sql-comment">$1</span>');
      highlighted = highlighted.replace(/(\\/\\*[\\s\\S]*?\\*\\/)/g, '<span class="sql-comment">$1</span>');
      
      // Strings
      highlighted = highlighted.replace(/('(?:[^'\\\\]|\\\\.)*')/g, '<span class="sql-string">$1</span>');
      highlighted = highlighted.replace(/("(?:[^"\\\\]|\\\\.)*")/g, '<span class="sql-identifier">$1</span>');
      
      // Numbers
      highlighted = highlighted.replace(/\\b(\\d+\\.?\\d*)\\b/g, '<span class="sql-number">$1</span>');
      
      // Keywords (case insensitive)
      const keywordPattern = new RegExp('\\\\b(' + sqlKeywords.join('|') + ')\\\\b', 'gi');
      highlighted = highlighted.replace(keywordPattern, '<span class="sql-keyword">$1</span>');
      
      // Functions
      const functionPattern = new RegExp('\\\\b(' + sqlFunctions.join('|') + ')\\\\s*(?=\\\\()', 'gi');
      highlighted = highlighted.replace(functionPattern, '<span class="sql-function">$1</span>');
      
      // Data types
      const typePattern = new RegExp('\\\\b(' + sqlDataTypes.join('|') + ')\\\\b', 'gi');
      highlighted = highlighted.replace(typePattern, '<span class="sql-keyword">$1</span>');
      
      return highlighted;
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Sync scroll and update highlighting
    function updateHighlight() {
      codeHighlight.innerHTML = highlightSQL(codeInput.value) + '\\n';
    }

    function syncScroll() {
      codeHighlight.scrollTop = codeInput.scrollTop;
      codeHighlight.scrollLeft = codeInput.scrollLeft;
    }

    codeInput.addEventListener('input', updateHighlight);
    codeInput.addEventListener('scroll', syncScroll);

    // Tab key handling
    codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = codeInput.selectionStart;
        const end = codeInput.selectionEnd;
        codeInput.value = codeInput.value.substring(0, start) + '  ' + codeInput.value.substring(end);
        codeInput.selectionStart = codeInput.selectionEnd = start + 2;
        updateHighlight();
      }
      
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        executeQuery();
      }
      
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        saveFile();
      }
      
      if (e.ctrlKey && e.key === 'o') {
        e.preventDefault();
        openFile();
      }
    });

    // Toolbar buttons
    document.getElementById('executeBtn').addEventListener('click', executeQuery);
    document.getElementById('openBtn').addEventListener('click', openFile);
    document.getElementById('saveBtn').addEventListener('click', saveFile);
    document.getElementById('exportCsvBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'exportResults', format: 'csv' });
    });

    // Layout buttons
    let isResultsHidden = false;
    let isQueryMaximized = false;
    let isResultsMaximized = false;
    let savedQueryHeight = '50%';

    document.getElementById('toggleResultsBtn').addEventListener('click', () => {
      isResultsHidden = !isResultsHidden;
      resultsPanel.classList.toggle('hidden', isResultsHidden);
      splitter.classList.toggle('hidden', isResultsHidden);
      if (isResultsHidden) {
        queryPanel.style.height = '100%';
        queryPanel.classList.add('maximized');
      } else {
        queryPanel.style.height = savedQueryHeight;
        queryPanel.classList.remove('maximized');
      }
    });

    document.getElementById('maximizeQueryBtn').addEventListener('click', () => {
      if (!isQueryMaximized) {
        savedQueryHeight = queryPanel.style.height;
        isQueryMaximized = true;
        isResultsMaximized = false;
        queryPanel.style.height = '100%';
        queryPanel.classList.add('maximized');
        resultsPanel.classList.add('hidden');
        splitter.classList.add('hidden');
      } else {
        resetLayout();
      }
    });

    document.getElementById('maximizeResultsBtn').addEventListener('click', () => {
      if (!isResultsMaximized) {
        savedQueryHeight = queryPanel.style.height;
        isResultsMaximized = true;
        isQueryMaximized = false;
        resultsPanel.classList.add('maximized');
        queryPanel.classList.add('hidden');
        splitter.classList.add('hidden');
      } else {
        resetLayout();
      }
    });

    document.getElementById('resetLayoutBtn').addEventListener('click', resetLayout);

    function resetLayout() {
      isQueryMaximized = false;
      isResultsMaximized = false;
      isResultsHidden = false;
      queryPanel.style.height = '50%';
      queryPanel.classList.remove('maximized', 'hidden');
      resultsPanel.classList.remove('maximized', 'hidden');
      splitter.classList.remove('hidden');
    }

    // Splitter drag
    let isDragging = false;
    let startY = 0;
    let startHeight = 0;

    splitter.addEventListener('mousedown', (e) => {
      isDragging = true;
      startY = e.clientY;
      startHeight = queryPanel.offsetHeight;
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      
      const deltaY = e.clientY - startY;
      const containerHeight = document.querySelector('.split-container').offsetHeight;
      const newHeight = Math.max(100, Math.min(containerHeight - 100, startHeight + deltaY));
      queryPanel.style.height = newHeight + 'px';
      savedQueryHeight = newHeight + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });

    // Tabs
    document.querySelectorAll('.results-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.results-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        const tabName = tab.dataset.tab;
        resultsContent.style.display = tabName === 'results' ? 'block' : 'none';
        messagesContent.style.display = tabName === 'messages' ? 'block' : 'none';
      });
    });

    // Functions
    function executeQuery() {
      const query = codeInput.value.trim();
      if (!query) return;
      vscode.postMessage({ type: 'executeQuery', query });
    }

    function openFile() {
      vscode.postMessage({ type: 'openFile' });
    }

    function saveFile() {
      vscode.postMessage({ type: 'saveFile', query: codeInput.value });
    }

    function addMessage(text, type = 'info') {
      const msg = document.createElement('div');
      msg.className = 'message ' + type;
      msg.textContent = text;
      messagesList.appendChild(msg);
    }

    function clearMessages() {
      messagesList.innerHTML = '';
    }

    // Message handling
    window.addEventListener('message', (event) => {
      const message = event.data;
      
      switch (message.type) {
        case 'setQuery':
          codeInput.value = message.query || '';
          updateHighlight();
          break;
        
        case 'connectionsData':
          updateConnectionsDropdown(message.connections, message.currentConnectionId);
          updateDatabasesDropdown(message.databases || [], message.currentDatabase);
          if (message.currentDatabase) {
            statusText.textContent = 'Database: ' + message.currentDatabase;
          } else {
            statusText.textContent = 'Ready';
          }
          break;
          
        case 'queryStart':
          statusText.textContent = 'Executing...';
          resultsContent.innerHTML = '<div class="loading"><div class="spinner"></div><span>Executing query...</span></div>';
          clearMessages();
          addMessage('Executing query...', 'info');
          break;
          
        case 'queryResult':
          showResults(message.result);
          break;
          
        case 'error':
          showError(message.error);
          break;
      }
    });

    function showResults(result) {
      if (result.error) {
        showError(result.error);
        return;
      }

      statusText.textContent = 'Ready';
      addMessage('Query executed successfully (' + (result.executionTime || 0) + 'ms)', 'success');

      if (!result.rows || result.rows.length === 0) {
        if (result.affectedRows !== undefined) {
          resultsContent.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✓</div><div>' + result.affectedRows + ' row(s) affected</div></div>';
          addMessage(result.affectedRows + ' row(s) affected', 'success');
        } else {
          resultsContent.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><div>Query returned no results</div></div>';
        }
        resultsInfo.textContent = (result.rowCount || 0) + ' rows | ' + (result.executionTime || 0) + 'ms';
        return;
      }

      // Build table
      let html = '<table class="data-table"><thead><tr>';
      result.columns.forEach(col => {
        html += '<th title="' + escapeHtml(col.type || '') + '">' + escapeHtml(col.name) + '</th>';
      });
      html += '</tr></thead><tbody>';

      result.rows.forEach(row => {
        html += '<tr>';
        result.columns.forEach(col => {
          const value = row[col.name];
          if (value === null) {
            html += '<td class="null-value">NULL</td>';
          } else if (typeof value === 'object') {
            html += '<td title="' + escapeHtml(JSON.stringify(value)) + '">' + escapeHtml(JSON.stringify(value)) + '</td>';
          } else {
            html += '<td title="' + escapeHtml(String(value)) + '">' + escapeHtml(String(value)) + '</td>';
          }
        });
        html += '</tr>';
      });
      html += '</tbody></table>';

      resultsContent.innerHTML = html;
      resultsInfo.textContent = result.rowCount + ' rows | ' + (result.executionTime || 0) + 'ms';
    }

    function showError(error) {
      statusText.textContent = 'Error';
      resultsContent.innerHTML = '<div class="message-container"><div class="message error">' + escapeHtml(error) + '</div></div>';
      addMessage('Error: ' + error, 'error');
    }

    // Initial highlight
    updateHighlight();
  </script>
</body>
</html>`;
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
