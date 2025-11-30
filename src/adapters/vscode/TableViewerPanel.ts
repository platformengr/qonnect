import * as vscode from 'vscode';
import { ConnectionManager } from '../../core/services';
import { QueryResult } from '../../types';
import { PostgreSQLClient } from '../../core/clients/PostgreSQLClient';

/**
 * Manages the table data viewer webview panel
 */
export class TableViewerPanel {
  private static panels: Map<string, TableViewerPanel> = new Map();
  private readonly panel: vscode.WebviewPanel;
  private readonly connectionManager: ConnectionManager;
  private readonly connectionId: string;
  private readonly databaseName: string;
  private readonly tableName: string;
  private readonly schema: string;
  private disposables: vscode.Disposable[] = [];

  private currentPage = 1;
  private pageSize = 100;
  private totalRows = 0;
  private orderBy = '';
  private filter = '';

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    connectionManager: ConnectionManager,
    connectionId: string,
    databaseName: string,
    tableName: string,
    schema: string
  ) {
    this.panel = panel;
    this.connectionManager = connectionManager;
    this.connectionId = connectionId;
    this.databaseName = databaseName;
    this.tableName = tableName;
    this.schema = schema;

    this.panel.webview.html = this.getHtmlContent(extensionUri);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      message => this.handleMessage(message),
      null,
      this.disposables
    );

    // Load initial data
    this.loadData();
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    connectionManager: ConnectionManager,
    connectionId: string,
    databaseName: string,
    tableName: string,
    schema: string = 'public'
  ): TableViewerPanel {
    const key = `${connectionId}:${databaseName}:${schema}.${tableName}`;

    if (TableViewerPanel.panels.has(key)) {
      const existing = TableViewerPanel.panels.get(key)!;
      existing.panel.reveal();
      return existing;
    }

    const panel = vscode.window.createWebviewPanel(
      'tableViewer',
      `${tableName}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    const viewer = new TableViewerPanel(
      panel,
      extensionUri,
      connectionManager,
      connectionId,
      databaseName,
      tableName,
      schema
    );

    TableViewerPanel.panels.set(key, viewer);
    return viewer;
  }

  private async handleMessage(message: { type: string; [key: string]: unknown }): Promise<void> {
    switch (message.type) {
      case 'refresh':
        await this.loadData();
        break;
      case 'changePage':
        this.currentPage = message.page as number;
        await this.loadData();
        break;
      case 'changePageSize':
        this.pageSize = message.pageSize as number;
        this.currentPage = 1;
        await this.loadData();
        break;
      case 'sort':
        this.orderBy = `"${message.column}" ${message.direction}`;
        await this.loadData();
        break;
      case 'filter':
        this.filter = message.filter as string;
        this.currentPage = 1;
        await this.loadData();
        break;
      case 'saveCell':
        await this.saveCell(
          message as {
            type: string;
            rowIndex: number;
            column: string;
            value: unknown;
            primaryKeys: Record<string, unknown>;
            cellId: string;
          }
        );
        break;
      case 'deleteRow':
        await this.deleteRow(
          message.primaryKeys as Record<string, unknown>,
          message.rowId as string
        );
        break;
      case 'insertRow':
        await this.insertRow(message.values as Record<string, unknown>, message.rowId as string);
        break;
    }
  }

  private async saveCell(message: {
    rowIndex: number;
    column: string;
    value: unknown;
    primaryKeys: Record<string, unknown>;
    cellId: string;
  }): Promise<void> {
    const client = this.connectionManager.getClient(this.connectionId);
    if (!client) {
      this.sendMessage({
        type: 'saveError',
        error: 'Not connected to database',
        cellId: message.cellId,
      });
      return;
    }

    try {
      // Build WHERE clause from primary keys
      const whereClause = Object.entries(message.primaryKeys)
        .map(([col, val]) => `"${col}" = ${this.formatValue(val)}`)
        .join(' AND ');

      const query = `UPDATE "${this.schema}"."${this.tableName}" SET "${message.column}" = ${this.formatValue(message.value)} WHERE ${whereClause}`;

      const result = await client.executeQueryOnDatabase(this.databaseName, query);

      if (result.error) {
        this.sendMessage({
          type: 'saveError',
          error: result.error,
          cellId: message.cellId,
          rowIndex: message.rowIndex,
        });
      } else {
        this.sendMessage({
          type: 'saveSuccess',
          cellId: message.cellId,
          rowIndex: message.rowIndex,
          affectedRows: result.affectedRows,
        });
      }
    } catch (error) {
      this.sendMessage({
        type: 'saveError',
        error: error instanceof Error ? error.message : String(error),
        cellId: message.cellId,
        rowIndex: message.rowIndex,
      });
    }
  }

  private async deleteRow(primaryKeys: Record<string, unknown>, rowId?: string): Promise<void> {
    const client = this.connectionManager.getClient(this.connectionId);
    if (!client) {
      this.sendMessage({ type: 'deleteError', error: 'Not connected to database', rowId });
      return;
    }

    try {
      const whereClause = Object.entries(primaryKeys)
        .map(([col, val]) => `"${col}" = ${this.formatValue(val)}`)
        .join(' AND ');

      const query = `DELETE FROM "${this.schema}"."${this.tableName}" WHERE ${whereClause}`;
      const result = await client.executeQueryOnDatabase(this.databaseName, query);

      if (result.error) {
        this.sendMessage({ type: 'deleteError', error: result.error, rowId });
      } else {
        this.sendMessage({ type: 'deleteSuccess', rowId, affectedRows: result.affectedRows });
      }
    } catch (error) {
      this.sendMessage({
        type: 'deleteError',
        error: error instanceof Error ? error.message : String(error),
        rowId,
      });
    }
  }

  private async insertRow(values: Record<string, unknown>, rowId?: string): Promise<void> {
    const client = this.connectionManager.getClient(this.connectionId);
    if (!client) {
      this.sendMessage({ type: 'insertError', error: 'Not connected to database', rowId });
      return;
    }

    try {
      const columns = Object.keys(values)
        .map(c => `"${c}"`)
        .join(', ');
      const vals = Object.values(values)
        .map(v => this.formatValue(v))
        .join(', ');

      const query = `INSERT INTO "${this.schema}"."${this.tableName}" (${columns}) VALUES (${vals}) RETURNING *`;
      const result = await client.executeQueryOnDatabase(this.databaseName, query);

      if (result.error) {
        this.sendMessage({ type: 'insertError', error: result.error, rowId });
      } else {
        this.sendMessage({ type: 'insertSuccess', rowId, insertedRow: result.rows[0] });
      }
    } catch (error) {
      this.sendMessage({
        type: 'insertError',
        error: error instanceof Error ? error.message : String(error),
        rowId,
      });
    }
  }

  private formatValue(value: unknown): string {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
    return `'${String(value).replace(/'/g, "''")}'`;
  }

  private async loadData(): Promise<void> {
    const client = this.connectionManager.getClient(this.connectionId);
    if (!client) {
      this.sendError('Not connected to database');
      return;
    }

    try {
      this.sendMessage({ type: 'loading' });

      // Get primary key columns
      const pkResult = await client.executeQueryOnDatabase(
        this.databaseName,
        `SELECT a.attname as column_name
         FROM pg_index i
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
         WHERE i.indrelid = '"${this.schema}"."${this.tableName}"'::regclass
         AND i.indisprimary`
      );
      const primaryKeys = pkResult.rows.map(r => r.column_name as string);

      // Get total count
      const countResult = await client.executeQueryOnDatabase(
        this.databaseName,
        `SELECT COUNT(*) as count FROM "${this.schema}"."${this.tableName}"${this.filter ? ` WHERE ${this.filter}` : ''}`
      );
      this.totalRows = parseInt(String(countResult.rows[0]?.count || '0'), 10);

      // Get page data
      const result = await client.getTableData(this.databaseName, this.tableName, {
        schema: this.schema,
        limit: this.pageSize,
        offset: (this.currentPage - 1) * this.pageSize,
        orderBy: this.orderBy || undefined,
        filter: this.filter || undefined,
      });

      this.sendMessage({
        type: 'data',
        result,
        primaryKeys,
        pagination: {
          currentPage: this.currentPage,
          pageSize: this.pageSize,
          totalRows: this.totalRows,
          totalPages: Math.ceil(this.totalRows / this.pageSize),
        },
      });
    } catch (error) {
      this.sendError(error instanceof Error ? error.message : String(error));
    }
  }

  private sendMessage(message: unknown): void {
    this.panel.webview.postMessage(message);
  }

  private sendError(error: string): void {
    this.sendMessage({ type: 'error', error });
  }

  private dispose(): void {
    const key = `${this.connectionId}:${this.schema}.${this.tableName}`;
    TableViewerPanel.panels.delete(key);
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
  <title>${this.tableName}</title>
  <style>
    :root {
      --bg-primary: var(--vscode-editor-background);
      --bg-secondary: var(--vscode-sideBar-background);
      --text-primary: var(--vscode-editor-foreground);
      --text-secondary: var(--vscode-descriptionForeground);
      --border-color: var(--vscode-panel-border);
      --accent-color: var(--vscode-button-background);
      --accent-hover: var(--vscode-button-hoverBackground);
      --success-color: #4caf50;
      --error-color: var(--vscode-errorForeground);
      --warning-bg: var(--vscode-inputValidation-warningBackground);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--text-primary);
      background: var(--bg-primary);
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
    }

    .table-name { font-size: 16px; font-weight: 600; }
    .table-schema { font-size: 12px; color: var(--text-secondary); margin-left: 8px; }

    .toolbar { display: flex; gap: 12px; align-items: center; }

    .filter-input {
      padding: 6px 12px;
      font-size: 13px;
      background: var(--bg-primary);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      min-width: 200px;
    }
    .filter-input:focus { outline: none; border-color: var(--accent-color); }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 6px 12px;
      font-size: 13px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      background: var(--accent-color);
      color: var(--vscode-button-foreground);
    }
    .btn:hover { background: var(--accent-hover); }
    .btn.btn-success { background: var(--success-color); }
    .btn.btn-danger { background: var(--error-color); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .table-container { flex: 1; overflow: auto; }

    table { width: 100%; border-collapse: collapse; font-size: 13px; }

    th, td {
      padding: 8px 12px;
      text-align: left;
      border-bottom: 1px solid var(--border-color);
      white-space: nowrap;
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    th {
      background: var(--vscode-editorGroupHeader-tabsBackground);
      font-weight: 600;
      position: sticky;
      top: 0;
      z-index: 2;
      cursor: pointer;
      user-select: none;
    }
    th:hover { background: var(--vscode-list-hoverBackground); }
    th .sort-icon { margin-left: 4px; opacity: 0.5; }
    th.sorted .sort-icon { opacity: 1; }
    th.pk { color: var(--vscode-symbolIcon-keywordForeground, #dcdcaa); }
    th.pk::before { content: '🔑 '; font-size: 10px; }

    tr:hover td { background: var(--vscode-list-hoverBackground); }
    tr.modified td { background: var(--warning-bg); }
    tr.saving td { opacity: 0.6; }
    tr.new-row td { background: rgba(76, 175, 80, 0.15); }

    td.null-value { color: var(--text-secondary); font-style: italic; }

    td.editable { cursor: text; position: relative; }
    td.editable:hover { background: var(--vscode-editor-selectionBackground); }
    td.editing {
      padding: 0;
      background: var(--bg-primary) !important;
    }
    td.editing input {
      width: 100%;
      padding: 8px 12px;
      font-family: inherit;
      font-size: inherit;
      background: var(--bg-primary);
      color: var(--text-primary);
      border: 2px solid var(--accent-color);
      outline: none;
    }

    .row-actions {
      display: flex;
      gap: 4px;
      white-space: nowrap;
    }
    .row-btn {
      padding: 2px 6px;
      font-size: 11px;
      border: none;
      border-radius: 3px;
      cursor: pointer;
      background: transparent;
      color: var(--text-secondary);
    }
    .row-btn:hover { background: var(--border-color); color: var(--text-primary); }
    .row-btn.delete:hover { color: var(--error-color); }

    .footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: var(--bg-secondary);
      border-top: 1px solid var(--border-color);
      font-size: 12px;
    }

    .pagination { display: flex; gap: 8px; align-items: center; }

    .page-btn {
      padding: 4px 8px;
      background: transparent;
      color: var(--text-primary);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      cursor: pointer;
    }
    .page-btn:hover:not(:disabled) { background: var(--bg-primary); }
    .page-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .page-size-select {
      padding: 4px 8px;
      background: var(--bg-primary);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
      border-radius: 4px;
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-secondary);
    }

    .spinner {
      width: 24px;
      height: 24px;
      border: 2px solid var(--border-color);
      border-top-color: var(--accent-color);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-right: 12px;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    .error-message {
      padding: 16px;
      margin: 16px;
      background: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      border-radius: 6px;
      color: var(--error-color);
    }

    .toast {
      position: fixed;
      bottom: 80px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 6px;
      font-size: 13px;
      z-index: 100;
      animation: slideIn 0.3s ease;
    }
    .toast.success { background: var(--success-color); color: white; }
    .toast.error { background: var(--error-color); color: white; }

    .cell-selected {
      outline: 2px solid var(--accent-color);
      outline-offset: -2px;
    }

    .cell-error {
      background: rgba(255, 0, 0, 0.2) !important;
      outline: 2px solid var(--error-color) !important;
      outline-offset: -2px;
    }

    .row-error {
      background: rgba(255, 0, 0, 0.15) !important;
    }

    .row-error td {
      background: inherit !important;
    }

    .new-row td {
      background: rgba(76, 175, 80, 0.1);
    }

    .new-row td.cell-error {
      background: rgba(255, 0, 0, 0.2) !important;
    }

    .new-row-indicator {
      background: rgba(76, 175, 80, 0.15);
      border-top: 2px dashed var(--success-color);
    }

    .new-row-indicator td:first-child::before {
      content: '+ New';
      color: var(--success-color);
      font-weight: 600;
      font-size: 11px;
    }

    .row-checkbox {
      width: 18px;
      height: 18px;
      cursor: pointer;
      accent-color: var(--accent-color);
    }

    .checkbox-cell {
      width: 40px;
      text-align: center;
      padding: 4px 8px !important;
    }

    .bulk-actions {
      display: none;
      padding: 8px 16px;
      background: var(--vscode-editor-selectionBackground);
      border-bottom: 1px solid var(--border-color);
      gap: 12px;
      align-items: center;
    }

    .bulk-actions.visible {
      display: flex;
    }

    .bulk-actions .selected-count {
      font-weight: 600;
      margin-right: 8px;
    }

    .bulk-actions .btn {
      padding: 4px 10px;
      font-size: 12px;
    }

    .bulk-actions .btn.btn-danger {
      background: var(--error-color);
    }

    .confirm-modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.6);
      z-index: 1000;
      align-items: center;
      justify-content: center;
    }

    .confirm-modal.visible {
      display: flex;
    }

    .confirm-modal-content {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 20px;
      min-width: 350px;
      max-width: 500px;
    }

    .confirm-modal-header {
      font-weight: 600;
      font-size: 15px;
      margin-bottom: 12px;
      color: var(--error-color);
    }

    .confirm-modal-body {
      margin-bottom: 20px;
      line-height: 1.5;
    }

    .confirm-modal-footer {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }

    .mass-edit-modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.6);
      z-index: 1000;
      align-items: center;
      justify-content: center;
    }

    .mass-edit-modal.visible {
      display: flex;
    }

    .mass-edit-content {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 20px;
      min-width: 400px;
    }

    .mass-edit-header {
      font-weight: 600;
      font-size: 15px;
      margin-bottom: 16px;
    }

    .mass-edit-row {
      display: flex;
      gap: 12px;
      align-items: center;
      margin-bottom: 12px;
    }

    .mass-edit-row select, .mass-edit-row input {
      flex: 1;
      padding: 8px;
      background: var(--bg-primary);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
      border-radius: 4px;
    }

    .mass-edit-footer {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      margin-top: 16px;
    }

    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    .status-bar {
      display: flex;
      gap: 16px;
      align-items: center;
    }
    .status-indicator {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .status-indicator.has-changes { color: var(--vscode-gitDecoration-modifiedResourceForeground); }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <span class="table-name">${this.tableName}</span>
      <span class="table-schema">${this.schema}</span>
    </div>
    <div class="toolbar">
      <input type="text" class="filter-input" id="filterInput" placeholder="Filter (e.g., id > 10)">
      <button class="btn" id="refreshBtn">↻ Refresh</button>
    </div>
  </div>

  <div class="bulk-actions" id="bulkActions">
    <span class="selected-count"><span id="selectedCount">0</span> rows selected</span>
    <button class="btn" id="massEditBtn">✏️ Edit Column</button>
    <button class="btn btn-danger" id="massDeleteBtn">🗑️ Delete Selected</button>
    <button class="btn" id="exportCsvBtn">📥 Export CSV</button>
    <button class="btn" id="clearSelectionBtn">✕ Clear Selection</button>
  </div>

  <div class="table-container" id="tableContainer">
    <div class="loading">
      <div class="spinner"></div>
      <span>Loading data...</span>
    </div>
  </div>

  <div class="footer">
    <div class="status-bar">
      <div class="row-info" id="rowInfo">Loading...</div>
      <div class="status-indicator" id="changesIndicator" style="display: none;">
        <span>⬤</span> <span id="changesCount">0</span> pending changes
      </div>
    </div>
    <div class="pagination" id="pagination">
      <button class="page-btn" id="prevBtn" disabled>← Previous</button>
      <span id="pageInfo">Page 1 of 1</span>
      <button class="page-btn" id="nextBtn" disabled>Next →</button>
      <select class="page-size-select" id="pageSizeSelect">
        <option value="50">50 rows</option>
        <option value="100" selected>100 rows</option>
        <option value="250">250 rows</option>
        <option value="500">500 rows</option>
      </select>
    </div>
  </div>

  <div class="confirm-modal" id="confirmModal">
    <div class="confirm-modal-content">
      <div class="confirm-modal-header">⚠️ Confirm Delete</div>
      <div class="confirm-modal-body" id="confirmModalBody">Are you sure?</div>
      <div class="confirm-modal-footer">
        <button class="btn" id="confirmCancelBtn">Cancel</button>
        <button class="btn btn-danger" id="confirmDeleteBtn">Delete</button>
      </div>
    </div>
  </div>

  <div class="mass-edit-modal" id="massEditModal">
    <div class="mass-edit-content">
      <div class="mass-edit-header">Edit Column for Selected Rows</div>
      <div class="mass-edit-row">
        <select id="massEditColumn"></select>
        <input type="text" id="massEditValue" placeholder="New value">
      </div>
      <div class="mass-edit-footer">
        <button class="btn" id="massEditCancelBtn">Cancel</button>
        <button class="btn btn-success" id="massEditApplyBtn">Apply to Selected</button>
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const tableContainer = document.getElementById('tableContainer');
    const rowInfo = document.getElementById('rowInfo');
    const pageInfo = document.getElementById('pageInfo');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const pageSizeSelect = document.getElementById('pageSizeSelect');
    const filterInput = document.getElementById('filterInput');
    const refreshBtn = document.getElementById('refreshBtn');
    const changesIndicator = document.getElementById('changesIndicator');
    const changesCount = document.getElementById('changesCount');
    const bulkActions = document.getElementById('bulkActions');
    const selectedCountEl = document.getElementById('selectedCount');
    const confirmModal = document.getElementById('confirmModal');
    const confirmModalBody = document.getElementById('confirmModalBody');
    const massEditModal = document.getElementById('massEditModal');
    const massEditColumn = document.getElementById('massEditColumn');
    const massEditValue = document.getElementById('massEditValue');

    let currentSort = { column: null, direction: 'ASC' };
    let pagination = { currentPage: 1, totalPages: 1 };
    let primaryKeys = [];
    let columns = [];
    let currentData = [];
    let pendingChanges = 0;
    let selectedCell = null;
    const errorCells = new Set();
    const errorRows = new Set();
    let newRowCounter = 0;
    const selectedRows = new Map();
    let pendingDeleteAction = null;

    refreshBtn.addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
    
    prevBtn.addEventListener('click', () => {
      if (pagination.currentPage > 1) {
        vscode.postMessage({ type: 'changePage', page: pagination.currentPage - 1 });
      }
    });

    nextBtn.addEventListener('click', () => {
      if (pagination.currentPage < pagination.totalPages) {
        vscode.postMessage({ type: 'changePage', page: pagination.currentPage + 1 });
      }
    });

    pageSizeSelect.addEventListener('change', (e) => {
      vscode.postMessage({ type: 'changePageSize', pageSize: parseInt(e.target.value) });
    });

    let filterTimeout;
    filterInput.addEventListener('input', (e) => {
      clearTimeout(filterTimeout);
      filterTimeout = setTimeout(() => {
        vscode.postMessage({ type: 'filter', filter: e.target.value });
      }, 500);
    });

    // Bulk action buttons
    document.getElementById('massEditBtn').addEventListener('click', showMassEditModal);
    document.getElementById('massDeleteBtn').addEventListener('click', confirmMassDelete);
    document.getElementById('exportCsvBtn').addEventListener('click', exportSelectedToCsv);
    document.getElementById('clearSelectionBtn').addEventListener('click', clearAllSelections);

    // Confirm modal buttons
    document.getElementById('confirmCancelBtn').addEventListener('click', () => {
      confirmModal.classList.remove('visible');
      pendingDeleteAction = null;
    });
    document.getElementById('confirmDeleteBtn').addEventListener('click', executeDelete);

    // Mass edit modal buttons
    document.getElementById('massEditCancelBtn').addEventListener('click', () => {
      massEditModal.classList.remove('visible');
    });
    document.getElementById('massEditApplyBtn').addEventListener('click', applyMassEdit);

    document.addEventListener('keydown', handleKeyDown);

    function selectCell(td) {
      if (selectedCell) {
        selectedCell.classList.remove('cell-selected');
      }
      selectedCell = td;
      if (td) {
        td.classList.add('cell-selected');
        td.focus();
      }
    }

    function getCellAt(rowIdx, colIdx) {
      const tbody = tableContainer.querySelector('tbody');
      if (!tbody) return null;
      const row = tbody.rows[rowIdx];
      if (!row) return null;
      const cell = row.cells[colIdx];
      if (!cell || !cell.classList.contains('editable')) return null;
      return cell;
    }

    function getSelectedCellPosition() {
      if (!selectedCell) return null;
      const tr = selectedCell.closest('tr');
      const tbody = tr.parentElement;
      const rowIdx = Array.from(tbody.rows).indexOf(tr);
      const colIdx = Array.from(tr.cells).indexOf(selectedCell);
      return { rowIdx, colIdx };
    }

    function handleKeyDown(e) {
      if (!selectedCell) return;
      if (selectedCell.classList.contains('editing')) return;

      const pos = getSelectedCellPosition();
      if (!pos) return;

      const { rowIdx, colIdx } = pos;
      const tbody = tableContainer.querySelector('tbody');
      const totalRows = tbody ? tbody.rows.length : 0;
      const totalCols = selectedCell.closest('tr').cells.length;

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          if (rowIdx > 0) {
            const cell = getCellAt(rowIdx - 1, colIdx);
            if (cell) selectCell(cell);
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (rowIdx < totalRows - 1) {
            const cell = getCellAt(rowIdx + 1, colIdx);
            if (cell) selectCell(cell);
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          for (let c = colIdx - 1; c >= 0; c--) {
            const cell = getCellAt(rowIdx, c);
            if (cell) { selectCell(cell); break; }
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          for (let c = colIdx + 1; c < totalCols; c++) {
            const cell = getCellAt(rowIdx, c);
            if (cell) { selectCell(cell); break; }
          }
          break;
        case 'Tab':
          e.preventDefault();
          navigateToNextCell(rowIdx, colIdx, e.shiftKey);
          break;
        case 'Enter':
          e.preventDefault();
          startEditing(selectedCell);
          break;
        case 'Escape':
          selectCell(null);
          break;
        default:
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            startEditing(selectedCell, e.key);
            e.preventDefault();
          }
      }
    }

    function navigateToNextCell(rowIdx, colIdx, reverse) {
      const tbody = tableContainer.querySelector('tbody');
      if (!tbody) return;
      const totalRows = tbody.rows.length;
      const row = tbody.rows[rowIdx];
      const totalCols = row ? row.cells.length : 0;

      let nextRow = rowIdx;
      let nextCol = colIdx;

      if (reverse) {
        for (let c = colIdx - 1; c >= 0; c--) {
          const cell = getCellAt(nextRow, c);
          if (cell) { selectCell(cell); return; }
        }
        if (nextRow > 0) {
          nextRow--;
          const prevRow = tbody.rows[nextRow];
          for (let c = prevRow.cells.length - 1; c >= 0; c--) {
            const cell = getCellAt(nextRow, c);
            if (cell) { selectCell(cell); return; }
          }
        }
      } else {
        for (let c = colIdx + 1; c < totalCols; c++) {
          const cell = getCellAt(nextRow, c);
          if (cell) { selectCell(cell); return; }
        }
        if (nextRow < totalRows - 1) {
          nextRow++;
          for (let c = 0; c < totalCols; c++) {
            const cell = getCellAt(nextRow, c);
            if (cell) { selectCell(cell); return; }
          }
        }
      }
    }

    window.addEventListener('message', (event) => {
      const message = event.data;
      switch (message.type) {
        case 'loading': showLoading(); break;
        case 'data': showData(message.result, message.pagination, message.primaryKeys); break;
        case 'error': showError(message.error); break;
        case 'saveSuccess': onSaveSuccess(message.cellId, message.rowIndex); break;
        case 'saveError': onSaveError(message.error, message.cellId, message.rowIndex); break;
        case 'deleteSuccess': onDeleteSuccess(message.rowId); break;
        case 'deleteError': onDeleteError(message.error, message.rowId); break;
        case 'insertSuccess': onInsertSuccess(message.rowId); break;
        case 'insertError': onInsertError(message.error, message.rowId); break;
      }
    });

    function showLoading() {
      tableContainer.innerHTML = '<div class="loading"><div class="spinner"></div><span>Loading data...</span></div>';
    }

    function showData(result, pag, pks) {
      pagination = pag;
      primaryKeys = pks || [];
      columns = result.columns || [];
      currentData = result.rows || [];
      selectedCell = null;
      selectedRows.clear();
      updateBulkActionsBar();
      
      const canEdit = primaryKeys.length > 0;

      if (!currentData.length && !canEdit) {
        tableContainer.innerHTML = '<div class="loading">No data found</div>';
        updatePagination();
        return;
      }

      const checkboxHeader = canEdit ? '<th class="checkbox-cell"><input type="checkbox" class="row-checkbox" id="selectAllCheckbox" title="Select all"></th>' : '';
      const headers = checkboxHeader + columns.map(col => {
        const isSorted = currentSort.column === col.name;
        const sortIcon = isSorted ? (currentSort.direction === 'ASC' ? '↑' : '↓') : '↕';
        const isPk = primaryKeys.includes(col.name);
        return \`<th data-column="\${col.name}" class="\${isSorted ? 'sorted' : ''} \${isPk ? 'pk' : ''}" title="\${col.type}">
          \${col.name}<span class="sort-icon">\${sortIcon}</span>
        </th>\`;
      }).join('') + (canEdit ? '<th style="width: 80px;">Actions</th>' : '');

      const rows = currentData.map((row, rowIndex) => {
        const pkValues = {};
        primaryKeys.forEach(pk => pkValues[pk] = row[pk]);
        const pkData = encodeURIComponent(JSON.stringify(pkValues));
        const rowId = \`row-\${rowIndex}\`;

        const checkboxCell = canEdit ? \`<td class="checkbox-cell"><input type="checkbox" class="row-checkbox row-select" data-row-index="\${rowIndex}" data-pk="\${pkData}"></td>\` : '';
        
        const cells = columns.map(col => {
          const value = row[col.name];
          const isPk = primaryKeys.includes(col.name);
          const editable = canEdit && !isPk ? 'editable' : '';
          const cellId = \`cell-\${rowIndex}-\${col.name}\`;
          
          if (value === null) {
            return \`<td class="null-value \${editable}" data-row="\${rowIndex}" data-column="\${col.name}" data-pk="\${pkData}" data-cell-id="\${cellId}">NULL</td>\`;
          }
          const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
          const escapedValue = displayValue.replace(/"/g, '&quot;');
          return \`<td class="\${editable}" data-row="\${rowIndex}" data-column="\${col.name}" data-pk="\${pkData}" data-value="\${escapedValue}" data-cell-id="\${cellId}" title="\${escapedValue}">\${displayValue}</td>\`;
        }).join('');

        const actions = canEdit ? \`
          <td>
            <div class="row-actions">
              <button class="row-btn delete" data-pk="\${pkData}" data-row-id="\${rowId}" title="Delete row">🗑️</button>
            </div>
          </td>
        \` : '';

        return \`<tr data-row="\${rowIndex}" data-row-id="\${rowId}">\${checkboxCell}\${cells}\${actions}</tr>\`;
      }).join('');

      tableContainer.innerHTML = \`
        <table>
          <thead><tr>\${headers}</tr></thead>
          <tbody>\${rows}</tbody>
        </table>
      \`;

      if (canEdit) {
        renderNewRow();
      }

      // Select all checkbox
      const selectAllCb = document.getElementById('selectAllCheckbox');
      if (selectAllCb) {
        selectAllCb.addEventListener('change', (e) => {
          const checked = e.target.checked;
          tableContainer.querySelectorAll('.row-select').forEach(cb => {
            cb.checked = checked;
            handleRowCheckbox(cb, checked);
          });
          updateBulkActionsBar();
        });
      }

      // Row checkboxes
      tableContainer.querySelectorAll('.row-select').forEach(cb => {
        cb.addEventListener('change', (e) => {
          handleRowCheckbox(e.target, e.target.checked);
          updateBulkActionsBar();
        });
      });

      // Add event listeners
      tableContainer.querySelectorAll('th[data-column]').forEach(th => {
        th.addEventListener('click', () => {
          const column = th.dataset.column;
          const direction = currentSort.column === column && currentSort.direction === 'ASC' ? 'DESC' : 'ASC';
          currentSort = { column, direction };
          vscode.postMessage({ type: 'sort', column, direction });
        });
      });

      // Cell click for selection
      tableContainer.querySelectorAll('td.editable').forEach(td => {
        td.addEventListener('click', (e) => {
          e.stopPropagation();
          selectCell(td);
          clearCellError(td.dataset.cellId);
        });
        td.addEventListener('dblclick', () => startEditing(td));
      });

      // Delete buttons with confirmation
      tableContainer.querySelectorAll('.row-btn.delete').forEach(btn => {
        btn.addEventListener('click', () => {
          const pkData = JSON.parse(decodeURIComponent(btn.dataset.pk));
          const rowId = btn.dataset.rowId;
          showDeleteConfirmation([{ pkData, rowId }], 'Are you sure you want to delete this row?');
        });
      });

      updatePagination();
    }

    function handleRowCheckbox(cb, checked) {
      const rowIndex = parseInt(cb.dataset.rowIndex);
      const pkData = JSON.parse(decodeURIComponent(cb.dataset.pk));
      if (checked) {
        selectedRows.set(rowIndex, { pkData, rowData: currentData[rowIndex] });
      } else {
        selectedRows.delete(rowIndex);
      }
    }

    function updateBulkActionsBar() {
      const count = selectedRows.size;
      selectedCountEl.textContent = count;
      if (count > 0) {
        bulkActions.classList.add('visible');
      } else {
        bulkActions.classList.remove('visible');
      }
    }

    function clearAllSelections() {
      selectedRows.clear();
      tableContainer.querySelectorAll('.row-select').forEach(cb => cb.checked = false);
      const selectAllCb = document.getElementById('selectAllCheckbox');
      if (selectAllCb) selectAllCb.checked = false;
      updateBulkActionsBar();
    }

    function showDeleteConfirmation(rowsToDelete, message) {
      pendingDeleteAction = rowsToDelete;
      confirmModalBody.textContent = message;
      confirmModal.classList.add('visible');
    }

    function executeDelete() {
      confirmModal.classList.remove('visible');
      if (!pendingDeleteAction) return;
      
      pendingDeleteAction.forEach(({ pkData, rowId }) => {
        vscode.postMessage({ type: 'deleteRow', primaryKeys: pkData, rowId });
      });
      pendingDeleteAction = null;
    }

    function confirmMassDelete() {
      const count = selectedRows.size;
      if (count === 0) return;
      
      const rowsToDelete = Array.from(selectedRows.entries()).map(([idx, data]) => ({
        pkData: data.pkData,
        rowId: \`row-\${idx}\`
      }));
      
      showDeleteConfirmation(rowsToDelete, \`Are you sure you want to delete \${count} selected row(s)? This action cannot be undone.\`);
    }

    function showMassEditModal() {
      if (selectedRows.size === 0) return;
      
      massEditColumn.innerHTML = columns
        .filter(col => !primaryKeys.includes(col.name))
        .map(col => \`<option value="\${col.name}">\${col.name} (\${col.type})</option>\`)
        .join('');
      massEditValue.value = '';
      massEditModal.classList.add('visible');
    }

    function applyMassEdit() {
      const column = massEditColumn.value;
      const value = massEditValue.value;
      
      if (!column) {
        showToast('Please select a column', 'error');
        return;
      }
      
      massEditModal.classList.remove('visible');
      
      selectedRows.forEach((data, rowIndex) => {
        const cellId = \`cell-\${rowIndex}-\${column}\`;
        vscode.postMessage({
          type: 'saveCell',
          rowIndex,
          column,
          value: value === '' ? null : value,
          primaryKeys: data.pkData,
          cellId
        });
      });
      
      showToast(\`Updating \${selectedRows.size} rows...\`, 'success');
    }

    function exportSelectedToCsv() {
      if (selectedRows.size === 0) return;
      
      const headers = columns.map(c => c.name);
      const csvRows = [headers.join(',')];
      
      selectedRows.forEach((data) => {
        const row = headers.map(h => {
          const val = data.rowData[h];
          if (val === null || val === undefined) return '';
          const str = String(val);
          if (str.includes(',') || str.includes('"') || str.includes('\\n')) {
            return '"' + str.replace(/"/g, '""') + '"';
          }
          return str;
        });
        csvRows.push(row.join(','));
      });
      
      const csvContent = csvRows.join('\\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '${this.tableName}_export.csv';
      a.click();
      URL.revokeObjectURL(url);
      showToast(\`Exported \${selectedRows.size} rows to CSV\`, 'success');
    }

    function renderNewRow() {
      const tbody = tableContainer.querySelector('tbody');
      if (!tbody) return;
      
      const tempId = ++newRowCounter;
      const rowId = \`new-row-\${tempId}\`;
      
      const checkboxCell = '<td class="checkbox-cell"></td>';
      const cells = columns.map(col => {
        const cellId = \`\${rowId}-\${col.name}\`;
        return \`<td class="editable" data-column="\${col.name}" data-cell-id="\${cellId}" data-is-new="true" data-new-row-id="\${rowId}" placeholder="Enter \${col.name}..."></td>\`;
      }).join('');
      
      const actionsCell = '<td><span style="color: var(--success-color); font-size: 11px;">Press Enter to insert</span></td>';
      const newRow = document.createElement('tr');
      newRow.className = 'new-row new-row-indicator';
      newRow.dataset.rowId = rowId;
      newRow.innerHTML = checkboxCell + cells + actionsCell;
      tbody.appendChild(newRow);
      
      // Add event listeners for new row cells
      newRow.querySelectorAll('td.editable').forEach(td => {
        td.addEventListener('click', (e) => {
          e.stopPropagation();
          selectCell(td);
          clearCellError(td.dataset.cellId);
        });
        td.addEventListener('dblclick', () => startEditingNewCell(td));
      });
    }

    function startEditing(td, initialKey) {
      if (td.classList.contains('editing')) return;
      if (td.dataset.isNew === 'true') {
        startEditingNewCell(td, initialKey);
        return;
      }
      
      const currentValue = td.dataset.value || (td.classList.contains('null-value') ? '' : td.textContent);
      const column = td.dataset.column;
      const rowIndex = parseInt(td.dataset.row);
      const cellId = td.dataset.cellId;
      
      td.classList.add('editing');
      td.innerHTML = \`<input type="text" value="\${initialKey || currentValue.replace(/"/g, '&quot;')}" />\`;
      
      const input = td.querySelector('input');
      input.focus();
      if (initialKey) {
        input.setSelectionRange(input.value.length, input.value.length);
      } else {
        input.select();
      }

      let navigateDir = null;

      const save = () => {
        const newValue = input.value;
        const oldValue = td.dataset.value || null;
        
        td.classList.remove('editing');
        
        if (newValue === '' && oldValue === null) {
          td.innerHTML = 'NULL';
          td.classList.add('null-value');
          handleNavigateAfterSave(td, navigateDir);
          return;
        }
        
        if (newValue === oldValue) {
          td.innerHTML = oldValue || 'NULL';
          if (!oldValue) td.classList.add('null-value');
          handleNavigateAfterSave(td, navigateDir);
          return;
        }

        const tr = td.closest('tr');
        tr.classList.add('saving', 'modified');
        td.innerHTML = newValue || 'NULL';
        td.dataset.value = newValue;
        if (!newValue) {
          td.classList.add('null-value');
        } else {
          td.classList.remove('null-value');
        }

        pendingChanges++;
        updateChangesIndicator();

        const pkData = JSON.parse(decodeURIComponent(td.dataset.pk));
        vscode.postMessage({
          type: 'saveCell',
          rowIndex,
          column,
          value: newValue === '' ? null : newValue,
          primaryKeys: pkData,
          cellId
        });
        
        handleNavigateAfterSave(td, navigateDir);
      };

      input.addEventListener('blur', save);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          navigateDir = 'down';
          input.blur();
        } else if (e.key === 'Tab') {
          e.preventDefault();
          navigateDir = e.shiftKey ? 'prev' : 'next';
          input.blur();
        } else if (e.key === 'Escape') {
          input.removeEventListener('blur', save);
          td.classList.remove('editing');
          const oldValue = td.dataset.value;
          td.innerHTML = oldValue || 'NULL';
          if (!oldValue) td.classList.add('null-value');
          selectCell(td);
        }
      });
    }

    function startEditingNewCell(td, initialKey) {
      if (td.classList.contains('editing')) return;
      
      const currentValue = td.dataset.value || '';
      const column = td.dataset.column;
      const rowId = td.dataset.newRowId;
      const cellId = td.dataset.cellId;
      
      td.classList.add('editing');
      td.innerHTML = \`<input type="text" value="\${initialKey || currentValue.replace(/"/g, '&quot;')}" />\`;
      
      const input = td.querySelector('input');
      input.focus();
      if (initialKey) {
        input.setSelectionRange(input.value.length, input.value.length);
      } else {
        input.select();
      }

      let navigateDir = null;
      let shouldInsert = false;

      const finishEdit = () => {
        const newValue = input.value;
        td.classList.remove('editing');
        td.dataset.value = newValue;
        td.innerHTML = newValue || '';
        
        if (shouldInsert) {
          tryInsertNewRow(td.closest('tr'));
        } else {
          handleNavigateAfterSave(td, navigateDir);
        }
      };

      input.addEventListener('blur', finishEdit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          shouldInsert = true;
          input.blur();
        } else if (e.key === 'Tab') {
          e.preventDefault();
          navigateDir = e.shiftKey ? 'prev' : 'next';
          input.blur();
        } else if (e.key === 'Escape') {
          input.removeEventListener('blur', finishEdit);
          td.classList.remove('editing');
          td.innerHTML = td.dataset.value || '';
          selectCell(td);
        }
      });
    }

    function handleNavigateAfterSave(td, direction) {
      if (!direction) {
        selectCell(td);
        return;
      }
      
      const pos = getSelectedCellPosition();
      if (!pos) {
        selectCell(td);
        return;
      }
      
      const { rowIdx, colIdx } = pos;
      const tbody = tableContainer.querySelector('tbody');
      const totalRows = tbody ? tbody.rows.length : 0;
      
      if (direction === 'down') {
        if (rowIdx < totalRows - 1) {
          const cell = getCellAt(rowIdx + 1, colIdx);
          if (cell) selectCell(cell);
        }
      } else if (direction === 'next' || direction === 'prev') {
        navigateToNextCell(rowIdx, colIdx, direction === 'prev');
      }
    }

    function tryInsertNewRow(tr) {
      const rowId = tr.dataset.rowId;
      const values = {};
      
      tr.querySelectorAll('td.editable').forEach(td => {
        const val = td.dataset.value;
        if (val && val !== '') {
          values[td.dataset.column] = val;
        }
      });
      
      if (Object.keys(values).length === 0) {
        showToast('Please fill in at least one field', 'error');
        return;
      }
      
      tr.classList.add('saving');
      vscode.postMessage({ type: 'insertRow', values, rowId });
    }

    function onSaveSuccess(cellId, rowIndex) {
      pendingChanges = Math.max(0, pendingChanges - 1);
      updateChangesIndicator();
      
      errorCells.delete(cellId);
      const cell = tableContainer.querySelector(\`[data-cell-id="\${cellId}"]\`);
      if (cell) {
        cell.classList.remove('cell-error');
      }
      
      const tr = tableContainer.querySelector(\`tr[data-row="\${rowIndex}"]\`);
      if (tr) {
        tr.classList.remove('saving', 'modified');
      }
      showToast('Saved', 'success');
    }

    function onSaveError(error, cellId, rowIndex) {
      pendingChanges = Math.max(0, pendingChanges - 1);
      updateChangesIndicator();
      
      errorCells.add(cellId);
      const cell = tableContainer.querySelector(\`[data-cell-id="\${cellId}"]\`);
      if (cell) {
        cell.classList.add('cell-error');
      }
      
      const tr = tableContainer.querySelector(\`tr[data-row="\${rowIndex}"]\`);
      if (tr) {
        tr.classList.remove('saving');
      }
      showToast('Save failed: ' + error, 'error');
    }

    function onDeleteSuccess(rowId) {
      errorRows.delete(rowId);
      showToast('Row deleted', 'success');
      vscode.postMessage({ type: 'refresh' });
    }

    function onDeleteError(error, rowId) {
      errorRows.add(rowId);
      const tr = tableContainer.querySelector(\`tr[data-row-id="\${rowId}"]\`);
      if (tr) {
        tr.classList.add('row-error');
      }
      showToast('Delete failed: ' + error, 'error');
    }

    function onInsertSuccess(rowId) {
      errorRows.delete(rowId);
      showToast('Row inserted', 'success');
      vscode.postMessage({ type: 'refresh' });
    }

    function onInsertError(error, rowId) {
      errorRows.add(rowId);
      const tr = tableContainer.querySelector(\`tr[data-row-id="\${rowId}"]\`);
      if (tr) {
        tr.classList.remove('saving');
        tr.classList.add('row-error');
      }
      showToast('Insert failed: ' + error, 'error');
    }

    function clearCellError(cellId) {
      if (errorCells.has(cellId)) {
        errorCells.delete(cellId);
        const cell = tableContainer.querySelector(\`[data-cell-id="\${cellId}"]\`);
        if (cell) {
          cell.classList.remove('cell-error');
        }
      }
    }

    function updateChangesIndicator() {
      if (pendingChanges > 0) {
        changesIndicator.style.display = 'flex';
        changesIndicator.classList.add('has-changes');
        changesCount.textContent = pendingChanges;
      } else {
        changesIndicator.style.display = 'none';
      }
    }

    function updatePagination() {
      const start = (pagination.currentPage - 1) * parseInt(pageSizeSelect.value) + 1;
      const end = Math.min(start + parseInt(pageSizeSelect.value) - 1, pagination.totalRows);
      
      rowInfo.textContent = \`Showing \${start}-\${end} of \${pagination.totalRows} rows\`;
      pageInfo.textContent = \`Page \${pagination.currentPage} of \${pagination.totalPages}\`;
      
      prevBtn.disabled = pagination.currentPage <= 1;
      nextBtn.disabled = pagination.currentPage >= pagination.totalPages;
    }

    function showError(error) {
      tableContainer.innerHTML = \`<div class="error-message"><strong>Error:</strong> \${error}</div>\`;
    }

    function showToast(message, type) {
      const toast = document.createElement('div');
      toast.className = \`toast \${type}\`;
      toast.textContent = message;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
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
