import * as vscode from 'vscode';
import { ConnectionManager } from '../../core/services';
import { PostgreSQLClient } from '../../core/clients/PostgreSQLClient';

/**
 * Generic object viewer panel for views, functions, procedures, triggers, etc.
 */
export class ObjectViewerPanel {
  private static panels: Map<string, ObjectViewerPanel> = new Map();
  private readonly panel: vscode.WebviewPanel;
  private readonly connectionManager: ConnectionManager;
  private readonly connectionId: string;
  private readonly databaseName: string;
  private readonly objectName: string;
  private readonly objectType: 'view' | 'function' | 'procedure' | 'trigger' | 'type' | 'sequence';
  private readonly schema: string;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    connectionManager: ConnectionManager,
    connectionId: string,
    databaseName: string,
    objectName: string,
    objectType: 'view' | 'function' | 'procedure' | 'trigger' | 'type' | 'sequence',
    schema: string
  ) {
    this.panel = panel;
    this.connectionManager = connectionManager;
    this.connectionId = connectionId;
    this.databaseName = databaseName;
    this.objectName = objectName;
    this.objectType = objectType;
    this.schema = schema;

    this.panel.webview.html = this.getLoadingHtml();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      message => this.handleMessage(message),
      null,
      this.disposables
    );

    // Load object definition
    this.loadDefinition();
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    connectionManager: ConnectionManager,
    connectionId: string,
    databaseName: string,
    objectName: string,
    objectType: 'view' | 'function' | 'procedure' | 'trigger' | 'type' | 'sequence',
    schema: string = 'public'
  ): ObjectViewerPanel {
    const key = `${connectionId}:${databaseName}:${schema}.${objectName}:${objectType}`;

    if (ObjectViewerPanel.panels.has(key)) {
      const existing = ObjectViewerPanel.panels.get(key)!;
      existing.panel.reveal();
      return existing;
    }

    const typeLabels: Record<string, string> = {
      view: '📋',
      function: 'ƒ',
      procedure: '⚙️',
      trigger: '⚡',
      type: '📦',
      sequence: '🔢',
    };

    const panel = vscode.window.createWebviewPanel(
      'objectViewer',
      `${typeLabels[objectType] || ''} ${objectName}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    const viewer = new ObjectViewerPanel(
      panel,
      extensionUri,
      connectionManager,
      connectionId,
      databaseName,
      objectName,
      objectType,
      schema
    );

    ObjectViewerPanel.panels.set(key, viewer);
    return viewer;
  }

  private async handleMessage(message: { type: string; [key: string]: unknown }): Promise<void> {
    switch (message.type) {
      case 'refresh':
        await this.loadDefinition();
        break;
      case 'executeView':
        await this.executeView();
        break;
    }
  }

  private async loadDefinition(): Promise<void> {
    const client = this.connectionManager.getClient(this.connectionId) as PostgreSQLClient;
    if (!client) {
      this.showError('Not connected to database');
      return;
    }

    try {
      let definition = '';
      let additionalInfo = '';

      switch (this.objectType) {
        case 'view':
          const viewResult = await client.executeQueryOnDatabase(
            this.databaseName,
            `SELECT pg_get_viewdef('"${this.schema}"."${this.objectName}"'::regclass, true) as definition`
          );
          definition = String(
            viewResult.rows[0]?.definition || 'Unable to retrieve view definition'
          );
          break;

        case 'function':
        case 'procedure':
          const funcResult = await client.executeQueryOnDatabase(
            this.databaseName,
            `SELECT pg_get_functiondef(p.oid) as definition,
                    p.provolatile,
                    CASE p.provolatile 
                      WHEN 'i' THEN 'IMMUTABLE'
                      WHEN 's' THEN 'STABLE'
                      WHEN 'v' THEN 'VOLATILE'
                    END as volatility,
                    p.prosecdef as security_definer,
                    l.lanname as language
             FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
             JOIN pg_language l ON l.oid = p.prolang
             WHERE n.nspname = '${this.schema}' AND p.proname = '${this.objectName}'
             LIMIT 1`
          );
          if (funcResult.rows[0]) {
            definition = String(funcResult.rows[0].definition || '');
            additionalInfo = `Language: ${funcResult.rows[0].language}\nVolatility: ${funcResult.rows[0].volatility}\nSecurity Definer: ${funcResult.rows[0].security_definer ? 'Yes' : 'No'}`;
          }
          break;

        case 'trigger':
          const trigResult = await client.executeQueryOnDatabase(
            this.databaseName,
            `SELECT pg_get_triggerdef(t.oid, true) as definition,
                    t.tgenabled,
                    CASE t.tgenabled
                      WHEN 'O' THEN 'ORIGIN and LOCAL'
                      WHEN 'D' THEN 'DISABLED'
                      WHEN 'R' THEN 'REPLICA'
                      WHEN 'A' THEN 'ALWAYS'
                    END as status
             FROM pg_trigger t
             JOIN pg_class c ON c.oid = t.tgrelid
             JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE t.tgname = '${this.objectName}'
             LIMIT 1`
          );
          if (trigResult.rows[0]) {
            definition = String(trigResult.rows[0].definition || '');
            additionalInfo = `Status: ${trigResult.rows[0].status}`;
          }
          break;

        case 'type':
          const typeResult = await client.executeQueryOnDatabase(
            this.databaseName,
            `SELECT t.typname,
                    t.typtype,
                    CASE t.typtype
                      WHEN 'c' THEN 'composite'
                      WHEN 'd' THEN 'domain'
                      WHEN 'e' THEN 'enum'
                      WHEN 'r' THEN 'range'
                      WHEN 'b' THEN 'base'
                    END as type_category,
                    CASE WHEN t.typtype = 'e' THEN
                      (SELECT array_agg(enumlabel ORDER BY enumsortorder)
                       FROM pg_enum WHERE enumtypid = t.oid)
                    END as enum_values,
                    CASE WHEN t.typtype = 'c' THEN
                      (SELECT json_agg(json_build_object('name', a.attname, 'type', pg_catalog.format_type(a.atttypid, a.atttypmod)))
                       FROM pg_attribute a WHERE a.attrelid = t.typrelid AND a.attnum > 0)
                    END as composite_attrs
             FROM pg_type t
             JOIN pg_namespace n ON n.oid = t.typnamespace
             WHERE n.nspname = '${this.schema}' AND t.typname = '${this.objectName}'`
          );
          if (typeResult.rows[0]) {
            const row = typeResult.rows[0] as Record<string, unknown>;
            definition = `-- Type: ${row.typname}\n-- Category: ${row.type_category}\n\n`;
            if (row.type_category === 'enum' && Array.isArray(row.enum_values)) {
              definition += `CREATE TYPE "${this.schema}"."${this.objectName}" AS ENUM (\n  ${(row.enum_values as string[]).map((v: string) => `'${v}'`).join(',\n  ')}\n);`;
            } else if (row.type_category === 'composite' && Array.isArray(row.composite_attrs)) {
              const attrs = (row.composite_attrs as Array<{ name: string; type: string }>)
                .map(a => `  ${a.name} ${a.type}`)
                .join(',\n');
              definition += `CREATE TYPE "${this.schema}"."${this.objectName}" AS (\n${attrs}\n);`;
            }
          }
          break;

        case 'sequence':
          const seqResult = await client.executeQueryOnDatabase(
            this.databaseName,
            `SELECT s.seqstart, s.seqincrement, s.seqmax, s.seqmin, s.seqcache, s.seqcycle,
                    last_value, is_called
             FROM pg_sequences ps
             JOIN pg_sequence s ON s.seqrelid = ('"${this.schema}"."${this.objectName}"')::regclass
             WHERE ps.schemaname = '${this.schema}' AND ps.sequencename = '${this.objectName}'`
          );
          if (seqResult.rows[0]) {
            const row = seqResult.rows[0];
            definition = `-- Sequence: ${this.schema}.${this.objectName}\n\n`;
            definition += `CREATE SEQUENCE "${this.schema}"."${this.objectName}"\n`;
            definition += `  START WITH ${row.seqstart}\n`;
            definition += `  INCREMENT BY ${row.seqincrement}\n`;
            definition += `  MINVALUE ${row.seqmin}\n`;
            definition += `  MAXVALUE ${row.seqmax}\n`;
            definition += `  CACHE ${row.seqcache}`;
            if (row.seqcycle) definition += `\n  CYCLE`;
            definition += ';';
            additionalInfo = `Last Value: ${row.last_value || 'N/A'}\nIs Called: ${row.is_called ? 'Yes' : 'No'}`;
          }
          break;
      }

      this.panel.webview.html = this.getHtmlContent(definition, additionalInfo);
    } catch (error) {
      this.showError(error instanceof Error ? error.message : String(error));
    }
  }

  private async executeView(): Promise<void> {
    if (this.objectType !== 'view') return;

    const client = this.connectionManager.getClient(this.connectionId);
    if (!client) {
      this.showError('Not connected to database');
      return;
    }

    try {
      const result = await client.executeQueryOnDatabase(
        this.databaseName,
        `SELECT * FROM "${this.schema}"."${this.objectName}" LIMIT 1000`
      );
      this.panel.webview.postMessage({ type: 'viewData', result });
    } catch (error) {
      this.showError(error instanceof Error ? error.message : String(error));
    }
  }

  private showError(error: string): void {
    this.panel.webview.html = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-errorForeground); }
    .error { background: var(--vscode-inputValidation-errorBackground); padding: 16px; border-radius: 6px; }
  </style>
</head>
<body>
  <div class="error"><strong>Error:</strong> ${error}</div>
</body>
</html>`;
  }

  private getLoadingHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: var(--vscode-font-family); display: flex; align-items: center; justify-content: center; height: 100vh; }
    .spinner { width: 24px; height: 24px; border: 2px solid var(--vscode-panel-border); border-top-color: var(--vscode-button-background); border-radius: 50%; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body><div class="spinner"></div></body>
</html>`;
  }

  private getHtmlContent(definition: string, additionalInfo: string): string {
    const nonce = this.getNonce();
    const typeLabels: Record<string, string> = {
      view: 'View',
      function: 'Function',
      procedure: 'Stored Procedure',
      trigger: 'Trigger',
      type: 'User-Defined Type',
      sequence: 'Sequence',
    };

    const escapedDefinition = definition
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>${this.objectName}</title>
  <style>
    :root {
      --bg-primary: var(--vscode-editor-background);
      --bg-secondary: var(--vscode-sideBar-background);
      --text-primary: var(--vscode-editor-foreground);
      --text-secondary: var(--vscode-descriptionForeground);
      --border-color: var(--vscode-panel-border);
      --accent-color: var(--vscode-button-background);
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

    .title { font-size: 16px; font-weight: 600; }
    .type-badge {
      font-size: 11px;
      padding: 2px 8px;
      background: var(--accent-color);
      color: var(--vscode-button-foreground);
      border-radius: 4px;
      margin-left: 8px;
    }

    .toolbar { display: flex; gap: 8px; }

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
    .btn:hover { background: var(--vscode-button-hoverBackground); }

    .content { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

    .info-bar {
      padding: 8px 16px;
      background: var(--vscode-editorGroupHeader-tabsBackground);
      border-bottom: 1px solid var(--border-color);
      font-size: 12px;
      color: var(--text-secondary);
      white-space: pre-line;
    }

    .code-container {
      flex: 1;
      overflow: auto;
      padding: 16px;
    }

    pre {
      font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
      font-size: 13px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    .keyword { color: var(--vscode-symbolIcon-keywordForeground, #569cd6); }
    .string { color: var(--vscode-symbolIcon-stringForeground, #ce9178); }
    .comment { color: var(--vscode-symbolIcon-commentForeground, #6a9955); }
    .function { color: var(--vscode-symbolIcon-functionForeground, #dcdcaa); }

    .data-container { display: none; flex: 1; overflow: auto; }
    .data-container.active { display: block; }

    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td {
      padding: 8px 12px;
      text-align: left;
      border-bottom: 1px solid var(--border-color);
      white-space: nowrap;
    }
    th {
      background: var(--vscode-editorGroupHeader-tabsBackground);
      font-weight: 600;
      position: sticky;
      top: 0;
    }

    .tabs {
      display: flex;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
    }
    .tab {
      padding: 8px 16px;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      font-size: 13px;
    }
    .tab:hover { background: var(--vscode-list-hoverBackground); }
    .tab.active { border-bottom-color: var(--accent-color); }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <span class="title">${this.objectName}</span>
      <span class="type-badge">${typeLabels[this.objectType]}</span>
    </div>
    <div class="toolbar">
      ${this.objectType === 'view' ? '<button class="btn" id="executeBtn">▶ Execute</button>' : ''}
      <button class="btn" id="refreshBtn">↻ Refresh</button>
      <button class="btn" id="copyBtn">📋 Copy</button>
    </div>
  </div>

  ${
    this.objectType === 'view'
      ? `
  <div class="tabs">
    <div class="tab active" data-tab="definition">Definition</div>
    <div class="tab" data-tab="data">Data</div>
  </div>
  `
      : ''
  }

  <div class="content">
    ${additionalInfo ? `<div class="info-bar">${additionalInfo}</div>` : ''}
    <div class="code-container" id="codeContainer">
      <pre id="code">${this.highlightSql(escapedDefinition)}</pre>
    </div>
    <div class="data-container" id="dataContainer"></div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const codeEl = document.getElementById('code');
    const codeContainer = document.getElementById('codeContainer');
    const dataContainer = document.getElementById('dataContainer');

    document.getElementById('refreshBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'refresh' });
    });

    document.getElementById('copyBtn').addEventListener('click', () => {
      navigator.clipboard.writeText(codeEl.textContent || '');
    });

    const executeBtn = document.getElementById('executeBtn');
    if (executeBtn) {
      executeBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'executeView' });
      });
    }

    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const tabName = tab.dataset.tab;
        if (tabName === 'definition') {
          codeContainer.style.display = 'block';
          dataContainer.classList.remove('active');
        } else {
          codeContainer.style.display = 'none';
          dataContainer.classList.add('active');
        }
      });
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'viewData') {
        showViewData(message.result);
      }
    });

    function showViewData(result) {
      if (!result.rows || result.rows.length === 0) {
        dataContainer.innerHTML = '<div style="padding: 20px; color: var(--text-secondary);">No data returned</div>';
        return;
      }

      const headers = result.columns.map(col => '<th>' + col.name + '</th>').join('');
      const rows = result.rows.map(row => {
        const cells = result.columns.map(col => {
          const value = row[col.name];
          if (value === null) return '<td style="color: var(--text-secondary); font-style: italic;">NULL</td>';
          return '<td>' + String(value) + '</td>';
        }).join('');
        return '<tr>' + cells + '</tr>';
      }).join('');

      dataContainer.innerHTML = '<table><thead><tr>' + headers + '</tr></thead><tbody>' + rows + '</tbody></table>';
      
      // Switch to data tab
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelector('[data-tab="data"]').classList.add('active');
      codeContainer.style.display = 'none';
      dataContainer.classList.add('active');
    }
  </script>
</body>
</html>`;
  }

  private highlightSql(sql: string): string {
    const keywords = [
      'SELECT',
      'FROM',
      'WHERE',
      'JOIN',
      'LEFT',
      'RIGHT',
      'INNER',
      'OUTER',
      'ON',
      'AND',
      'OR',
      'NOT',
      'IN',
      'AS',
      'CREATE',
      'ALTER',
      'DROP',
      'TABLE',
      'VIEW',
      'FUNCTION',
      'PROCEDURE',
      'TRIGGER',
      'TYPE',
      'SEQUENCE',
      'RETURNS',
      'RETURN',
      'BEGIN',
      'END',
      'IF',
      'THEN',
      'ELSE',
      'ELSIF',
      'LOOP',
      'FOR',
      'WHILE',
      'DECLARE',
      'LANGUAGE',
      'IMMUTABLE',
      'STABLE',
      'VOLATILE',
      'SECURITY',
      'DEFINER',
      'INVOKER',
      'NULL',
      'NOT NULL',
      'DEFAULT',
      'PRIMARY',
      'KEY',
      'FOREIGN',
      'REFERENCES',
      'UNIQUE',
      'INDEX',
      'CONSTRAINT',
      'CHECK',
      'INSERT',
      'UPDATE',
      'DELETE',
      'INTO',
      'VALUES',
      'SET',
      'ORDER',
      'BY',
      'GROUP',
      'HAVING',
      'LIMIT',
      'OFFSET',
      'UNION',
      'INTERSECT',
      'EXCEPT',
      'CASE',
      'WHEN',
      'CAST',
      'COALESCE',
      'NULLIF',
      'EXISTS',
      'ANY',
      'ALL',
      'SOME',
      'LIKE',
      'ILIKE',
      'BETWEEN',
      'IS',
      'TRUE',
      'FALSE',
      'AFTER',
      'BEFORE',
      'EACH',
      'ROW',
      'EXECUTE',
      'PLPGSQL',
      'SQL',
      'WITH',
      'RECURSIVE',
      'MATERIALIZED',
      'ENUM',
      'AS \\$\\$',
      '\\$\\$',
      'START',
      'INCREMENT',
      'MINVALUE',
      'MAXVALUE',
      'CACHE',
      'CYCLE',
      'NO CYCLE',
    ];

    let highlighted = sql;

    // Highlight comments
    highlighted = highlighted.replace(/(--.*$)/gm, '<span class="comment">$1</span>');

    // Highlight strings
    highlighted = highlighted.replace(/('(?:[^'\\]|\\.)*')/g, '<span class="string">$1</span>');

    // Highlight keywords
    const keywordPattern = new RegExp(`\\b(${keywords.join('|')})\\b`, 'gi');
    highlighted = highlighted.replace(keywordPattern, '<span class="keyword">$1</span>');

    return highlighted;
  }

  private dispose(): void {
    const key = `${this.connectionId}:${this.databaseName}:${this.schema}.${this.objectName}:${this.objectType}`;
    ObjectViewerPanel.panels.delete(key);
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
}
