import * as vscode from 'vscode';
import { DatabaseTreeItem } from './DatabaseTreeItem';

/**
 * Tree item representing a database table
 */
export class TableTreeItem extends DatabaseTreeItem {
  constructor(
    public readonly tableName: string,
    public readonly schemaName: string,
    public readonly databaseName: string,
    public readonly connectionId: string,
    rowCount?: number
  ) {
    super('table', tableName, vscode.TreeItemCollapsibleState.Collapsed, {
      tableName,
      schemaName,
      databaseName,
      connectionId,
    });

    if (rowCount !== undefined && rowCount >= 0) {
      this.description = this.formatRowCount(rowCount);
    }
    this.tooltip = `${databaseName}.${schemaName}.${tableName}`;
    this.contextValue = 'table';
    this.command = this.createViewCommand();
  }

  private formatRowCount(count: number): string {
    if (count >= 1_000_000) {
      return `${(count / 1_000_000).toFixed(1)}M`;
    }
    if (count >= 1_000) {
      return `${(count / 1_000).toFixed(0)}K`;
    }
    return `${count}`;
  }

  private createViewCommand(): vscode.Command {
    return {
      command: 'qonnect.viewTableData',
      title: 'View Data',
      arguments: [this],
    };
  }
}
