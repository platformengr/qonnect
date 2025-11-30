import * as vscode from 'vscode';
import { DatabaseTreeItem } from './DatabaseTreeItem';
import { ConnectionConfig, ConnectionStatus } from '../../../types';

/**
 * Tree item representing a database connection
 */
export class ConnectionTreeItem extends DatabaseTreeItem {
  connectionStatus: ConnectionStatus = ConnectionStatus.Disconnected;

  constructor(
    public readonly config: ConnectionConfig,
    status: ConnectionStatus,
    private version?: string
  ) {
    super(
      'connection',
      `${config.host}@${config.port}`,
      vscode.TreeItemCollapsibleState.Collapsed,
      { config }
    );
    this.connectionStatus = status;
    this.description = this.getDescription();
    this.tooltip = this.getTooltip();
    this.contextValue = this.getContextValue();
    this.iconPath = this.getConnectionIcon();
  }

  private getDescription(): string {
    if (this.version) {
      return this.version;
    }
    return this.connectionStatus === ConnectionStatus.Connected ? 'Connected' : '';
  }

  private getTooltip(): string {
    return `${this.config.name}\n${this.config.host}:${this.config.port}\nStatus: ${this.connectionStatus}`;
  }

  private getContextValue(): string {
    const statusSuffix =
      this.connectionStatus === ConnectionStatus.Connected ? 'connected' : 'disconnected';
    return `connection-${statusSuffix}`;
  }

  private getConnectionIcon(): vscode.ThemeIcon {
    const color =
      this.connectionStatus === ConnectionStatus.Connected
        ? new vscode.ThemeColor('charts.green')
        : undefined;
    return new vscode.ThemeIcon('database', color);
  }
}
