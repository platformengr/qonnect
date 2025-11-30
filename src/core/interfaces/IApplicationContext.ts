/**
 * Application Context - Central dependency injection container
 *
 * This is the main entry point for the application. Each platform (VS Code, Backstage, Web)
 * creates an ApplicationContext with platform-specific implementations of the interfaces.
 *
 * Usage:
 *
 * // In VS Code extension:
 * const context = new ApplicationContext({
 *   storage: new VSCodeConnectionStorage(vscodeContext),
 *   platformUI: new VSCodePlatformContext(...),
 *   // ... other VS Code implementations
 * });
 *
 * // In Backstage plugin:
 * const context = new ApplicationContext({
 *   storage: new BackstageConnectionStorage(api),
 *   platformUI: new BackstagePlatformContext(...),
 *   // ... other Backstage implementations
 * });
 *
 * // In standalone web app:
 * const context = new ApplicationContext({
 *   storage: new LocalStorageConnectionStorage(),
 *   platformUI: new WebPlatformContext(...),
 *   // ... other web implementations
 * });
 */

import { IConnectionStorage } from './IConnectionStorage';
import { IDockerService } from './IDockerService';
import { IPlatformContext } from './IPlatformUI';
import { IPanelFactory, ITreeDataProvider } from './IViewModels';
import {
  IQueryExecutionService,
  ISchemaService,
  ISavedQueriesService,
  IConnectionService,
  IDDLService,
  IExportService,
} from './IServices';

// ============================================================================
// Application Configuration
// ============================================================================

export interface ApplicationConfig {
  /**
   * Application name
   */
  appName: string;

  /**
   * Application version
   */
  version: string;

  /**
   * Platform identifier
   */
  platform: 'vscode' | 'backstage' | 'web' | 'cli';

  /**
   * Feature flags
   */
  features?: {
    docker?: boolean;
    copilot?: boolean;
    multiDatabase?: boolean;
    queryHistory?: boolean;
    savedQueries?: boolean;
    export?: boolean;
  };
}

// ============================================================================
// Application Context Dependencies
// ============================================================================

export interface ApplicationDependencies {
  /**
   * Storage implementation for connections, queries, etc.
   */
  storage: IConnectionStorage;

  /**
   * Platform-specific UI services (notifications, dialogs, etc.)
   */
  platformUI: IPlatformContext;

  /**
   * Optional: Docker service for container management
   */
  dockerService?: IDockerService;

  /**
   * Optional: Panel factory for creating UI panels
   */
  panelFactory?: IPanelFactory;

  /**
   * Optional: Tree data provider for database explorer
   */
  treeDataProvider?: ITreeDataProvider;
}

// ============================================================================
// Application Context Interface
// ============================================================================

export interface IApplicationContext {
  /**
   * Application configuration
   */
  readonly config: ApplicationConfig;

  /**
   * Connection storage
   */
  readonly storage: IConnectionStorage;

  /**
   * Platform UI services
   */
  readonly platformUI: IPlatformContext;

  /**
   * Docker service (if available)
   */
  readonly dockerService?: IDockerService;

  /**
   * Panel factory (if available)
   */
  readonly panelFactory?: IPanelFactory;

  /**
   * Tree data provider (if available)
   */
  readonly treeDataProvider?: ITreeDataProvider;

  // High-level services (created lazily)

  /**
   * Connection management service
   */
  readonly connectionService: IConnectionService;

  /**
   * Query execution service
   */
  readonly queryService: IQueryExecutionService;

  /**
   * Schema information service
   */
  readonly schemaService: ISchemaService;

  /**
   * Saved queries service
   */
  readonly savedQueriesService: ISavedQueriesService;

  /**
   * DDL operations service
   */
  readonly ddlService: IDDLService;

  /**
   * Export service
   */
  readonly exportService: IExportService;

  /**
   * Dispose of all resources
   */
  dispose(): Promise<void>;
}

// ============================================================================
// Event Bus for cross-component communication
// ============================================================================

export type ApplicationEvent =
  | { type: 'connection:connected'; connectionId: string }
  | { type: 'connection:disconnected'; connectionId: string }
  | { type: 'connection:error'; connectionId: string; error: Error }
  | { type: 'query:executed'; connectionId: string; query: string; result: unknown }
  | { type: 'schema:refreshed'; connectionId: string; databaseName?: string }
  | { type: 'savedQuery:added'; queryId: string }
  | { type: 'savedQuery:deleted'; queryId: string }
  | { type: 'theme:changed'; theme: 'light' | 'dark' };

export type ApplicationEventListener = (event: ApplicationEvent) => void;

export interface IEventBus {
  /**
   * Emit an event
   */
  emit(event: ApplicationEvent): void;

  /**
   * Subscribe to events
   */
  on(listener: ApplicationEventListener): () => void;

  /**
   * Subscribe to specific event types
   */
  onType<T extends ApplicationEvent['type']>(
    type: T,
    listener: (event: Extract<ApplicationEvent, { type: T }>) => void
  ): () => void;
}

// ============================================================================
// Service Factory Interface
// ============================================================================

/**
 * Factory for creating high-level services
 * Platforms can provide custom implementations if needed
 */
export interface IServiceFactory {
  createConnectionService(deps: ApplicationDependencies): IConnectionService;
  createQueryService(deps: ApplicationDependencies): IQueryExecutionService;
  createSchemaService(deps: ApplicationDependencies): ISchemaService;
  createSavedQueriesService(deps: ApplicationDependencies): ISavedQueriesService;
  createDDLService(deps: ApplicationDependencies): IDDLService;
  createExportService(deps: ApplicationDependencies): IExportService;
}
