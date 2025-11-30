import * as vscode from 'vscode';
import { DatabaseTreeItem } from './DatabaseTreeItem';

/**
 * Tree item representing a database trigger
 */
export class TriggerTreeItem extends DatabaseTreeItem {
  constructor(
    public readonly triggerName: string,
    public readonly tableName: string,
    public readonly schemaName: string,
    public readonly databaseName: string,
    public readonly connectionId: string,
    public readonly timing: string,
    public readonly event: string
  ) {
    super('trigger', triggerName, vscode.TreeItemCollapsibleState.None, {
      triggerName,
      tableName,
      schemaName,
      databaseName,
      connectionId,
    });
    this.description = `${timing} ${event}`;
    this.tooltip = `${triggerName}\n${timing} ${event} ON ${tableName}`;
    this.contextValue = 'trigger';
    this.command = this.createViewCommand();
  }

  private createViewCommand(): vscode.Command {
    return {
      command: 'qonnect.viewObject',
      title: 'View Definition',
      arguments: [this, 'trigger'],
    };
  }
}
