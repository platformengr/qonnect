# Architecture Guide

This document describes the modular architecture designed to support multiple platforms:
- **VS Code Extension** (current implementation)
- **Backstage Developer Portal Plugin** (future)
- **Standalone Web Application** (future)

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Platform Layer                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │   VS Code    │  │  Backstage   │  │  Standalone  │           │
│  │   Adapter    │  │   Adapter    │  │  Web Adapter │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Core Business Logic                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │  Connection  │  │   Schema     │  │    Query     │           │
│  │   Manager    │  │   Service    │  │   Service    │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │    DDL       │  │   Export     │  │    Event     │           │
│  │   Service    │  │   Service    │  │     Bus      │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Database Clients                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │  PostgreSQL  │  │    MySQL     │  │   MongoDB    │           │
│  │    Client    │  │    Client    │  │    Client    │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
src/
├── core/                      # Platform-agnostic business logic
│   ├── interfaces/            # All contracts/interfaces
│   │   ├── IDatabaseClient.ts        # Database client interface
│   │   ├── IConnectionStorage.ts     # Storage interface
│   │   ├── IPlatformUI.ts            # UI abstractions (notifications, dialogs)
│   │   ├── IViewModels.ts            # View model interfaces
│   │   ├── IServices.ts              # High-level service interfaces
│   │   └── IApplicationContext.ts    # Application context
│   ├── clients/               # Database client implementations
│   │   ├── PostgreSQLClient.ts
│   │   ├── MySQLClient.ts (future)
│   │   └── queries/           # SQL query templates
│   └── services/              # Core business logic services
│       ├── ConnectionManager.ts
│       └── DockerService.ts
│
├── adapters/                  # Platform-specific implementations
│   ├── vscode/                # VS Code adapter
│   │   ├── commands/          # Command handlers
│   │   ├── tree-items/        # Tree view items
│   │   ├── utils/             # VS Code-specific utilities
│   │   ├── VSCodeConnectionStorage.ts
│   │   ├── ConnectionTreeDataProvider.ts
│   │   └── *Panel.ts          # Webview panels
│   │
│   ├── backstage/             # Backstage adapter (future)
│   │   ├── BackstageConnectionStorage.ts
│   │   ├── BackstagePlatformContext.ts
│   │   └── components/        # React components
│   │
│   └── web/                   # Standalone web adapter (future)
│       ├── LocalStorageConnectionStorage.ts
│       ├── WebPlatformContext.ts
│       └── components/        # React/Vue components
│
├── types/                     # Shared type definitions
│   ├── database.ts
│   └── docker.ts
│
└── features/                  # Optional feature modules
    └── copilot/               # VS Code Copilot integration
```

## Key Interfaces

### 1. Platform UI (`IPlatformUI.ts`)

Abstracts all platform-specific UI operations:

```typescript
interface IPlatformContext {
  readonly notifications: INotificationService;
  readonly dialogs: IDialogService;
  readonly progress: IProgressService;
  readonly status: IStatusService;
  readonly clipboard: IClipboardService;
  readonly fileDialogs: IFileDialogService;
  readonly logger: ILoggerService;
}
```

**VS Code Implementation:**
```typescript
class VSCodeNotificationService implements INotificationService {
  async show(options: NotificationOptions): Promise<string | undefined> {
    const { level, message, actions } = options;
    switch (level) {
      case 'info':
        return vscode.window.showInformationMessage(message, ...actions);
      case 'error':
        return vscode.window.showErrorMessage(message, ...actions);
      // ...
    }
  }
}
```

**Backstage Implementation:**
```typescript
class BackstageNotificationService implements INotificationService {
  constructor(private readonly alertApi: AlertApi) {}
  
  async show(options: NotificationOptions): Promise<string | undefined> {
    this.alertApi.post({
      message: options.message,
      severity: options.level,
    });
    return undefined;
  }
}
```

### 2. Connection Storage (`IConnectionStorage.ts`)

Abstracts how connections are persisted:

```typescript
interface IConnectionStorage {
  getConnections(): Promise<ConnectionConfig[]>;
  saveConnection(connection: ConnectionConfig): Promise<void>;
  deleteConnection(id: string): Promise<void>;
  // ...
}
```

**VS Code:** Uses `ExtensionContext.globalState`
**Backstage:** Uses backend API
**Web:** Uses LocalStorage or IndexedDB

### 3. View Models (`IViewModels.ts`)

Platform-agnostic data structures for UI:

```typescript
interface TableDataViewModel {
  tableName: string;
  columns: Column[];
  rows: Record<string, unknown>[];
  totalRows: number;
  page: number;
  pageSize: number;
}
```

### 4. Application Context (`IApplicationContext.ts`)

Central dependency injection container:

```typescript
interface IApplicationContext {
  readonly config: ApplicationConfig;
  readonly storage: IConnectionStorage;
  readonly platformUI: IPlatformContext;
  readonly connectionService: IConnectionService;
  readonly queryService: IQueryExecutionService;
  // ...
}
```

## Adding a New Platform

### Step 1: Implement Platform Interfaces

Create a new adapter directory (e.g., `src/adapters/backstage/`):

```typescript
// BackstagePlatformContext.ts
export class BackstagePlatformContext implements IPlatformContext {
  readonly notifications: INotificationService;
  readonly dialogs: IDialogService;
  // ... implement all services
}
```

### Step 2: Implement Storage

```typescript
// BackstageConnectionStorage.ts
export class BackstageConnectionStorage implements IConnectionStorage {
  constructor(private readonly api: BackendApi) {}
  
