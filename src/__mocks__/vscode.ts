// Mock VS Code API for testing
export const window = {
  showInformationMessage: jest.fn(),
  showWarningMessage: jest.fn(),
  showErrorMessage: jest.fn(),
  showInputBox: jest.fn(),
  showQuickPick: jest.fn(),
  createTreeView: jest.fn(() => ({ dispose: jest.fn() })),
  createWebviewPanel: jest.fn(),
  withProgress: jest.fn((options, task) => task()),
  activeTextEditor: undefined,
};

export const commands = {
  registerCommand: jest.fn(),
  executeCommand: jest.fn(),
};

export const workspace = {
  getConfiguration: jest.fn(() => ({
    get: jest.fn(),
    update: jest.fn(),
  })),
};

export const ExtensionContext = jest.fn();

export class EventEmitter {
  event = jest.fn();
  fire = jest.fn();
  dispose = jest.fn();
}

export class TreeItem {
  constructor(
    public label: string,
    public collapsibleState?: TreeItemCollapsibleState
  ) {}
}

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export class ThemeIcon {
  constructor(
    public id: string,
    public color?: ThemeColor
  ) {}
}

export class ThemeColor {
  constructor(public id: string) {}
}

export class Uri {
  static file = jest.fn((path: string) => ({ fsPath: path }));
  static joinPath = jest.fn((base: any, ...paths: string[]) => ({
    fsPath: [base.fsPath, ...paths].join('/'),
  }));
}

export enum ViewColumn {
  One = 1,
  Two = 2,
  Three = 3,
  Active = -1,
}

export enum ProgressLocation {
  Notification = 15,
  SourceControl = 1,
  Window = 10,
}

export const lm = {
  registerTool: jest.fn(),
};

export class LanguageModelToolResult {
  constructor(public parts: LanguageModelTextPart[]) {}
}

export class LanguageModelTextPart {
  constructor(public text: string) {}
}
