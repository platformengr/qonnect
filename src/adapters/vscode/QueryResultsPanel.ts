import * as vscode from 'vscode';
import { QueryResult } from '../../types';

/**
 * Manages the query results webview panel (results only, no editor)
 */
export class QueryResultsPanel {
  public static currentPanel: QueryResultsPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
    this.panel.webview.html = this.getHtmlContent();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      message => this.handleMessage(message),
      null,
      this.disposables
    );
  }

  public static createOrShow(): QueryResultsPanel {
    const column = vscode.ViewColumn.Two;

    if (QueryResultsPanel.currentPanel) {
      QueryResultsPanel.currentPanel.panel.reveal(column, true);
      return QueryResultsPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'databaseResults',
      'Query Results',
      { viewColumn: column, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    QueryResultsPanel.currentPanel = new QueryResultsPanel(panel);
    return QueryResultsPanel.currentPanel;
  }

  public showLoading(): void {
    this.sendMessage({ type: 'queryStart' });
  }

  public showResults(result: QueryResult): void {
    this.sendMessage({ type: 'queryResult', result });
  }

  public showError(error: string): void {
    this.sendMessage({ type: 'error', error });
  }

  private async handleMessage(message: { type: string; [key: string]: unknown }): Promise<void> {
    switch (message.type) {
      case 'exportResults':
        vscode.window.showInformationMessage(`Export to ${message.format} - Coming soon!`);
        break;
    }
  }

  private sendMessage(message: unknown): void {
    this.panel.webview.postMessage(message);
  }

  private dispose(): void {
    QueryResultsPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  private getHtmlContent(): string {
    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Query Results</title>
  <style>
    :root {
      --bg-primary: var(--vscode-editor-background);
      --bg-secondary: var(--vscode-sideBar-background);
      --bg-tertiary: var(--vscode-editorGroupHeader-tabsBackground);
      --text-primary: var(--vscode-editor-foreground);
      --text-secondary: var(--vscode-descriptionForeground);
      --border-color: var(--vscode-panel-border);
      --accent-color: var(--vscode-button-background);
      --success-color: var(--vscode-charts-green);
      --error-color: var(--vscode-errorForeground);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--text-primary);
      background: var(--bg-primary);
      height: 100vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .header {
      display: flex;
      align-items: center;
      padding: 8px 12px;
      background: var(--bg-tertiary);
      border-bottom: 1px solid var(--border-color);
      gap: 12px;
    }

    .tabs {
      display: flex;
      gap: 4px;
    }

    .tab {
      padding: 4px 12px;
      font-size: 12px;
      background: transparent;
      color: var(--text-secondary);
      border: none;
      border-radius: 3px;
      cursor: pointer;
    }

    .tab.active {
      background: var(--accent-color);
      color: var(--vscode-button-foreground);
    }

    .info {
      font-size: 11px;
      color: var(--text-secondary);
      margin-left: auto;
    }

    .toolbar-btn {
      display: inline-flex;
      align-items: center;
      padding: 4px 8px;
      font-size: 12px;
      background: transparent;
      color: var(--text-primary);
      border: none;
      border-radius: 3px;
      cursor: pointer;
    }

    .toolbar-btn:hover {
      background: var(--vscode-toolbar-hoverBackground);
    }

    .toolbar-btn svg {
      width: 16px;
      height: 16px;
      fill: currentColor;
    }

    .content {
      flex: 1;
      overflow: auto;
    }

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

    .message-container {
      padding: 12px;
    }

    .message {
      padding: 12px 16px;
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

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-secondary);
      gap: 12px;
    }

    .spinner {
      width: 24px;
      height: 24px;
      border: 2px solid var(--border-color);
      border-top-color: var(--accent-color);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-secondary);
      gap: 8px;
    }

    .empty-state-icon {
      font-size: 48px;
      opacity: 0.5;
    }

    .messages-list {
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="tabs">
      <button class="tab active" data-tab="results">Results</button>
      <button class="tab" data-tab="messages">Messages</button>
    </div>
    <span class="info" id="info"></span>
    <button class="toolbar-btn" id="exportBtn" title="Export to CSV">
      <svg viewBox="0 0 16 16"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/></svg>
    </button>
  </div>
  
  <div class="content" id="resultsContent">
    <div class="empty-state">
      <div class="empty-state-icon">📊</div>
      <div>Execute a query to see results</div>
      <div style="font-size: 11px;">Use the command palette or right-click in SQL file</div>
    </div>
  </div>
  
  <div class="content" id="messagesContent" style="display: none;">
    <div class="messages-list" id="messagesList"></div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const resultsContent = document.getElementById('resultsContent');
    const messagesContent = document.getElementById('messagesContent');
    const messagesList = document.getElementById('messagesList');
    const info = document.getElementById('info');

    // Tabs
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const tabName = tab.dataset.tab;
        resultsContent.style.display = tabName === 'results' ? 'block' : 'none';
        messagesContent.style.display = tabName === 'messages' ? 'block' : 'none';
      });
    });

    document.getElementById('exportBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'exportResults', format: 'csv' });
    });

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
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

    window.addEventListener('message', (event) => {
      const message = event.data;
      
      switch (message.type) {
        case 'queryStart':
          resultsContent.innerHTML = '<div class="loading"><div class="spinner"></div><span>Executing query...</span></div>';
          clearMessages();
          addMessage('Executing query...', 'info');
          info.textContent = '';
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

      addMessage('Query executed successfully (' + (result.executionTime || 0) + 'ms)', 'success');

      if (!result.rows || result.rows.length === 0) {
        if (result.affectedRows !== undefined) {
          resultsContent.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✓</div><div>' + result.affectedRows + ' row(s) affected</div></div>';
          addMessage(result.affectedRows + ' row(s) affected', 'success');
        } else {
          resultsContent.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><div>Query returned no results</div></div>';
        }
        info.textContent = (result.rowCount || 0) + ' rows | ' + (result.executionTime || 0) + 'ms';
        return;
      }

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
      info.textContent = result.rowCount + ' rows | ' + (result.executionTime || 0) + 'ms';
    }

    function showError(error) {
      resultsContent.innerHTML = '<div class="message-container"><div class="message error">' + escapeHtml(error) + '</div></div>';
      addMessage('Error: ' + error, 'error');
      info.textContent = 'Error';
    }
  </script>
</body>
</html>`;
  }
}
