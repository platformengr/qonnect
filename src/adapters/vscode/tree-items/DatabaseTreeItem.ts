import * as vscode from 'vscode';
import { TreeItemType, TREE_ITEM_ICONS } from './types';

/**
 * Base class for all tree items in the database explorer
 */
export class DatabaseTreeItem extends vscode.TreeItem {
  constructor(
    public readonly itemType: TreeItemType,
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly data?: Record<string, unknown>
  ) {
    super(label, collapsibleState);
    this.contextValue = this.itemType;
    this.iconPath = this.getIconPath();
  }

  protected getIconPath(): vscode.ThemeIcon {
    const iconName = TREE_ITEM_ICONS[this.itemType] || 'circle-outline';
    return new vscode.ThemeIcon(iconName);
  }
}
