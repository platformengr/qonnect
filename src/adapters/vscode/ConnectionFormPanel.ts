import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import { IConnectionStorage } from '../../core/interfaces';
import { ConnectionManager } from '../../core/services';
import { ConnectionConfig, ConnectionCategory, DatabaseType } from '../../types';

/**
 * Manages the connection form webview panel
 */
export class ConnectionFormPanel {
  public static currentPanel: ConnectionFormPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly storage: IConnectionStorage;
  private readonly connectionManager: ConnectionManager;
  private readonly editingConnection?: ConnectionConfig;
  private disposables: vscode.Disposable[] = [];
  private onSaveCallback?: (connection: ConnectionConfig) => void;

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    storage: IConnectionStorage,
    connectionManager: ConnectionManager,
    editingConnection?: ConnectionConfig
  ) {
    this.panel = panel;
    this.storage = storage;
    this.connectionManager = connectionManager;
    this.editingConnection = editingConnection;

    this.initialize(extensionUri);
  }

  private async initialize(extensionUri: vscode.Uri): Promise<void> {
    const categories = await this.storage.getCategories();
    this.panel.webview.html = this.getHtmlContent(extensionUri, categories);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      message => this.handleMessage(message),
      null,
      this.disposables
    );
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    storage: IConnectionStorage,
    connectionManager: ConnectionManager,
    editingConnection?: ConnectionConfig
  ): ConnectionFormPanel {
    const column = vscode.ViewColumn.Active;

    if (ConnectionFormPanel.currentPanel) {
      ConnectionFormPanel.currentPanel.panel.reveal(column);
      return ConnectionFormPanel.currentPanel;
    }

    const title = editingConnection ? 'Edit Connection' : 'New Connection';

    const panel = vscode.window.createWebviewPanel('connectionForm', title, column, {
      enableScripts: true,
      retainContextWhenHidden: true,
    });

    ConnectionFormPanel.currentPanel = new ConnectionFormPanel(
      panel,
      extensionUri,
      storage,
      connectionManager,
      editingConnection
    );

    return ConnectionFormPanel.currentPanel;
  }

  public onSave(callback: (connection: ConnectionConfig) => void): void {
    this.onSaveCallback = callback;
  }

  private async handleMessage(message: { type: string; [key: string]: unknown }): Promise<void> {
    switch (message.type) {
      case 'testConnection':
        await this.testConnection(message.connection as ConnectionConfig);
        break;
      case 'saveConnection':
        await this.saveConnection(message.connection as ConnectionConfig);
        break;
      case 'cancel':
        this.dispose();
        break;
    }
  }

  private async testConnection(config: ConnectionConfig): Promise<void> {
    try {
      this.sendMessage({ type: 'testStart' });
      const success = await this.connectionManager.testConnection(config);
      this.sendMessage({ type: 'testResult', success });
    } catch (error) {
      this.sendMessage({
        type: 'testResult',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async saveConnection(config: ConnectionConfig): Promise<void> {
    const connection: ConnectionConfig = {
      ...config,
      id: this.editingConnection?.id || uuidv4(),
    };

    // Test connection before saving
    this.sendMessage({ type: 'saveStart' });

    try {
      const success = await this.connectionManager.testConnection(connection);

      if (!success) {
        this.sendMessage({
          type: 'saveResult',
          success: false,
          error: 'Could not connect to the database. Please verify your connection details.',
        });
        return;
      }
    } catch (error) {
      this.sendMessage({
        type: 'saveResult',
        success: false,
        error: `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
      });
      return;
    }

    // Connection successful, now save
    try {
      await this.storage.saveConnection(connection);

      if (this.onSaveCallback) {
        this.onSaveCallback(connection);
      }

      this.sendMessage({ type: 'saveResult', success: true });
      this.dispose();
    } catch (error) {
      this.sendMessage({
        type: 'saveResult',
        success: false,
        error: `Failed to save: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  private sendMessage(message: unknown): void {
    this.panel.webview.postMessage(message);
  }

  private dispose(): void {
    ConnectionFormPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private getHtmlContent(extensionUri: vscode.Uri, categories: ConnectionCategory[]): string {
    const nonce = this.getNonce();
    const connection = this.editingConnection;

    const categoryOptions = categories
      .map(
        cat =>
          `<option value="${cat.id}" ${connection?.categoryId === cat.id ? 'selected' : ''}>${cat.name}</option>`
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>${connection ? 'Edit' : 'New'} Connection</title>
  <style>
    :root {
      --bg-primary: var(--vscode-editor-background);
      --bg-secondary: var(--vscode-sideBar-background);
      --bg-input: var(--vscode-input-background);
      --text-primary: var(--vscode-editor-foreground);
      --text-secondary: var(--vscode-descriptionForeground);
      --border-color: var(--vscode-input-border);
      --accent-color: var(--vscode-button-background);
      --accent-hover: var(--vscode-button-hoverBackground);
      --success-color: var(--vscode-charts-green);
      --error-color: var(--vscode-errorForeground);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--text-primary);
      background: var(--bg-primary);
      padding: 24px;
      max-width: 600px;
      margin: 0 auto;
    }

    h1 {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .form-section {
      background: var(--bg-secondary);
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
    }

    .section-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 16px;
    }

    .form-row {
      display: flex;
      gap: 16px;
      margin-bottom: 16px;
    }

    .form-group {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .form-group.small {
      flex: 0 0 100px;
    }

    label {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-secondary);
    }

    input, select {
      padding: 10px 12px;
      font-size: 14px;
      background: var(--bg-input);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      outline: none;
      transition: border-color 0.2s;
    }

    input:focus, select:focus {
      border-color: var(--accent-color);
    }

    input::placeholder {
      color: var(--text-secondary);
      opacity: 0.6;
    }

    .checkbox-group {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
    }

    .checkbox-group input {
      width: 16px;
      height: 16px;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 24px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      font-size: 14px;
      font-weight: 500;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-primary {
      background: var(--accent-color);
      color: var(--vscode-button-foreground);
    }

    .btn-primary:hover {
      background: var(--accent-hover);
    }

    .btn-secondary {
      background: transparent;
      color: var(--text-primary);
      border: 1px solid var(--border-color);
    }

    .btn-secondary:hover {
      background: var(--bg-secondary);
    }

    .btn-success {
      background: var(--success-color);
      color: white;
    }

    .test-result {
      display: none;
      padding: 12px;
      border-radius: 6px;
      margin-top: 16px;
      font-size: 13px;
    }

    .test-result.success {
      display: block;
      background: rgba(40, 167, 69, 0.1);
      border: 1px solid var(--success-color);
      color: var(--success-color);
    }

    .test-result.error {
      display: block;
      background: rgba(220, 53, 69, 0.1);
      border: 1px solid var(--error-color);
      color: var(--error-color);
    }

    .test-result.loading {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--bg-input);
      border: 1px solid var(--border-color);
    }

    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid var(--border-color);
      border-top-color: var(--accent-color);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .db-type-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 16px;
    }

    .db-type-option {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 16px;
      background: var(--bg-input);
      border: 2px solid var(--border-color);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .db-type-option:hover {
      border-color: var(--accent-color);
    }

    .db-type-option.selected {
      border-color: var(--accent-color);
      background: rgba(0, 122, 204, 0.1);
    }

    .db-type-option.disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .db-type-icon {
      font-size: 32px;
      margin-bottom: 8px;
    }

    .db-type-name {
      font-size: 13px;
      font-weight: 500;
    }

    .db-type-status {
      font-size: 11px;
      color: var(--text-secondary);
      margin-top: 4px;
    }
  </style>
</head>
<body>
  <h1>🔌 ${connection ? 'Edit' : 'New'} Connection</h1>

  <form id="connectionForm">
    <div class="form-section">
      <div class="section-title">Database Type</div>
      <div class="db-type-grid">
        <div class="db-type-option ${!connection || connection.type === 'postgresql' ? 'selected' : ''}" data-type="postgresql">
          <div class="db-type-icon">🐘</div>
          <div class="db-type-name">PostgreSQL</div>
          <div class="db-type-status">Available</div>
        </div>
        <div class="db-type-option ${connection?.type === 'mysql' ? 'selected' : ''}" data-type="mysql">
          <div class="db-type-icon">🐬</div>
          <div class="db-type-name">MySQL</div>
          <div class="db-type-status">Available</div>
        </div>
        <div class="db-type-option disabled" data-type="mongodb">
          <div class="db-type-icon">🍃</div>
          <div class="db-type-name">MongoDB</div>
          <div class="db-type-status">Coming soon</div>
        </div>
      </div>
      <input type="hidden" id="dbType" name="type" value="${connection?.type || 'postgresql'}">
    </div>

    <div class="form-section">
      <div class="section-title">Connection Details</div>
      
      <div class="form-row">
        <div class="form-group">
          <label for="name">Connection Name *</label>
          <input type="text" id="name" name="name" required placeholder="My Database" value="${connection?.name || ''}">
        </div>
        <div class="form-group">
          <label for="category">Category</label>
          <select id="category" name="categoryId">
            <option value="">No category</option>
            ${categoryOptions}
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="host">Host *</label>
          <input type="text" id="host" name="host" required placeholder="localhost" value="${connection?.host || 'localhost'}">
        </div>
        <div class="form-group small">
          <label for="port">Port *</label>
          <input type="number" id="port" name="port" required value="${connection?.port || 5432}">
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="database">Database *</label>
          <input type="text" id="database" name="database" required placeholder="postgres" value="${connection?.database || 'postgres'}">
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="username">Username *</label>
          <input type="text" id="username" name="username" required placeholder="postgres" value="${connection?.username || 'postgres'}">
        </div>
        <div class="form-group">
          <label for="password">Password *</label>
          <input type="password" id="password" name="password" required placeholder="••••••••" value="${connection?.password || ''}">
        </div>
      </div>

      <div class="checkbox-group">
        <input type="checkbox" id="ssl" name="ssl" ${connection?.ssl ? 'checked' : ''}>
        <label for="ssl">Use SSL</label>
      </div>
    </div>

    <div id="testResult" class="test-result"></div>

    <div class="actions">
      <button type="button" class="btn btn-secondary" id="cancelBtn">Cancel</button>
      <button type="button" class="btn btn-secondary" id="testBtn">Test Connection</button>
      <button type="submit" class="btn btn-primary">Save Connection</button>
    </div>
  </form>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const form = document.getElementById('connectionForm');
    const testBtn = document.getElementById('testBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const testResult = document.getElementById('testResult');
    const dbTypeInput = document.getElementById('dbType');

    // Database type selection
    document.querySelectorAll('.db-type-option:not(.disabled)').forEach(option => {
      option.addEventListener('click', () => {
        document.querySelectorAll('.db-type-option').forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
        dbTypeInput.value = option.dataset.type;
        
        // Update defaults based on database type
        const portInput = document.getElementById('port');
        const databaseInput = document.getElementById('database');
        const usernameInput = document.getElementById('username');
        
        const defaults = {
          postgresql: { port: 5432, database: 'postgres', username: 'postgres' },
          mysql: { port: 3306, database: 'mysql', username: 'root' },
          mongodb: { port: 27017, database: 'admin', username: 'admin' }
        };
        
        const dbDefaults = defaults[option.dataset.type] || defaults.postgresql;
        portInput.value = dbDefaults.port;
        databaseInput.placeholder = dbDefaults.database;
        usernameInput.placeholder = dbDefaults.username;
        
        // Update values if they match old defaults
        const oldDefaults = Object.values(defaults);
        if (oldDefaults.some(d => databaseInput.value === d.database)) {
          databaseInput.value = dbDefaults.database;
        }
        if (oldDefaults.some(d => usernameInput.value === d.username)) {
          usernameInput.value = dbDefaults.username;
        }
      });
    });

    cancelBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'cancel' });
    });

    testBtn.addEventListener('click', () => {
      const connection = getFormData();
      if (!validateForm(connection)) return;
      
      testResult.className = 'test-result loading';
      testResult.innerHTML = '<div class="spinner"></div><span>Testing connection...</span>';
      
      vscode.postMessage({ type: 'testConnection', connection });
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const connection = getFormData();
      if (!validateForm(connection)) return;
      
      // Disable form while saving
      const saveBtn = form.querySelector('button[type="submit"]');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Connecting...';
      
      vscode.postMessage({ type: 'saveConnection', connection });
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      const saveBtn = form.querySelector('button[type="submit"]');
      
      if (message.type === 'testStart') {
        testResult.className = 'test-result loading';
        testResult.innerHTML = '<div class="spinner"></div><span>Testing connection...</span>';
      } else if (message.type === 'testResult') {
        if (message.success) {
          testResult.className = 'test-result success';
          testResult.textContent = '✓ Connection successful!';
        } else {
          testResult.className = 'test-result error';
          testResult.textContent = '✗ Connection failed: ' + (message.error || 'Unknown error');
        }
      } else if (message.type === 'saveStart') {
        testResult.className = 'test-result loading';
        testResult.innerHTML = '<div class="spinner"></div><span>Verifying connection and saving...</span>';
        saveBtn.disabled = true;
        saveBtn.textContent = 'Connecting...';
      } else if (message.type === 'saveResult') {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Connection';
        
        if (message.success) {
          testResult.className = 'test-result success';
          testResult.textContent = '✓ Connection saved successfully!';
        } else {
          testResult.className = 'test-result error';
          testResult.textContent = '✗ ' + (message.error || 'Failed to save connection');
        }
      }
    });

    function getFormData() {
      return {
        type: dbTypeInput.value,
        name: document.getElementById('name').value,
        host: document.getElementById('host').value,
        port: parseInt(document.getElementById('port').value),
        database: document.getElementById('database').value,
        username: document.getElementById('username').value,
        password: document.getElementById('password').value,
        ssl: document.getElementById('ssl').checked,
        categoryId: document.getElementById('category').value || undefined
      };
    }

    function validateForm(connection) {
      if (!connection.name || !connection.host || !connection.port || 
          !connection.database || !connection.username || !connection.password) {
        testResult.className = 'test-result error';
        testResult.textContent = 'Please fill in all required fields';
        return false;
      }
      return true;
    }
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
