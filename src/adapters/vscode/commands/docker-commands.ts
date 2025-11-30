import * as vscode from 'vscode';
import { DockerService } from '../../../core/services';

/**
 * Register Docker-related commands
 */
export function registerDockerCommands(
  context: vscode.ExtensionContext,
  dockerService: DockerService
): void {
  registerDockerCreateCommand(context, dockerService);
  registerDockerStartCommand(context, dockerService);
  registerDockerStopCommand(context, dockerService);
}

function registerDockerCreateCommand(
  context: vscode.ExtensionContext,
  dockerService: DockerService
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.dockerCreate', async () => {
      const isAvailable = await dockerService.isDockerAvailable();
      if (!isAvailable) {
        vscode.window.showErrorMessage('Docker is not available. Please install and start Docker.');
        return;
      }

      const dbType = await selectDatabaseType();
      if (!dbType) return;

      const containerName = await promptContainerName(dbType.value);
      if (!containerName) return;

      const password = await promptPassword();

      await createContainer(dockerService, dbType, containerName, password);
    })
  );
}

async function selectDatabaseType(): Promise<
  { label: string; value: string; description: string } | undefined
> {
  return vscode.window.showQuickPick(
    [
      { label: '🐘 PostgreSQL', value: 'postgresql', description: 'postgres:16-alpine' },
      { label: '🐬 MySQL', value: 'mysql', description: 'mysql:8' },
      { label: '🍃 MongoDB', value: 'mongodb', description: 'mongo:7' },
      { label: '🔴 Redis', value: 'redis', description: 'redis:7-alpine' },
    ],
    { placeHolder: 'Select database type' }
  );
}

async function promptContainerName(dbTypeValue: string): Promise<string | undefined> {
  return vscode.window.showInputBox({
    prompt: 'Container name',
    value: `dbclient-${dbTypeValue}`,
  });
}

async function promptPassword(): Promise<string | undefined> {
  return vscode.window.showInputBox({
    prompt: 'Database password',
    password: true,
    value: 'password123',
  });
}

async function createContainer(
  dockerService: DockerService,
  dbType: { label: string; value: string },
  containerName: string,
  password: string | undefined
): Promise<void> {
  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Creating ${dbType.label} container...`,
        cancellable: false,
      },
      async () => {
        const { DATABASE_TEMPLATES } = await import('../../../types');
        const template = DATABASE_TEMPLATES.find(t => t.type === dbType.value);
        if (!template) throw new Error('Unknown database type');

        const environment = buildEnvironment(template, password);

        await dockerService.createContainer({
          name: containerName,
          image: template.image,
          ports: [{ hostPort: template.defaultPort, containerPort: template.defaultPort }],
          environment,
        });
      }
    );

    const action = await vscode.window.showInformationMessage(
      `Container "${containerName}" created and started!`,
      'Add Connection'
    );

    if (action === 'Add Connection') {
      vscode.commands.executeCommand('qonnect.addConnection');
    }
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to create container: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function buildEnvironment(
  template: { environmentVariables: Array<{ name: string; default?: string }> },
  password: string | undefined
): Record<string, string> {
  const environment: Record<string, string> = {};

  for (const envVar of template.environmentVariables) {
    if (envVar.name.includes('PASSWORD') && password) {
      environment[envVar.name] = password;
    } else if (envVar.default) {
      environment[envVar.name] = envVar.default;
    }
  }

  return environment;
}

function registerDockerStartCommand(
  context: vscode.ExtensionContext,
  dockerService: DockerService
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.dockerStart', async () => {
      const containerName = await vscode.window.showInputBox({
        prompt: 'Container name to start',
      });

      if (containerName) {
        try {
          await dockerService.startContainer(containerName);
          vscode.window.showInformationMessage(`Container "${containerName}" started`);
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to start container: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    })
  );
}

function registerDockerStopCommand(
  context: vscode.ExtensionContext,
  dockerService: DockerService
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('qonnect.dockerStop', async () => {
      const containerName = await vscode.window.showInputBox({
        prompt: 'Container name to stop',
      });

      if (containerName) {
        try {
          await dockerService.stopContainer(containerName);
          vscode.window.showInformationMessage(`Container "${containerName}" stopped`);
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to stop container: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    })
  );
}
