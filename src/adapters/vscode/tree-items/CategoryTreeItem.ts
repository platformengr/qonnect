import * as vscode from 'vscode';
import { DatabaseTreeItem } from './DatabaseTreeItem';
import { ConnectionCategory } from '../../../types';

/**
 * Tree item representing a category/folder for organizing connections
 */
export class CategoryTreeItem extends DatabaseTreeItem {
  constructor(public readonly category: ConnectionCategory) {
    super('category', category.name, vscode.TreeItemCollapsibleState.Collapsed, { category });
    this.iconPath = new vscode.ThemeIcon('folder');
  }
}
