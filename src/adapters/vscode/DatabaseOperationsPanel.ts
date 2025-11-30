import * as vscode from 'vscode';
import { ConnectionManager } from '../../core/services';

export type DatabaseOperation =
  | 'createTable'
  | 'createView'
  | 'createIndex'
  | 'createUser'
  | 'createSchema'
  | 'createSequence'
  | 'createFunction'
  | 'dropTable'
  | 'dropView'
  | 'dropIndex'
  | 'truncateTable'
  | 'alterTable';

interface ColumnDefinition {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string;
  primaryKey: boolean;
  unique: boolean;
  references?: { table: string; column: string };
}

/**
 * Panel for database operations like creating tables, views, users, etc.
 */
export class DatabaseOperationsPanel {
  private static panels: Map<string, DatabaseOperationsPanel> = new Map();
  private readonly panel: vscode.WebviewPanel;
  private readonly connectionManager: ConnectionManager;
  private readonly connectionId: string;
  private readonly databaseName: string;
  private readonly operation: DatabaseOperation;
  private readonly schema: string;
  private disposables: vscode.Disposable[] = [];

  private _onSuccess = new vscode.EventEmitter<void>();
  public readonly onSuccess = this._onSuccess.event;

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    connectionManager: ConnectionManager,
    connectionId: string,
    databaseName: string,
    operation: DatabaseOperation,
    schema: string
  ) {
    this.panel = panel;
    this.connectionManager = connectionManager;
    this.connectionId = connectionId;
    this.databaseName = databaseName;
    this.operation = operation;
    this.schema = schema;

    this.panel.webview.html = this.getHtmlContent();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      message => this.handleMessage(message),
      null,
      this.disposables
    );

    this.loadSchemaInfo();
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    connectionManager: ConnectionManager,
    connectionId: string,
    databaseName: string,
    operation: DatabaseOperation,
    schema: string = 'public'
  ): DatabaseOperationsPanel {
    const key = `${connectionId}:${databaseName}:${operation}`;

    if (DatabaseOperationsPanel.panels.has(key)) {
      const existing = DatabaseOperationsPanel.panels.get(key)!;
      existing.panel.reveal();
      return existing;
    }

    const title = DatabaseOperationsPanel.getOperationTitle(operation);
    const panel = vscode.window.createWebviewPanel(
      'databaseOperations',
      title,
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    const instance = new DatabaseOperationsPanel(
      panel,
      extensionUri,
      connectionManager,
      connectionId,
      databaseName,
      operation,
      schema
    );

    DatabaseOperationsPanel.panels.set(key, instance);
    return instance;
  }

  private static getOperationTitle(operation: DatabaseOperation): string {
    const titles: Record<DatabaseOperation, string> = {
      createTable: 'Create Table',
      createView: 'Create View',
      createIndex: 'Create Index',
      createUser: 'Create User/Role',
      createSchema: 'Create Schema',
      createSequence: 'Create Sequence',
      createFunction: 'Create Function',
      dropTable: 'Drop Table',
      dropView: 'Drop View',
      dropIndex: 'Drop Index',
      truncateTable: 'Truncate Table',
      alterTable: 'Alter Table',
    };
    return titles[operation] || 'Database Operation';
  }

  private async loadSchemaInfo(): Promise<void> {
    const client = this.connectionManager.getClient(this.connectionId);
    if (!client) return;

    try {
      // Load available tables for references
      const tablesResult = await client.executeQueryOnDatabase(
        this.databaseName,
        `SELECT table_name FROM information_schema.tables 
         WHERE table_schema = '${this.schema}' AND table_type = 'BASE TABLE'
         ORDER BY table_name`
      );

      // Load available schemas
      const schemasResult = await client.executeQueryOnDatabase(
        this.databaseName,
        `SELECT schema_name FROM information_schema.schemata 
         WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
         ORDER BY schema_name`
      );

      // Load data types
      const typesResult = await client.executeQueryOnDatabase(
        this.databaseName,
        `SELECT typname FROM pg_type 
         WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'pg_catalog')
         AND typtype = 'b' ORDER BY typname`
      );

      this.sendMessage({
        type: 'schemaInfo',
        tables: tablesResult.rows.map(r => r.table_name),
        schemas: schemasResult.rows.map(r => r.schema_name),
        dataTypes: typesResult.rows.map(r => r.typname),
      });
    } catch (error) {
      console.error('Failed to load schema info:', error);
    }
  }

  private async handleMessage(message: { type: string; [key: string]: unknown }): Promise<void> {
    switch (message.type) {
      case 'execute':
        await this.executeOperation(message);
        break;
      case 'preview':
        this.previewSQL(message);
        break;
      case 'cancel':
        this.panel.dispose();
        break;
    }
  }

  private previewSQL(message: { [key: string]: unknown }): void {
    const sql = this.generateSQL(message);
    this.sendMessage({ type: 'sqlPreview', sql });
  }

  private generateSQL(message: { [key: string]: unknown }): string {
    switch (this.operation) {
      case 'createTable':
        return this.generateCreateTableSQL(message);
      case 'createView':
        return this.generateCreateViewSQL(message);
      case 'createIndex':
        return this.generateCreateIndexSQL(message);
      case 'createUser':
        return this.generateCreateUserSQL(message);
      case 'createSchema':
        return this.generateCreateSchemaSQL(message);
      case 'createSequence':
        return this.generateCreateSequenceSQL(message);
      case 'createFunction':
        return this.generateCreateFunctionSQL(message);
      case 'dropTable':
        return this.generateDropTableSQL(message);
      case 'dropView':
        return this.generateDropViewSQL(message);
      case 'dropIndex':
        return this.generateDropIndexSQL(message);
      case 'truncateTable':
        return this.generateTruncateTableSQL(message);
      case 'alterTable':
        return this.generateAlterTableSQL(message);
      default:
        return '-- Unknown operation';
    }
  }

  private generateCreateTableSQL(message: { [key: string]: unknown }): string {
    const tableName = message.tableName as string;
    const columns = message.columns as ColumnDefinition[];
    const schema = (message.schema as string) || this.schema;

    if (!tableName || !columns?.length) {
      return '-- Please provide table name and at least one column';
    }

    const primaryKeys = columns.filter(c => c.primaryKey).map(c => `"${c.name}"`);

    const columnDefs = columns.map(col => {
      let def = `  "${col.name}" ${col.type}`;
      if (!col.nullable) def += ' NOT NULL';
      if (col.unique && !col.primaryKey) def += ' UNIQUE';
      if (col.defaultValue) def += ` DEFAULT ${col.defaultValue}`;
      if (col.references) {
        def += ` REFERENCES "${schema}"."${col.references.table}"("${col.references.column}")`;
      }
      return def;
    });

    if (primaryKeys.length > 0) {
      columnDefs.push(`  PRIMARY KEY (${primaryKeys.join(', ')})`);
    }

    return `CREATE TABLE "${schema}"."${tableName}" (\n${columnDefs.join(',\n')}\n);`;
  }

  private generateCreateViewSQL(message: { [key: string]: unknown }): string {
    const viewName = message.viewName as string;
    const selectQuery = message.selectQuery as string;
    const schema = (message.schema as string) || this.schema;
    const orReplace = message.orReplace as boolean;
    const materialized = message.materialized as boolean;

    if (!viewName || !selectQuery) {
      return '-- Please provide view name and SELECT query';
    }

    const prefix = orReplace ? 'CREATE OR REPLACE' : 'CREATE';
    const viewType = materialized ? 'MATERIALIZED VIEW' : 'VIEW';

    return `${prefix} ${viewType} "${schema}"."${viewName}" AS\n${selectQuery};`;
  }

  private generateCreateIndexSQL(message: { [key: string]: unknown }): string {
    const indexName = message.indexName as string;
    const tableName = message.tableName as string;
    const columns = message.columns as string[];
    const schema = (message.schema as string) || this.schema;
    const unique = message.unique as boolean;
    const concurrent = message.concurrent as boolean;
    const method = (message.method as string) || 'btree';

    if (!indexName || !tableName || !columns?.length) {
      return '-- Please provide index name, table name, and columns';
    }

    const uniqueStr = unique ? 'UNIQUE ' : '';
    const concurrentStr = concurrent ? 'CONCURRENTLY ' : '';
    const colList = columns.map(c => `"${c}"`).join(', ');

    return `CREATE ${uniqueStr}INDEX ${concurrentStr}"${indexName}"\n  ON "${schema}"."${tableName}" USING ${method} (${colList});`;
  }

  private generateCreateUserSQL(message: { [key: string]: unknown }): string {
    const username = message.username as string;
    const password = message.password as string;
    const isRole = message.isRole as boolean;
    const canLogin = message.canLogin as boolean;
    const canCreateDB = message.canCreateDB as boolean;
    const canCreateRole = message.canCreateRole as boolean;
    const superuser = message.superuser as boolean;
    const connectionLimit = message.connectionLimit as number;

    if (!username) {
      return '-- Please provide username/role name';
    }

    const type = isRole ? 'ROLE' : 'USER';
    const options: string[] = [];

    if (canLogin) options.push('LOGIN');
    if (password) options.push(`PASSWORD '${password}'`);
    if (canCreateDB) options.push('CREATEDB');
    if (canCreateRole) options.push('CREATEROLE');
    if (superuser) options.push('SUPERUSER');
    if (connectionLimit && connectionLimit > 0) options.push(`CONNECTION LIMIT ${connectionLimit}`);

    const optionsStr = options.length > 0 ? ` WITH ${options.join(' ')}` : '';

    return `CREATE ${type} "${username}"${optionsStr};`;
  }

  private generateCreateSchemaSQL(message: { [key: string]: unknown }): string {
    const schemaName = message.schemaName as string;
    const owner = message.owner as string;
    const ifNotExists = message.ifNotExists as boolean;

    if (!schemaName) {
      return '-- Please provide schema name';
    }

    const ifNotExistsStr = ifNotExists ? 'IF NOT EXISTS ' : '';
    const ownerStr = owner ? ` AUTHORIZATION "${owner}"` : '';

    return `CREATE SCHEMA ${ifNotExistsStr}"${schemaName}"${ownerStr};`;
  }

  private generateCreateSequenceSQL(message: { [key: string]: unknown }): string {
    const sequenceName = message.sequenceName as string;
    const schema = (message.schema as string) || this.schema;
    const startWith = (message.startWith as number) || 1;
    const incrementBy = (message.incrementBy as number) || 1;
    const minValue = message.minValue as number;
    const maxValue = message.maxValue as number;
    const cache = (message.cache as number) || 1;
    const cycle = message.cycle as boolean;

    if (!sequenceName) {
      return '-- Please provide sequence name';
    }

    const options: string[] = [];
    options.push(`START WITH ${startWith}`);
    options.push(`INCREMENT BY ${incrementBy}`);
    if (minValue !== undefined) options.push(`MINVALUE ${minValue}`);
    if (maxValue !== undefined) options.push(`MAXVALUE ${maxValue}`);
    options.push(`CACHE ${cache}`);
    if (cycle) options.push('CYCLE');

    return `CREATE SEQUENCE "${schema}"."${sequenceName}"\n  ${options.join('\n  ')};`;
  }

  private generateCreateFunctionSQL(message: { [key: string]: unknown }): string {
    const functionName = message.functionName as string;
    const schema = (message.schema as string) || this.schema;
    const parameters = (message.parameters as string) || '';
    const returnType = (message.returnType as string) || 'void';
    const language = (message.language as string) || 'plpgsql';
    const body = (message.body as string) || '';
    const orReplace = message.orReplace as boolean;

    if (!functionName) {
      return '-- Please provide function name';
    }

    const prefix = orReplace ? 'CREATE OR REPLACE' : 'CREATE';

    return `${prefix} FUNCTION "${schema}"."${functionName}"(${parameters})
RETURNS ${returnType}
LANGUAGE ${language}
AS $$
${body || '-- Function body here'}
$$;`;
  }

  private generateDropTableSQL(message: { [key: string]: unknown }): string {
    const tableName = message.tableName as string;
    const schema = (message.schema as string) || this.schema;
    const ifExists = message.ifExists as boolean;
    const cascade = message.cascade as boolean;

    if (!tableName) return '-- Please provide table name';

    const ifExistsStr = ifExists ? 'IF EXISTS ' : '';
    const cascadeStr = cascade ? ' CASCADE' : '';

    return `DROP TABLE ${ifExistsStr}"${schema}"."${tableName}"${cascadeStr};`;
  }

  private generateDropViewSQL(message: { [key: string]: unknown }): string {
    const viewName = message.viewName as string;
    const schema = (message.schema as string) || this.schema;
    const ifExists = message.ifExists as boolean;
    const cascade = message.cascade as boolean;
    const materialized = message.materialized as boolean;

    if (!viewName) return '-- Please provide view name';

    const ifExistsStr = ifExists ? 'IF EXISTS ' : '';
    const cascadeStr = cascade ? ' CASCADE' : '';
    const viewType = materialized ? 'MATERIALIZED VIEW' : 'VIEW';

    return `DROP ${viewType} ${ifExistsStr}"${schema}"."${viewName}"${cascadeStr};`;
  }

  private generateDropIndexSQL(message: { [key: string]: unknown }): string {
    const indexName = message.indexName as string;
    const schema = (message.schema as string) || this.schema;
    const ifExists = message.ifExists as boolean;
    const concurrent = message.concurrent as boolean;
    const cascade = message.cascade as boolean;

    if (!indexName) return '-- Please provide index name';

    const ifExistsStr = ifExists ? 'IF EXISTS ' : '';
    const concurrentStr = concurrent ? 'CONCURRENTLY ' : '';
    const cascadeStr = cascade ? ' CASCADE' : '';

    return `DROP INDEX ${concurrentStr}${ifExistsStr}"${schema}"."${indexName}"${cascadeStr};`;
  }

  private generateTruncateTableSQL(message: { [key: string]: unknown }): string {
    const tableName = message.tableName as string;
    const schema = (message.schema as string) || this.schema;
    const restartIdentity = message.restartIdentity as boolean;
    const cascade = message.cascade as boolean;

    if (!tableName) return '-- Please provide table name';

    const restartStr = restartIdentity ? ' RESTART IDENTITY' : '';
    const cascadeStr = cascade ? ' CASCADE' : '';

    return `TRUNCATE TABLE "${schema}"."${tableName}"${restartStr}${cascadeStr};`;
  }

  private generateAlterTableSQL(message: { [key: string]: unknown }): string {
    const tableName = message.tableName as string;
    const schema = (message.schema as string) || this.schema;
    const alterType = message.alterType as string;
    const columnName = message.columnName as string;
    const newColumnName = message.newColumnName as string;
    const columnType = message.columnType as string;
    const newTableName = message.newTableName as string;

    if (!tableName) return '-- Please provide table name';

    switch (alterType) {
      case 'addColumn':
        return `ALTER TABLE "${schema}"."${tableName}"\n  ADD COLUMN "${columnName}" ${columnType};`;
      case 'dropColumn':
        return `ALTER TABLE "${schema}"."${tableName}"\n  DROP COLUMN "${columnName}";`;
      case 'renameColumn':
        return `ALTER TABLE "${schema}"."${tableName}"\n  RENAME COLUMN "${columnName}" TO "${newColumnName}";`;
      case 'renameTable':
        return `ALTER TABLE "${schema}"."${tableName}"\n  RENAME TO "${newTableName}";`;
      case 'alterColumnType':
        return `ALTER TABLE "${schema}"."${tableName}"\n  ALTER COLUMN "${columnName}" TYPE ${columnType};`;
      default:
        return '-- Please select an alter operation';
    }
  }

  private async executeOperation(message: { [key: string]: unknown }): Promise<void> {
    const client = this.connectionManager.getClient(this.connectionId);
    if (!client) {
      this.sendMessage({ type: 'error', error: 'Not connected to database' });
      return;
    }

    const sql = this.generateSQL(message);
    if (sql.startsWith('--')) {
      this.sendMessage({ type: 'error', error: sql.substring(3) });
      return;
    }

    try {
      const result = await client.executeQueryOnDatabase(this.databaseName, sql);

      if (result.error) {
        this.sendMessage({ type: 'error', error: result.error });
      } else {
        this.sendMessage({ type: 'success', message: 'Operation completed successfully!' });
        vscode.window.showInformationMessage('Database operation completed successfully!');

        // Emit success event to trigger tree refresh
        this._onSuccess.fire();
      }
    } catch (error) {
      this.sendMessage({
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private sendMessage(message: unknown): void {
    this.panel.webview.postMessage(message);
  }

  private dispose(): void {
    const key = `${this.connectionId}:${this.databaseName}:${this.operation}`;
    DatabaseOperationsPanel.panels.delete(key);
    this.panel.dispose();
    while (this.disposables.length) {
      const d = this.disposables.pop();
      if (d) d.dispose();
    }
  }

  private getHtmlContent(): string {
    const nonce = this.getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>${DatabaseOperationsPanel.getOperationTitle(this.operation)}</title>
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
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--text-primary);
      background: var(--bg-primary);
      padding: 20px;
    }
    .header {
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border-color);
    }
    .header h1 { font-size: 18px; font-weight: 600; }
    .header p { color: var(--text-secondary); font-size: 12px; margin-top: 4px; }
    .form-group {
      margin-bottom: 16px;
    }
    .form-group label {
      display: block;
      margin-bottom: 6px;
      font-weight: 500;
      font-size: 13px;
    }
    .form-group input, .form-group select, .form-group textarea {
      width: 100%;
      padding: 8px 12px;
      background: var(--bg-secondary);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      font-family: inherit;
      font-size: 13px;
    }
    .form-group input:focus, .form-group select:focus, .form-group textarea:focus {
      outline: none;
      border-color: var(--accent-color);
    }
    .form-group textarea {
      min-height: 120px;
      font-family: monospace;
    }
    .form-row {
      display: flex;
      gap: 12px;
    }
    .form-row .form-group { flex: 1; }
    .checkbox-group {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }
    .checkbox-group input[type="checkbox"] {
      width: 16px;
      height: 16px;
    }
    .columns-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
      font-size: 12px;
    }
    .columns-table th, .columns-table td {
      padding: 8px;
      border: 1px solid var(--border-color);
      text-align: left;
    }
    .columns-table th {
      background: var(--bg-secondary);
      font-weight: 600;
    }
    .columns-table input, .columns-table select {
      width: 100%;
      padding: 4px 8px;
      background: var(--bg-primary);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
      border-radius: 3px;
    }
    .columns-table input[type="checkbox"] {
      width: 16px;
    }
    .btn {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
    }
    .btn-primary {
      background: var(--accent-color);
      color: var(--vscode-button-foreground);
    }
    .btn-primary:hover { background: var(--accent-hover); }
    .btn-secondary {
      background: transparent;
      color: var(--text-primary);
      border: 1px solid var(--border-color);
    }
    .btn-secondary:hover { background: var(--bg-secondary); }
    .btn-success { background: var(--success-color); color: white; }
    .btn-danger { background: var(--error-color); color: white; }
    .btn-sm { padding: 4px 8px; font-size: 11px; }
    .actions {
      display: flex;
      gap: 12px;
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid var(--border-color);
    }
    .sql-preview {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      padding: 12px;
      font-family: monospace;
      font-size: 12px;
      white-space: pre-wrap;
      max-height: 200px;
      overflow: auto;
      margin-top: 8px;
    }
    .message {
      padding: 12px;
      border-radius: 4px;
      margin-bottom: 16px;
    }
    .message.success {
      background: rgba(76, 175, 80, 0.2);
      border: 1px solid var(--success-color);
      color: var(--success-color);
    }
    .message.error {
      background: rgba(244, 67, 54, 0.2);
      border: 1px solid var(--error-color);
      color: var(--error-color);
    }
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${DatabaseOperationsPanel.getOperationTitle(this.operation)}</h1>
    <p>Database: ${this.databaseName} | Schema: ${this.schema}</p>
  </div>

  <div id="message" class="message hidden"></div>

  <div id="formContent">
    ${this.getFormContent()}
  </div>

  <div class="form-group">
    <label>SQL Preview</label>
    <div class="sql-preview" id="sqlPreview">-- SQL will appear here</div>
  </div>

  <div class="actions">
    <button class="btn btn-primary" id="executeBtn">Execute</button>
    <button class="btn btn-secondary" id="cancelBtn">Cancel</button>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const operation = '${this.operation}';
    let schemaInfo = { tables: [], schemas: [], dataTypes: [] };

    ${this.getFormScript()}

    document.getElementById('executeBtn').addEventListener('click', () => {
      const data = getFormData();
      data.type = 'execute';
      vscode.postMessage(data);
    });

    document.getElementById('cancelBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'cancel' });
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      const msgEl = document.getElementById('message');
      
      switch (message.type) {
        case 'schemaInfo':
          schemaInfo = message;
          updateSchemaSelects();
          break;
        case 'sqlPreview':
          document.getElementById('sqlPreview').textContent = message.sql;
          break;
        case 'success':
          msgEl.className = 'message success';
          msgEl.textContent = message.message;
          msgEl.classList.remove('hidden');
          break;
        case 'error':
          msgEl.className = 'message error';
          msgEl.textContent = message.error;
          msgEl.classList.remove('hidden');
          break;
      }
    });

    function updateSchemaSelects() {
      document.querySelectorAll('.schema-select').forEach(sel => {
        const current = sel.value;
        sel.innerHTML = schemaInfo.schemas.map(s => 
          '<option value="' + s + '"' + (s === current || s === '${this.schema}' ? ' selected' : '') + '>' + s + '</option>'
        ).join('');
      });
      document.querySelectorAll('.table-select').forEach(sel => {
        sel.innerHTML = '<option value="">Select table...</option>' + 
          schemaInfo.tables.map(t => '<option value="' + t + '">' + t + '</option>').join('');
      });
      document.querySelectorAll('.type-select').forEach(sel => {
        const commonTypes = ['integer','bigint','smallint','serial','bigserial','text','varchar','char','boolean','date','timestamp','timestamptz','numeric','real','double precision','json','jsonb','uuid','bytea'];
        sel.innerHTML = commonTypes.map(t => '<option value="' + t + '">' + t + '</option>').join('');
      });
    }

    // Auto-preview on input change
    document.querySelectorAll('input, select, textarea').forEach(el => {
      el.addEventListener('input', () => {
        const data = getFormData();
        data.type = 'preview';
        vscode.postMessage(data);
      });
      el.addEventListener('change', () => {
        const data = getFormData();
        data.type = 'preview';
        vscode.postMessage(data);
      });
    });

    // Trigger initial preview
    setTimeout(() => {
      const data = getFormData();
      data.type = 'preview';
      vscode.postMessage(data);
    }, 100);
  </script>
</body>
</html>`;
  }

  private getFormContent(): string {
    switch (this.operation) {
      case 'createTable':
        return this.getCreateTableForm();
      case 'createView':
        return this.getCreateViewForm();
      case 'createIndex':
        return this.getCreateIndexForm();
      case 'createUser':
        return this.getCreateUserForm();
      case 'createSchema':
        return this.getCreateSchemaForm();
      case 'createSequence':
        return this.getCreateSequenceForm();
      case 'createFunction':
        return this.getCreateFunctionForm();
      case 'dropTable':
        return this.getDropTableForm();
      case 'dropView':
        return this.getDropViewForm();
      case 'dropIndex':
        return this.getDropIndexForm();
      case 'truncateTable':
        return this.getTruncateTableForm();
      case 'alterTable':
        return this.getAlterTableForm();
      default:
        return '<p>Unknown operation</p>';
    }
  }

  private getCreateTableForm(): string {
    return `
      <div class="form-row">
        <div class="form-group">
          <label>Schema</label>
          <select id="schema" class="schema-select"><option>${this.schema}</option></select>
        </div>
        <div class="form-group">
          <label>Table Name</label>
          <input type="text" id="tableName" placeholder="my_table">
        </div>
      </div>
      <div class="form-group">
        <label>Columns</label>
        <table class="columns-table" id="columnsTable">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Not Null</th>
              <th>PK</th>
              <th>Unique</th>
              <th>Default</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="columnsList"></tbody>
        </table>
        <button class="btn btn-secondary btn-sm" id="addColumnBtn" style="margin-top: 8px;">+ Add Column</button>
      </div>`;
  }

  private getCreateViewForm(): string {
    return `
      <div class="form-row">
        <div class="form-group">
          <label>Schema</label>
          <select id="schema" class="schema-select"><option>${this.schema}</option></select>
        </div>
        <div class="form-group">
          <label>View Name</label>
          <input type="text" id="viewName" placeholder="my_view">
        </div>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" id="orReplace">
        <label for="orReplace">CREATE OR REPLACE</label>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" id="materialized">
        <label for="materialized">Materialized View</label>
      </div>
      <div class="form-group">
        <label>SELECT Query</label>
        <textarea id="selectQuery" placeholder="SELECT * FROM ..."></textarea>
      </div>`;
  }

  private getCreateIndexForm(): string {
    return `
      <div class="form-row">
        <div class="form-group">
          <label>Schema</label>
          <select id="schema" class="schema-select"><option>${this.schema}</option></select>
        </div>
        <div class="form-group">
          <label>Table</label>
          <select id="tableName" class="table-select"><option>Select table...</option></select>
        </div>
      </div>
      <div class="form-group">
        <label>Index Name</label>
        <input type="text" id="indexName" placeholder="idx_table_column">
      </div>
      <div class="form-group">
        <label>Columns (comma-separated)</label>
        <input type="text" id="columns" placeholder="column1, column2">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Method</label>
          <select id="method">
            <option value="btree">B-tree</option>
            <option value="hash">Hash</option>
            <option value="gist">GiST</option>
            <option value="gin">GIN</option>
          </select>
        </div>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" id="unique">
        <label for="unique">Unique Index</label>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" id="concurrent">
        <label for="concurrent">Create Concurrently</label>
      </div>`;
  }

  private getCreateUserForm(): string {
    return `
      <div class="form-group">
        <label>Username / Role Name</label>
        <input type="text" id="username" placeholder="new_user">
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" id="password" placeholder="password">
      </div>
      <div class="checkbox-group">
        <input type="checkbox" id="isRole">
        <label for="isRole">Create as ROLE (instead of USER)</label>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" id="canLogin" checked>
        <label for="canLogin">Can Login</label>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" id="canCreateDB">
        <label for="canCreateDB">Can Create Databases</label>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" id="canCreateRole">
        <label for="canCreateRole">Can Create Roles</label>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" id="superuser">
        <label for="superuser">Superuser</label>
      </div>
      <div class="form-group">
        <label>Connection Limit (0 = unlimited)</label>
        <input type="number" id="connectionLimit" value="0" min="0">
      </div>`;
  }

  private getCreateSchemaForm(): string {
    return `
      <div class="form-group">
        <label>Schema Name</label>
        <input type="text" id="schemaName" placeholder="new_schema">
      </div>
      <div class="form-group">
        <label>Owner (optional)</label>
        <input type="text" id="owner" placeholder="postgres">
      </div>
      <div class="checkbox-group">
        <input type="checkbox" id="ifNotExists" checked>
        <label for="ifNotExists">IF NOT EXISTS</label>
      </div>`;
  }

  private getCreateSequenceForm(): string {
    return `
      <div class="form-row">
        <div class="form-group">
          <label>Schema</label>
          <select id="schema" class="schema-select"><option>${this.schema}</option></select>
        </div>
        <div class="form-group">
          <label>Sequence Name</label>
          <input type="text" id="sequenceName" placeholder="my_sequence">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Start With</label>
          <input type="number" id="startWith" value="1">
        </div>
        <div class="form-group">
          <label>Increment By</label>
          <input type="number" id="incrementBy" value="1">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Min Value</label>
          <input type="number" id="minValue" placeholder="No minimum">
        </div>
        <div class="form-group">
          <label>Max Value</label>
          <input type="number" id="maxValue" placeholder="No maximum">
        </div>
      </div>
      <div class="form-group">
        <label>Cache</label>
        <input type="number" id="cache" value="1" min="1">
      </div>
      <div class="checkbox-group">
        <input type="checkbox" id="cycle">
        <label for="cycle">Cycle</label>
      </div>`;
  }

  private getCreateFunctionForm(): string {
    return `
      <div class="form-row">
        <div class="form-group">
          <label>Schema</label>
          <select id="schema" class="schema-select"><option>${this.schema}</option></select>
        </div>
        <div class="form-group">
          <label>Function Name</label>
          <input type="text" id="functionName" placeholder="my_function">
        </div>
      </div>
      <div class="form-group">
        <label>Parameters</label>
        <input type="text" id="parameters" placeholder="param1 integer, param2 text">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Return Type</label>
          <input type="text" id="returnType" value="void">
        </div>
        <div class="form-group">
          <label>Language</label>
          <select id="language">
            <option value="plpgsql">PL/pgSQL</option>
            <option value="sql">SQL</option>
            <option value="plpython3u">PL/Python</option>
          </select>
        </div>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" id="orReplace" checked>
        <label for="orReplace">CREATE OR REPLACE</label>
      </div>
      <div class="form-group">
        <label>Function Body</label>
        <textarea id="body" placeholder="BEGIN
  -- Your code here
  RETURN;
END;"></textarea>
      </div>`;
  }

  private getDropTableForm(): string {
    return `
      <div class="form-row">
        <div class="form-group">
          <label>Schema</label>
          <select id="schema" class="schema-select"><option>${this.schema}</option></select>
        </div>
        <div class="form-group">
          <label>Table</label>
          <select id="tableName" class="table-select"><option>Select table...</option></select>
        </div>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" id="ifExists" checked>
        <label for="ifExists">IF EXISTS</label>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" id="cascade">
        <label for="cascade">CASCADE (drop dependent objects)</label>
      </div>
      <div class="message error" style="margin-top: 16px;">
        ⚠️ Warning: This will permanently delete the table and all its data!
      </div>`;
  }

  private getDropViewForm(): string {
    return `
      <div class="form-row">
        <div class="form-group">
          <label>Schema</label>
          <select id="schema" class="schema-select"><option>${this.schema}</option></select>
        </div>
        <div class="form-group">
          <label>View Name</label>
          <input type="text" id="viewName" placeholder="view_name">
        </div>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" id="materialized">
        <label for="materialized">Materialized View</label>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" id="ifExists" checked>
        <label for="ifExists">IF EXISTS</label>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" id="cascade">
        <label for="cascade">CASCADE</label>
      </div>`;
  }

  private getDropIndexForm(): string {
    return `
      <div class="form-row">
        <div class="form-group">
          <label>Schema</label>
          <select id="schema" class="schema-select"><option>${this.schema}</option></select>
        </div>
        <div class="form-group">
          <label>Index Name</label>
          <input type="text" id="indexName" placeholder="index_name">
        </div>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" id="ifExists" checked>
        <label for="ifExists">IF EXISTS</label>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" id="concurrent">
        <label for="concurrent">Drop Concurrently</label>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" id="cascade">
        <label for="cascade">CASCADE</label>
      </div>`;
  }

  private getTruncateTableForm(): string {
    return `
      <div class="form-row">
        <div class="form-group">
          <label>Schema</label>
          <select id="schema" class="schema-select"><option>${this.schema}</option></select>
        </div>
        <div class="form-group">
          <label>Table</label>
          <select id="tableName" class="table-select"><option>Select table...</option></select>
        </div>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" id="restartIdentity">
        <label for="restartIdentity">RESTART IDENTITY</label>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" id="cascade">
        <label for="cascade">CASCADE</label>
      </div>
      <div class="message error" style="margin-top: 16px;">
        ⚠️ Warning: This will delete all data in the table!
      </div>`;
  }

  private getAlterTableForm(): string {
    return `
      <div class="form-row">
        <div class="form-group">
          <label>Schema</label>
          <select id="schema" class="schema-select"><option>${this.schema}</option></select>
        </div>
        <div class="form-group">
          <label>Table</label>
          <select id="tableName" class="table-select"><option>Select table...</option></select>
        </div>
      </div>
      <div class="form-group">
        <label>Operation</label>
        <select id="alterType">
          <option value="">Select operation...</option>
          <option value="addColumn">Add Column</option>
          <option value="dropColumn">Drop Column</option>
          <option value="renameColumn">Rename Column</option>
          <option value="alterColumnType">Change Column Type</option>
          <option value="renameTable">Rename Table</option>
        </select>
      </div>
      <div id="alterFields"></div>`;
  }

  private getFormScript(): string {
    switch (this.operation) {
      case 'createTable':
        return this.getCreateTableScript();
      case 'createIndex':
        return this.getCreateIndexScript();
      case 'alterTable':
        return this.getAlterTableScript();
      default:
        return this.getDefaultFormScript();
    }
  }

  private getCreateTableScript(): string {
    return `
    let columnCount = 0;
    
    function addColumn() {
      const tbody = document.getElementById('columnsList');
      const row = document.createElement('tr');
      row.innerHTML = \`
        <td><input type="text" class="col-name" placeholder="column_name"></td>
        <td><select class="col-type type-select"><option>text</option></select></td>
        <td style="text-align:center"><input type="checkbox" class="col-notnull"></td>
        <td style="text-align:center"><input type="checkbox" class="col-pk"></td>
        <td style="text-align:center"><input type="checkbox" class="col-unique"></td>
        <td><input type="text" class="col-default" placeholder="default"></td>
        <td><button class="btn btn-danger btn-sm" onclick="this.closest('tr').remove()">×</button></td>
      \`;
      tbody.appendChild(row);
      updateSchemaSelects();
    }
    
    document.getElementById('addColumnBtn').addEventListener('click', addColumn);
    addColumn(); // Add first column
    
    function getFormData() {
      const columns = [];
      document.querySelectorAll('#columnsList tr').forEach(row => {
        const name = row.querySelector('.col-name').value;
        if (name) {
          columns.push({
            name,
            type: row.querySelector('.col-type').value,
            nullable: !row.querySelector('.col-notnull').checked,
            primaryKey: row.querySelector('.col-pk').checked,
            unique: row.querySelector('.col-unique').checked,
            defaultValue: row.querySelector('.col-default').value || undefined
          });
        }
      });
      return {
        schema: document.getElementById('schema').value,
        tableName: document.getElementById('tableName').value,
        columns
      };
    }`;
  }

  private getCreateIndexScript(): string {
    return `
    function getFormData() {
      const cols = document.getElementById('columns').value;
      return {
        schema: document.getElementById('schema').value,
        tableName: document.getElementById('tableName').value,
        indexName: document.getElementById('indexName').value,
        columns: cols ? cols.split(',').map(c => c.trim()) : [],
        method: document.getElementById('method').value,
        unique: document.getElementById('unique').checked,
        concurrent: document.getElementById('concurrent').checked
      };
    }`;
  }

  private getAlterTableScript(): string {
    return `
    document.getElementById('alterType').addEventListener('change', (e) => {
      const container = document.getElementById('alterFields');
      const type = e.target.value;
      
      switch(type) {
        case 'addColumn':
          container.innerHTML = \`
            <div class="form-row">
              <div class="form-group">
                <label>Column Name</label>
                <input type="text" id="columnName" placeholder="new_column">
              </div>
              <div class="form-group">
                <label>Column Type</label>
                <select id="columnType" class="type-select"><option>text</option></select>
              </div>
            </div>\`;
          break;
        case 'dropColumn':
          container.innerHTML = \`
            <div class="form-group">
              <label>Column Name</label>
              <input type="text" id="columnName" placeholder="column_to_drop">
            </div>\`;
          break;
        case 'renameColumn':
          container.innerHTML = \`
            <div class="form-row">
              <div class="form-group">
                <label>Current Name</label>
                <input type="text" id="columnName" placeholder="old_name">
              </div>
              <div class="form-group">
                <label>New Name</label>
                <input type="text" id="newColumnName" placeholder="new_name">
              </div>
            </div>\`;
          break;
        case 'alterColumnType':
          container.innerHTML = \`
            <div class="form-row">
              <div class="form-group">
                <label>Column Name</label>
                <input type="text" id="columnName" placeholder="column_name">
              </div>
              <div class="form-group">
                <label>New Type</label>
                <select id="columnType" class="type-select"><option>text</option></select>
              </div>
            </div>\`;
          break;
        case 'renameTable':
          container.innerHTML = \`
            <div class="form-group">
              <label>New Table Name</label>
              <input type="text" id="newTableName" placeholder="new_table_name">
            </div>\`;
          break;
        default:
          container.innerHTML = '';
      }
      updateSchemaSelects();
    });
    
    function getFormData() {
      return {
        schema: document.getElementById('schema').value,
        tableName: document.getElementById('tableName').value,
        alterType: document.getElementById('alterType').value,
        columnName: document.getElementById('columnName')?.value,
        newColumnName: document.getElementById('newColumnName')?.value,
        columnType: document.getElementById('columnType')?.value,
        newTableName: document.getElementById('newTableName')?.value
      };
    }`;
  }

  private getDefaultFormScript(): string {
    return `
    function getFormData() {
      const data = {};
      document.querySelectorAll('#formContent input, #formContent select, #formContent textarea').forEach(el => {
        if (el.type === 'checkbox') {
          data[el.id] = el.checked;
        } else if (el.type === 'number') {
          data[el.id] = el.value ? parseInt(el.value) : undefined;
        } else {
          data[el.id] = el.value;
        }
      });
      return data;
    }`;
  }

  private getNonce(): string {
    let text = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
  }
}