  async getConnections(): Promise<ConnectionConfig[]> {
    return this.api.get('/api/database-client/connections');
  }
  // ...
}
```

### Step 3: Create Application Context

```typescript
// BackstagePlugin.tsx
const platformUI = new BackstagePlatformContext(alertApi, ...);
const storage = new BackstageConnectionStorage(api);

const appContext = new ApplicationContext({
  config: {
    appName: 'Qonnect',
    version: '1.0.0',
    platform: 'backstage',
  },
  storage,
  platformUI,
});
```

### Step 4: Create UI Components

Use the view models to create React components:

```tsx
// TableViewer.tsx
function TableViewer({ viewModel }: { viewModel: TableDataViewModel }) {
  return (
    <Table>
      <TableHead>
        {viewModel.columns.map(col => (
          <TableCell key={col.name}>{col.name}</TableCell>
        ))}
      </TableHead>
      <TableBody>
        {viewModel.rows.map((row, i) => (
          <TableRow key={i}>
            {viewModel.columns.map(col => (
              <TableCell key={col.name}>{row[col.name]}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

## Design Principles

### 1. Dependency Inversion

Core services depend on interfaces, not implementations:

```typescript
// ✅ Good - depends on interface
class QueryExecutionService {
  constructor(private readonly connectionManager: IConnectionService) {}
}

// ❌ Bad - depends on concrete implementation
class QueryExecutionService {
  constructor(private readonly connectionManager: VSCodeConnectionManager) {}
}
```

### 2. Single Responsibility

Each module has one reason to change:

- `PostgreSQLClient` - PostgreSQL-specific query execution
- `ConnectionManager` - Connection lifecycle management
- `VSCodeNotificationService` - VS Code notification API

### 3. Interface Segregation

Small, focused interfaces:

```typescript
// ✅ Good - focused interfaces
interface INotificationService { /* notifications only */ }
interface IDialogService { /* dialogs only */ }

// ❌ Bad - monolithic interface
interface IUIService { 
  showNotification(...);
  showDialog(...);
  showProgress(...);
  // too many responsibilities
}
```

### 4. Open/Closed

Core is open for extension, closed for modification:

```typescript
// Add new database support without modifying existing code
class MySQLClient implements IDatabaseClient {
  // new implementation
}

// Register with factory
factory.register('mysql', MySQLClient);
```

## Testing Strategy

### Unit Tests
Core business logic can be tested without any platform:

```typescript
// Mock implementations
const mockStorage: IConnectionStorage = {
  getConnections: jest.fn().mockResolvedValue([]),
  // ...
};

const service = new ConnectionService(mockStorage);
// test service logic
```

### Integration Tests
Test platform adapters with real platform APIs:

```typescript
// VS Code integration tests
const storage = new VSCodeConnectionStorage(context);
const connection = await storage.saveConnection(testConfig);
// verify with real VS Code APIs
```

## Migration Path

### Phase 1: Current (VS Code Only)
- Core interfaces defined
- VS Code adapter implemented
- Business logic in core/

### Phase 2: Add Backstage Support
1. Create `src/adapters/backstage/`
2. Implement Backstage-specific storage and UI
3. Create React components using view models
4. Package as Backstage plugin

### Phase 3: Add Standalone Web
1. Create `src/adapters/web/`
2. Implement browser-based storage (IndexedDB)
3. Implement web UI services
4. Create React/Vue application

## Best Practices

1. **Never import `vscode` in `core/`**
   - Core must remain platform-agnostic

2. **Use dependency injection**
   - Pass interfaces via constructors
   - Use ApplicationContext for service resolution

3. **View models for UI data**
   - Transform domain objects to view models
   - Keep UI components focused on rendering

4. **Event bus for loose coupling**
   - Components communicate via events
   - No direct dependencies between UI components

5. **Feature flags for optional features**
   - Docker integration is optional
   - Copilot integration is VS Code-specific
