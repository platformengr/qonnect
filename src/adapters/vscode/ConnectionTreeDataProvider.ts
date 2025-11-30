import * as vscode from 'vscode';
import { ConnectionManager } from '../../core/services';
import { IConnectionStorage, IDatabaseClient } from '../../core/interfaces';
import { TriggerInfo, ProcedureInfo, DatabaseInfo, RoleInfo } from '../../core';
import {
  ConnectionConfig,
  ConnectionStatus,
  DatabaseType,
  TableInfo,
  ColumnInfo,
  IndexInfo,
  ViewInfo,
  FunctionInfo,
} from '../../types';
import {
  TreeItemType,
  DatabaseTreeItem,
  ConnectionTreeItem,
  CategoryTreeItem,
  TableTreeItem,
  ColumnTreeItem,
  ViewTreeItem,
  FunctionTreeItem,
  ProcedureTreeItem,
  TypeTreeItem,
  SequenceTreeItem,
  TriggerTreeItem,
} from './tree-items';

// Re-export tree items for external use
export {
  TreeItemType,
  DatabaseTreeItem,
  ConnectionTreeItem,
  CategoryTreeItem,
  TableTreeItem,
  ColumnTreeItem,
  ViewTreeItem,
  FunctionTreeItem,
  ProcedureTreeItem,
  TypeTreeItem,
  SequenceTreeItem,
  TriggerTreeItem,
};

// ============================================================================
// Types
// ============================================================================

interface SchemaObjectsCache {
  tables: TableInfo[];
  views: ViewInfo[];
  functions: FunctionInfo[];
  procedures: ProcedureInfo[];
}

interface PgTypeInfo {
  typname: string;
  type_category: string;
}

interface PgSequenceInfo {
  sequencename: string;
}

// ============================================================================
// Connection Tree Data Provider
// ============================================================================

/**
 * Tree data provider for the database connections view
 * Implements PostgreSQL-specific tree structure
 */
