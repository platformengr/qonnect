/**
 * Platform-agnostic interfaces for UI operations
 * These interfaces define contracts that any platform (VS Code, Backstage, Web) must implement
 */

// ============================================================================
// Notification System
// ============================================================================

export type NotificationLevel = 'info' | 'warning' | 'error' | 'success';

export interface NotificationAction {
  label: string;
  id: string;
}

export interface NotificationOptions {
  level: NotificationLevel;
  message: string;
  actions?: NotificationAction[];
  modal?: boolean;
}

export interface INotificationService {
  /**
   * Show a notification to the user
   * @returns The ID of the action clicked, or undefined if dismissed
   */
  show(options: NotificationOptions): Promise<string | undefined>;

  /**
   * Show an info notification
   */
  info(message: string, actions?: NotificationAction[]): Promise<string | undefined>;

  /**
   * Show a warning notification
   */
  warn(message: string, actions?: NotificationAction[]): Promise<string | undefined>;

  /**
   * Show an error notification
   */
  error(message: string, actions?: NotificationAction[]): Promise<string | undefined>;

  /**
   * Show a success notification
   */
  success(message: string, actions?: NotificationAction[]): Promise<string | undefined>;
}

// ============================================================================
// Dialog System
// ============================================================================

export interface InputDialogOptions {
  title: string;
  placeholder?: string;
  value?: string;
  password?: boolean;
  validateInput?: (value: string) => string | undefined;
}

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export interface QuickPickItem {
  id: string;
  label: string;
  description?: string;
  detail?: string;
  picked?: boolean;
}

export interface QuickPickOptions {
  title?: string;
  placeholder?: string;
  canPickMany?: boolean;
}

export interface IDialogService {
  /**
   * Show an input dialog
   */
  showInput(options: InputDialogOptions): Promise<string | undefined>;

  /**
   * Show a confirmation dialog
   */
  showConfirm(options: ConfirmDialogOptions): Promise<boolean>;

  /**
   * Show a quick pick selection dialog
   */
  showQuickPick<T extends QuickPickItem>(
    items: T[],
    options?: QuickPickOptions
  ): Promise<T | undefined>;

  /**
   * Show a multi-select quick pick dialog
   */
  showQuickPickMany<T extends QuickPickItem>(
    items: T[],
    options?: QuickPickOptions
  ): Promise<T[] | undefined>;
}

// ============================================================================
// Progress System
// ============================================================================

export interface ProgressOptions {
  title: string;
  cancellable?: boolean;
  location?: 'notification' | 'window' | 'statusbar';
}

export interface ProgressReporter {
  report(progress: { message?: string; increment?: number }): void;
}

export interface IProgressService {
  /**
   * Run a task with progress indication
   */
  withProgress<T>(
    options: ProgressOptions,
    task: (progress: ProgressReporter, token: CancellationToken) => Promise<T>
  ): Promise<T>;
}

export interface CancellationToken {
  isCancellationRequested: boolean;
  onCancellationRequested: (callback: () => void) => void;
}

// ============================================================================
// Status Bar / Status Display
// ============================================================================

export interface StatusItem {
  id: string;
  text: string;
  tooltip?: string;
  command?: string;
  priority?: number;
}

export interface IStatusService {
  /**
   * Set a status item
   */
  setStatus(item: StatusItem): void;

  /**
   * Remove a status item
   */
  removeStatus(id: string): void;

  /**
   * Show a temporary status message
   */
  showMessage(message: string, timeout?: number): void;
}

// ============================================================================
// Clipboard Service
// ============================================================================

export interface IClipboardService {
  /**
   * Write text to clipboard
   */
  writeText(text: string): Promise<void>;

  /**
   * Read text from clipboard
   */
  readText(): Promise<string>;
}

// ============================================================================
// File System Service (for exports, imports)
// ============================================================================

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface SaveDialogOptions {
  defaultUri?: string;
  filters?: FileFilter[];
  title?: string;
}

export interface OpenDialogOptions {
  canSelectFiles?: boolean;
  canSelectFolders?: boolean;
  canSelectMany?: boolean;
  filters?: FileFilter[];
  title?: string;
}

export interface IFileDialogService {
  /**
   * Show a save file dialog
   * @returns The selected file path or undefined if cancelled
   */
  showSaveDialog(options: SaveDialogOptions): Promise<string | undefined>;

  /**
   * Show an open file dialog
   * @returns The selected file path(s) or undefined if cancelled
   */
  showOpenDialog(options: OpenDialogOptions): Promise<string[] | undefined>;
}

// ============================================================================
// Logging Service
// ============================================================================

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

export interface ILoggerService {
  trace(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;

  /**
   * Create a child logger with a specific context
   */
  child(context: string): ILoggerService;
}

// ============================================================================
// Platform Context - Aggregates all platform services
// ============================================================================

export interface IPlatformContext {
  readonly notifications: INotificationService;
  readonly dialogs: IDialogService;
  readonly progress: IProgressService;
  readonly status: IStatusService;
  readonly clipboard: IClipboardService;
  readonly fileDialogs: IFileDialogService;
  readonly logger: ILoggerService;
}
