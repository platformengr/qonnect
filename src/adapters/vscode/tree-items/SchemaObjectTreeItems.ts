import * as vscode from 'vscode';
import { DatabaseTreeItem } from './DatabaseTreeItem';
import { TreeItemType } from './types';

/**
 * Base class for schema object tree items (views, functions, procedures, etc.)
 * These items have similar structure with click handlers to view their definitions
 */
abstract class SchemaObjectTreeItem extends DatabaseTreeItem {
  constructor(
    itemType: TreeItemType,
    name: string,
    public readonly schemaName: string,
    public readonly databaseName: string,
    public readonly connectionId: string,
    objectType: string
  ) {
    super(itemType, name, vscode.TreeItemCollapsibleState.None, {
      [`${itemType}Name`]: name,
      schemaName,
      databaseName,
      connectionId,
    });
    this.tooltip = `${databaseName}.${schemaName}.${name}`;
    this.contextValue = itemType;
    this.command = this.createViewCommand(objectType);
  }

  private createViewCommand(objectType: string): vscode.Command {
    return {
      command: 'qonnect.viewObject',
      title: 'View Definition',
      arguments: [this, objectType],
    };
  }
}

/**
 * Tree item representing a database view
 */
export class ViewTreeItem extends SchemaObjectTreeItem {
  constructor(
    public readonly viewName: string,
    schemaName: string,
    databaseName: string,
    connectionId: string
  ) {
    super('view', viewName, schemaName, databaseName, connectionId, 'view');
  }
}

/**
 * Tree item representing a database function
 */
export class FunctionTreeItem extends SchemaObjectTreeItem {
  constructor(
    public readonly functionName: string,
    schemaName: string,
    databaseName: string,
    connectionId: string,
    returnType?: string
  ) {
    super('function', functionName, schemaName, databaseName, connectionId, 'function');
    if (returnType) {
      this.description = returnType;
    }
  }
}

/**
 * Tree item representing a database stored procedure
 */
export class ProcedureTreeItem extends SchemaObjectTreeItem {
  constructor(
    public readonly procedureName: string,
    schemaName: string,
    databaseName: string,
    connectionId: string
  ) {
    super('procedure', procedureName, schemaName, databaseName, connectionId, 'procedure');
  }
}

/**
 * Tree item representing a database type
 */
export class TypeTreeItem extends SchemaObjectTreeItem {
  constructor(
    public readonly typeName: string,
    schemaName: string,
    databaseName: string,
    connectionId: string,
    typeCategory?: string
  ) {
    super('type', typeName, schemaName, databaseName, connectionId, 'type');
    if (typeCategory) {
      this.description = typeCategory;
    }
  }
}

/**
 * Tree item representing a database sequence
 */
export class SequenceTreeItem extends SchemaObjectTreeItem {
  constructor(
    public readonly sequenceName: string,
    schemaName: string,
    databaseName: string,
    connectionId: string
  ) {
    super('sequence', sequenceName, schemaName, databaseName, connectionId, 'sequence');
  }
}