export class ConnectionTreeDataProvider implements vscode.TreeDataProvider<DatabaseTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<DatabaseTreeItem | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private schemaObjectsCache = new Map<string, SchemaObjectsCache>();
  private tableInfoCache = new Map<string, TableInfo>();
  private triggersCache = new Map<string, TriggerInfo[]>();
  private versionCache = new Map<string, string>();

  constructor(
    private readonly storage: IConnectionStorage,
    private readonly connectionManager: ConnectionManager
  ) {
    this.subscribeToConnectionEvents();
  }

  // ============================================================================
  // Public API
  // ============================================================================

  refresh(item?: DatabaseTreeItem): void {
    this._onDidChangeTreeData.fire(item);
  }

  getTreeItem(element: DatabaseTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: DatabaseTreeItem): Promise<DatabaseTreeItem[]> {
    try {
      if (!element) {
        return this.getRootElements();
      }
      return this.getChildElements(element);
    } catch (error) {
      console.error('Error getting tree children:', error);
      return [];
    }
  }

  /**
   * Clear cache for a specific tree item
   */
  public clearCacheForItem(item: DatabaseTreeItem): void {
    if (!item.data) return;

    const data = item.data as Record<string, string>;

    if (this.isConnectionLevelItem(item)) {
      this.clearConnectionCache(item);
      return;
    }

    this.clearItemSpecificCache(item, data);
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  private subscribeToConnectionEvents(): void {
    this.connectionManager.onConnectionEvent(event => {
      if (event.type === 'connected' || event.type === 'disconnected') {
        this.clearCacheForConnection(event.connectionId);
      }
      this.refresh();
    });
  }

  // ============================================================================
  // Cache Management
  // ============================================================================

  private clearCacheForConnection(connectionId: string): void {
    this.clearCacheByPrefix(this.schemaObjectsCache, connectionId);
    this.clearCacheByPrefix(this.tableInfoCache, connectionId);
    this.clearCacheByPrefix(this.triggersCache, connectionId);
    this.versionCache.delete(connectionId);
  }

  private clearCacheByPrefix<T>(cache: Map<string, T>, prefix: string): void {
    for (const key of cache.keys()) {
      if (key.startsWith(prefix)) {
        cache.delete(key);
      }
    }
  }

  private isConnectionLevelItem(item: DatabaseTreeItem): boolean {
    return item.itemType === 'connection' || !item.data?.connectionId;
  }

  private clearConnectionCache(item: DatabaseTreeItem): void {
    if ('config' in item) {
      this.clearCacheForConnection((item as ConnectionTreeItem).config.id);
    }
  }

  private clearItemSpecificCache(item: DatabaseTreeItem, data: Record<string, string>): void {
    const { connectionId, databaseName, schemaName, tableName } = data;

    switch (item.itemType) {
      case 'database':
        this.clearDatabaseCache(connectionId, databaseName);
        break;
      case 'schema':
      case 'tables-folder':
      case 'views-folder':
      case 'functions-folder':
      case 'procedures-folder':
      case 'types-folder':
      case 'sequences-folder':
        this.clearSchemaCache(connectionId, databaseName, schemaName);
        break;
      case 'table':
      case 'columns-folder':
      case 'index-folder':
      case 'triggers-folder':
        this.clearTableCache(connectionId, databaseName, schemaName, tableName);
        break;
      default:
        this.clearCacheForConnection(connectionId);
    }
  }

  private clearDatabaseCache(connectionId: string, databaseName: string): void {
    const prefix = `${connectionId}:${databaseName}:`;
    this.clearCacheByPrefix(this.schemaObjectsCache, prefix);
  }

  private clearSchemaCache(connectionId: string, databaseName: string, schemaName: string): void {
    if (schemaName) {
      this.schemaObjectsCache.delete(`${connectionId}:${databaseName}:${schemaName}`);
    }
  }

  private clearTableCache(
    connectionId: string,
    databaseName: string,
    schemaName: string,
    tableName: string
  ): void {
    if (tableName) {
      const tableKey = `${connectionId}:${databaseName}:${schemaName}:${tableName}`;
      this.tableInfoCache.delete(tableKey);
      this.triggersCache.delete(`${tableKey}:triggers`);
    }
  }

  // ============================================================================
  // Root Elements
  // ============================================================================

  private async getRootElements(): Promise<DatabaseTreeItem[]> {
    const [categories, connections] = await Promise.all([
      this.storage.getCategories(),
      this.storage.getConnections(),
    ]);

    const items: DatabaseTreeItem[] = [];

    for (const category of categories) {
      items.push(new CategoryTreeItem(category));
    }

    const uncategorized = connections.filter(c => !c.categoryId);
    for (const conn of uncategorized) {
      items.push(this.createConnectionItem(conn));
    }

    return items;
  }

  private createConnectionItem(conn: ConnectionConfig): ConnectionTreeItem {
    const status = this.connectionManager.getConnectionStatus(conn.id);
    const version = this.versionCache.get(conn.id);
    return new ConnectionTreeItem(conn, status, version);
  }

  // ============================================================================
  // Child Element Routing
  // ============================================================================

  private async getChildElements(element: DatabaseTreeItem): Promise<DatabaseTreeItem[]> {
    const handlers: Record<string, (el: DatabaseTreeItem) => Promise<DatabaseTreeItem[]>> = {
      category: el => this.getCategoryChildren(el as CategoryTreeItem),
      connection: el => this.getConnectionChildren(el as ConnectionTreeItem),
      'saved-queries-folder': el => this.getSavedQueriesChildren(el),
      'security-folder': el => this.getSecurityChildren(el),
      database: el => this.getDatabaseChildren(el),
      schema: el => this.getSchemaChildren(el),
      'tables-folder': el => this.getTablesChildren(el),
      'views-folder': el => this.getViewsChildren(el),
      'functions-folder': el => this.getFunctionsChildren(el),
      'procedures-folder': el => this.getProceduresChildren(el),
      'types-folder': el => this.getTypesChildren(el),
      'sequences-folder': el => this.getSequencesChildren(el),
      table: el => this.getTableChildren(el as TableTreeItem),
      'columns-folder': el => this.getColumnsChildren(el),
      'index-folder': el => this.getIndexesChildren(el),
      'triggers-folder': el => this.getTriggersChildren(el),
    };

    const handler = handlers[element.itemType];
    return handler ? handler(element) : [];
  }

  // ============================================================================
  // Category Children
  // ============================================================================

  private async getCategoryChildren(category: CategoryTreeItem): Promise<DatabaseTreeItem[]> {
    const connections = await this.storage.getConnectionsByCategory(category.category.id);
    return connections.map(conn => this.createConnectionItem(conn));
  }

  // ============================================================================
  // Saved Queries Children
  // ============================================================================

  private async getSavedQueriesChildren(element: DatabaseTreeItem): Promise<DatabaseTreeItem[]> {
    const { connectionId } = element.data as { connectionId: string };
    const savedQueries = await this.storage.getSavedQueries(connectionId);

    if (savedQueries.length === 0) {
      return [this.createEmptyQueriesItem()];
    }

    return savedQueries.map(query => this.createSavedQueryItem(connectionId, query));
  }

  private createEmptyQueriesItem(): DatabaseTreeItem {
    const emptyItem = new DatabaseTreeItem(
      'saved-query',
      'No saved queries',
      vscode.TreeItemCollapsibleState.None,
      { empty: true }
    );
    emptyItem.description = 'Right-click to add';
    return emptyItem;
  }

  private createSavedQueryItem(
    connectionId: string,
    query: { id: string; name: string; sql: string; database?: string }
  ): DatabaseTreeItem {
    const item = new DatabaseTreeItem(
      'saved-query',
      query.name,
      vscode.TreeItemCollapsibleState.None,
      { connectionId, queryId: query.id, query: query.sql }
    );
    item.tooltip = query.sql;
    item.description = query.database || '';
    item.contextValue = 'saved-query';
    item.command = {
      command: 'qonnect.openSavedQuery',
      title: 'Open Query',
      arguments: [item],
    };
    return item;
  }

  // ============================================================================
  // Connection Children
  // ============================================================================

  private async getConnectionChildren(connection: ConnectionTreeItem): Promise<DatabaseTreeItem[]> {
    const client = await this.ensureConnected(connection);
    if (!client) {
      return [this.createConnectionFailedItem(connection.config.id)];
    }

    try {
      await this.cacheVersionIfNeeded(connection.config.id, client);
      return await this.buildConnectionChildItems(connection.config.id, client);
    } catch (error) {
      console.error('Error fetching connection children:', error);
      return [this.createErrorItem(error)];
    }
  }

  private async ensureConnected(connection: ConnectionTreeItem): Promise<IDatabaseClient | null> {
    let client = this.connectionManager.getClient(connection.config.id);

    if (client && client.status === ConnectionStatus.Connected) {
      return client;
    }

    try {
      vscode.window.setStatusBarMessage(`Connecting to ${connection.config.name}...`, 3000);
      await this.connectionManager.connect(connection.config);
      client = this.connectionManager.getClient(connection.config.id);

      if (!client || client.status !== ConnectionStatus.Connected) {
        return null;
      }

      this.refresh();
      return client;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to connect: ${message}`);
      return null;
    }
  }

  private createConnectionFailedItem(connectionId: string): DatabaseTreeItem {
    return new DatabaseTreeItem(
      'database',
      'Connection failed. Click to retry.',
      vscode.TreeItemCollapsibleState.None,
      { message: 'connection-failed', connectionId }
    );
  }

  private createErrorItem(error: unknown): DatabaseTreeItem {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new DatabaseTreeItem(
      'database',
      `Error: ${message}`,
      vscode.TreeItemCollapsibleState.None,
      { error: true }
    );
  }

  private async cacheVersionIfNeeded(connectionId: string, client: IDatabaseClient): Promise<void> {
    if (this.versionCache.has(connectionId)) return;

    const version = await client.getVersion();
    const match = version.match(/PostgreSQL\s+([\d.]+\s*\([^)]+\))/i);
    this.versionCache.set(connectionId, match ? match[1] : version.substring(0, 30));
  }

  private async buildConnectionChildItems(
    connectionId: string,
    client: IDatabaseClient
  ): Promise<DatabaseTreeItem[]> {
    const databases = await client.getDatabases();
    const items: DatabaseTreeItem[] = [];

    items.push(this.createFolderItem('saved-queries-folder', 'Saved Queries', { connectionId }));
    items.push(this.createFolderItem('security-folder', 'Security', { connectionId }));

    for (const db of databases) {
      items.push(this.createDatabaseItem(connectionId, db));
    }

    return items;
  }

  private createFolderItem(
    itemType: TreeItemType,
    label: string,
    data: Record<string, unknown>
  ): DatabaseTreeItem {
    const item = new DatabaseTreeItem(
      itemType,
      label,
      vscode.TreeItemCollapsibleState.Collapsed,
      data
    );
    item.contextValue = itemType;
    return item;
  }

  private createDatabaseItem(connectionId: string, db: DatabaseInfo): DatabaseTreeItem {
    const item = new DatabaseTreeItem(
      'database',
      db.name,
      vscode.TreeItemCollapsibleState.Collapsed,
      { connectionId, databaseName: db.name, size: db.size }
    );
    item.description = db.size;
    item.tooltip = `${db.name}\nSize: ${db.size}\nOwner: ${db.owner}`;
    item.contextValue = 'database';
    return item;
  }

  // ============================================================================
  // Security Children
  // ============================================================================

  private async getSecurityChildren(element: DatabaseTreeItem): Promise<DatabaseTreeItem[]> {
    const { connectionId } = element.data as { connectionId: string };
    const client = this.connectionManager.getClient(connectionId);

    if (!client || client.status !== ConnectionStatus.Connected) {
      return [];
    }

    try {
      const roles = await client.getRoles();
      return roles.map(role => this.createRoleItem(role));
    } catch (error) {
      console.error('Error fetching roles:', error);
      return [];
    }
  }

  private createRoleItem(role: RoleInfo): DatabaseTreeItem {
    const item = new DatabaseTreeItem('role', role.name, vscode.TreeItemCollapsibleState.None, {
      role,
    });
    item.description = role.isSuper ? 'superuser' : role.canLogin ? 'login' : '';
    return item;
  }

  // ============================================================================
  // Database Children
  // ============================================================================

  private async getDatabaseChildren(element: DatabaseTreeItem): Promise<DatabaseTreeItem[]> {
    const { connectionId, databaseName } = element.data as {
      connectionId: string;
      databaseName: string;
    };

    const client = this.connectionManager.getClient(connectionId);
    if (!client || client.status !== ConnectionStatus.Connected) {
      return [];
    }

    try {
      const schemas = await client.getSchemas(databaseName);
      return schemas.map(schemaName =>
        this.createSchemaItem(connectionId, databaseName, schemaName)
      );
    } catch (error) {
      console.error('Error fetching database children:', error);
      return [this.createSchemaErrorItem(error)];
    }
  }

  private createSchemaItem(
    connectionId: string,
    databaseName: string,
    schemaName: string
  ): DatabaseTreeItem {
    const item = new DatabaseTreeItem(
      'schema',
      schemaName,
      vscode.TreeItemCollapsibleState.Collapsed,
      { connectionId, schemaName, databaseName }
    );
    item.contextValue = 'schema';
    return item;
  }

  private createSchemaErrorItem(error: unknown): DatabaseTreeItem {
    const message = error instanceof Error ? error.message : 'Unknown';
    return new DatabaseTreeItem(
      'schema',
      `Error: ${message}`,
      vscode.TreeItemCollapsibleState.None,
      { error: true }
    );
  }

  // ============================================================================
  // Schema Children
  // ============================================================================

  private async getSchemaChildren(element: DatabaseTreeItem): Promise<DatabaseTreeItem[]> {
    const { connectionId, schemaName, databaseName } = element.data as {
      connectionId: string;
      schemaName: string;
      databaseName: string;
    };

    const client = this.connectionManager.getClient(connectionId);
    if (!client || client.status !== ConnectionStatus.Connected) {
      return [];
    }

    // Get database type from client config
    const dbType = client.config.type || DatabaseType.PostgreSQL;

    try {
      const schemaData = await this.getOrCacheSchemaObjects(
        client,
        connectionId,
        databaseName,
        schemaName
      );
      const additionalData = await this.fetchAdditionalSchemaObjects(
        client,
        databaseName,
        schemaName,
        dbType
      );

      return this.buildSchemaFolders(
        connectionId,
        databaseName,
        schemaName,
        schemaData,
        additionalData
      );
    } catch (error) {
      console.error('Error fetching schema children:', error);
      return [];
    }
  }

  private async getOrCacheSchemaObjects(
    client: IDatabaseClient,
    connectionId: string,
    databaseName: string,
    schemaName: string
  ): Promise<SchemaObjectsCache> {
    const cacheKey = `${connectionId}:${databaseName}:${schemaName}`;
    let schemaData = this.schemaObjectsCache.get(cacheKey);

    if (!schemaData) {
      schemaData = await client.getSchemaObjects(databaseName, schemaName);
      this.schemaObjectsCache.set(cacheKey, schemaData);
    }

    return schemaData;
  }

  private async fetchAdditionalSchemaObjects(
    client: IDatabaseClient,
    databaseName: string,
    schemaName: string,
    dbType: DatabaseType
  ): Promise<{ types: PgTypeInfo[]; sequences: PgSequenceInfo[] }> {
    // Only PostgreSQL has types and sequences as first-class objects
    if (dbType !== DatabaseType.PostgreSQL) {
      return { types: [], sequences: [] };
    }

    const [typesResult, sequencesResult] = await Promise.all([
      client.executeQueryOnDatabase(databaseName, this.getTypesQuery(schemaName)),
      client.executeQueryOnDatabase(databaseName, this.getSequencesQuery(schemaName)),
    ]);

    return {
      types: typesResult.rows as unknown as PgTypeInfo[],
      sequences: sequencesResult.rows as unknown as PgSequenceInfo[],
    };
  }

  private getTypesQuery(schemaName: string): string {
    return `SELECT t.typname, 
            CASE t.typtype 
              WHEN 'e' THEN 'enum'
              WHEN 'c' THEN 'composite'
              WHEN 'd' THEN 'domain'
              WHEN 'r' THEN 'range'
              ELSE 'other'
            END as type_category
     FROM pg_type t
     JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = '${schemaName}'
     AND t.typtype IN ('e', 'c', 'd', 'r')
     ORDER BY t.typname`;
  }

  private getSequencesQuery(schemaName: string): string {
    return `SELECT sequencename FROM pg_sequences WHERE schemaname = '${schemaName}' ORDER BY sequencename`;
  }

  private buildSchemaFolders(
    connectionId: string,
    databaseName: string,
    schemaName: string,
    schemaData: SchemaObjectsCache,
    additionalData: { types: PgTypeInfo[]; sequences: PgSequenceInfo[] }
  ): DatabaseTreeItem[] {
    const baseData = { connectionId, schemaName, databaseName };

    return [
      this.createObjectFolder('tables-folder', 'Tables', schemaData.tables, {
        ...baseData,
        tables: schemaData.tables,
      }),
      this.createObjectFolder('views-folder', 'Views', schemaData.views, {
        ...baseData,
        views: schemaData.views,
      }),
      this.createObjectFolder('functions-folder', 'Functions', schemaData.functions, {
        ...baseData,
        functions: schemaData.functions,
      }),
      this.createObjectFolder('procedures-folder', 'Procedures', schemaData.procedures, {
        ...baseData,
        procedures: schemaData.procedures,
      }),
      this.createObjectFolder('types-folder', 'Types', additionalData.types, {
        ...baseData,
        types: additionalData.types,
      }),
      this.createObjectFolder('sequences-folder', 'Sequences', additionalData.sequences, {
        ...baseData,
        sequences: additionalData.sequences,
      }),
    ];
  }

  private createObjectFolder(
    itemType: TreeItemType,
    label: string,
    items: unknown[],
    data: Record<string, unknown>
  ): DatabaseTreeItem {
    const collapsible =
      items.length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None;

    const folder = new DatabaseTreeItem(itemType, `${label} (${items.length})`, collapsible, data);
    folder.contextValue = itemType;
    return folder;
  }

  // ============================================================================
  // Schema Object Children (Tables, Views, Functions, etc.)
  // ============================================================================

  private async getTablesChildren(element: DatabaseTreeItem): Promise<DatabaseTreeItem[]> {
    const { connectionId, schemaName, databaseName, tables } = element.data as {
      connectionId: string;
      schemaName: string;
      databaseName: string;
      tables: TableInfo[];
    };

    return tables.map(
      table => new TableTreeItem(table.name, schemaName, databaseName, connectionId, table.rowCount)
    );
  }

  private async getViewsChildren(element: DatabaseTreeItem): Promise<DatabaseTreeItem[]> {
    const { connectionId, schemaName, databaseName, views } = element.data as {
      connectionId: string;
      schemaName: string;
      databaseName: string;
      views: ViewInfo[];
    };

    return views.map(view => new ViewTreeItem(view.name, schemaName, databaseName, connectionId));
  }

  private async getFunctionsChildren(element: DatabaseTreeItem): Promise<DatabaseTreeItem[]> {
    const { connectionId, schemaName, databaseName, functions } = element.data as {
      connectionId: string;
      schemaName: string;
      databaseName: string;
      functions: FunctionInfo[];
    };

    return functions.map(
      fn => new FunctionTreeItem(fn.name, schemaName, databaseName, connectionId, fn.returnType)
    );
  }

  private async getProceduresChildren(element: DatabaseTreeItem): Promise<DatabaseTreeItem[]> {
    const { connectionId, schemaName, databaseName, procedures } = element.data as {
      connectionId: string;
      schemaName: string;
      databaseName: string;
      procedures: ProcedureInfo[];
    };

    return procedures.map(
      proc => new ProcedureTreeItem(proc.name, schemaName, databaseName, connectionId)
    );
  }

  private async getTypesChildren(element: DatabaseTreeItem): Promise<DatabaseTreeItem[]> {
    const { connectionId, schemaName, databaseName, types } = element.data as {
      connectionId: string;
      schemaName: string;
      databaseName: string;
      types: PgTypeInfo[];
    };

    return types.map(
      t => new TypeTreeItem(t.typname, schemaName, databaseName, connectionId, t.type_category)
    );
  }

  private async getSequencesChildren(element: DatabaseTreeItem): Promise<DatabaseTreeItem[]> {
    const { connectionId, schemaName, databaseName, sequences } = element.data as {
      connectionId: string;
      schemaName: string;
      databaseName: string;
      sequences: PgSequenceInfo[];
    };

    return sequences.map(
      seq => new SequenceTreeItem(seq.sequencename, schemaName, databaseName, connectionId)
    );
  }

  // ============================================================================
  // Table Children
  // ============================================================================

  private async getTableChildren(table: TableTreeItem): Promise<DatabaseTreeItem[]> {
    const client = this.connectionManager.getClient(table.connectionId);

    if (!client || client.status !== ConnectionStatus.Connected) {
      return [];
    }

    try {
      const [tableInfo, triggers] = await Promise.all([
        this.getOrCacheTableInfo(client, table),
        this.getOrCacheTriggers(client, table),
      ]);

      return this.buildTableFolders(table, tableInfo, triggers);
    } catch (error) {
      console.error('Error fetching table children:', error);
      return [];
    }
  }

  private async getOrCacheTableInfo(
    client: IDatabaseClient,
    table: TableTreeItem
  ): Promise<TableInfo> {
    const cacheKey = `${table.connectionId}:${table.databaseName}:${table.schemaName}:${table.tableName}`;
    let tableInfo = this.tableInfoCache.get(cacheKey);

    if (!tableInfo) {
      tableInfo = await client.getTableInfo(table.databaseName, table.tableName, table.schemaName);
      this.tableInfoCache.set(cacheKey, tableInfo);
    }

    return tableInfo;
  }

  private async getOrCacheTriggers(
    client: IDatabaseClient,
    table: TableTreeItem
  ): Promise<TriggerInfo[]> {
    const cacheKey = `${table.connectionId}:${table.databaseName}:${table.schemaName}:${table.tableName}:triggers`;
    let triggers = this.triggersCache.get(cacheKey);

    if (!triggers) {
      triggers = await client.getTriggers(table.databaseName, table.tableName, table.schemaName);
      this.triggersCache.set(cacheKey, triggers);
    }

    return triggers;
  }

  private buildTableFolders(
    table: TableTreeItem,
    tableInfo: TableInfo,
    triggers: TriggerInfo[]
  ): DatabaseTreeItem[] {
    const baseData = {
      connectionId: table.connectionId,
      schemaName: table.schemaName,
      databaseName: table.databaseName,
      tableName: table.tableName,
    };

    const columnsFolder = this.createFolderItem('columns-folder', 'Columns', {
      ...baseData,
      columns: tableInfo.columns,
    });

    const indexFolder = new DatabaseTreeItem(
      'index-folder',
      'Index',
      tableInfo.indexes.length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
      { ...baseData, indexes: tableInfo.indexes }
    );
    indexFolder.contextValue = 'index-folder';

    const triggersFolder = new DatabaseTreeItem(
      'triggers-folder',
      'Triggers',
      triggers.length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
      { ...baseData, triggers }
    );
    triggersFolder.contextValue = 'triggers-folder';

    return [columnsFolder, indexFolder, triggersFolder];
  }

  // ============================================================================
  // Columns, Indexes, and Triggers Children
  // ============================================================================

  private async getColumnsChildren(element: DatabaseTreeItem): Promise<DatabaseTreeItem[]> {
    const { columns } = element.data as { columns: ColumnInfo[] };
    return columns.map(col => new ColumnTreeItem(col));
  }

  private async getIndexesChildren(element: DatabaseTreeItem): Promise<DatabaseTreeItem[]> {
    const { indexes } = element.data as { indexes: IndexInfo[] };

    return indexes.map(idx => {
      const item = new DatabaseTreeItem('index', idx.name, vscode.TreeItemCollapsibleState.None, {
        index: idx,
      });
      item.description = idx.unique ? 'UNIQUE' : '';
      return item;
    });
  }

  private async getTriggersChildren(element: DatabaseTreeItem): Promise<DatabaseTreeItem[]> {
    const { triggers, connectionId, schemaName, databaseName, tableName } = element.data as {
      triggers: TriggerInfo[];
      connectionId: string;
      schemaName: string;
      databaseName: string;
      tableName: string;
    };

    return triggers.map(
      trigger =>
        new TriggerTreeItem(
          trigger.name,
          tableName,
          schemaName,
          databaseName,
          connectionId,
          trigger.timing,
          trigger.event
        )
    );
  }
}
