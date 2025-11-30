import * as vscode from 'vscode';
import { DatabaseTreeItem } from './DatabaseTreeItem';
import { ColumnInfo } from '../../../types';

/**
 * Tree item representing a database column
 */
export class ColumnTreeItem extends DatabaseTreeItem {
  constructor(column: ColumnInfo) {
    super('column', column.name, vscode.TreeItemCollapsibleState.None, { column });

    this.description = column.type;
    this.iconPath = this.getColumnIcon(column);
    this.tooltip = this.buildTooltip(column);
  }

  private getColumnIcon(column: ColumnInfo): vscode.ThemeIcon {
    if (column.isPrimaryKey) {
      return new vscode.ThemeIcon('key', new vscode.ThemeColor('charts.yellow'));
    }
    if (column.isForeignKey) {
      return new vscode.ThemeIcon('references', new vscode.ThemeColor('charts.blue'));
    }
    return new vscode.ThemeIcon('symbol-field');
  }

  private buildTooltip(column: ColumnInfo): string {
    const lines = [`${column.name}: ${column.type}`];

    if (column.isPrimaryKey) {
      lines.push('Primary Key');
    }
    if (column.isForeignKey && column.foreignKeyReference) {
      const ref = column.foreignKeyReference;
      lines.push(`Foreign Key → ${ref.table}.${ref.column}`);
    }
    if (!column.nullable) {
      lines.push('NOT NULL');
    }
    if (column.defaultValue) {
      lines.push(`Default: ${column.defaultValue}`);
    }

    return lines.join('\n');
  }
}
