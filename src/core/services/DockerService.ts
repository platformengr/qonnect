import { exec } from 'child_process';
import { promisify } from 'util';
import { IDockerService } from '../interfaces';
import { ContainerConfig, ContainerInfo, ContainerStatus, PortMapping } from '../../types';

const execAsync = promisify(exec);

/**
 * Docker service implementation using Docker CLI
 */
export class DockerService implements IDockerService {
  private static instance: DockerService;

  private constructor() {}

  static getInstance(): DockerService {
    if (!DockerService.instance) {
      DockerService.instance = new DockerService();
    }
    return DockerService.instance;
  }

  async isDockerAvailable(): Promise<boolean> {
    try {
      await execAsync('docker info');
      return true;
    } catch {
      return false;
    }
  }

  async createContainer(config: ContainerConfig): Promise<string> {
    const args = this.buildRunArgs(config);
    const command = `docker run -d ${args.join(' ')} ${config.image}`;

    const { stdout } = await execAsync(command);
    return stdout.trim();
  }

  async startContainer(containerNameOrId: string): Promise<void> {
    await execAsync(`docker start ${containerNameOrId}`);
  }

  async stopContainer(containerNameOrId: string): Promise<void> {
    await execAsync(`docker stop ${containerNameOrId}`);
  }

  async removeContainer(containerNameOrId: string, force: boolean = false): Promise<void> {
    const forceFlag = force ? '-f' : '';
    await execAsync(`docker rm ${forceFlag} ${containerNameOrId}`);
  }

  async getContainerStatus(containerNameOrId: string): Promise<ContainerStatus> {
    try {
      const { stdout } = await execAsync(
        `docker inspect --format='{{.State.Status}}' ${containerNameOrId}`
      );
      const status = stdout.trim().toLowerCase();
      return this.mapStatus(status);
    } catch {
      return ContainerStatus.NotFound;
    }
  }

  async getContainerInfo(containerNameOrId: string): Promise<ContainerInfo | null> {
    try {
      const { stdout } = await execAsync(
        `docker inspect --format='{{json .}}' ${containerNameOrId}`
      );
      const data = JSON.parse(stdout.trim());
      return this.parseContainerInfo(data);
    } catch {
      return null;
    }
  }

  async listContainers(imageFilter?: string): Promise<ContainerInfo[]> {
    try {
      let command = "docker ps -a --format='{{json .}}'";
      if (imageFilter) {
        command += ` --filter ancestor=${imageFilter}`;
      }

      const { stdout } = await execAsync(command);
      if (!stdout.trim()) {
        return [];
      }

      const lines = stdout.trim().split('\n');
      const containers: ContainerInfo[] = [];

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          containers.push(this.parseContainerListItem(data));
        } catch {
          // Skip invalid JSON
        }
      }

      return containers;
    } catch {
      return [];
    }
  }

  async getContainerLogs(containerNameOrId: string, tail: number = 100): Promise<string> {
    try {
      const { stdout, stderr } = await execAsync(`docker logs --tail ${tail} ${containerNameOrId}`);
      return stdout + stderr;
    } catch (error) {
      throw new Error(`Failed to get logs: ${error}`);
    }
  }

  async pullImage(imageName: string): Promise<void> {
    await execAsync(`docker pull ${imageName}`);
  }

  async imageExists(imageName: string): Promise<boolean> {
    try {
      await execAsync(`docker image inspect ${imageName}`);
      return true;
    } catch {
      return false;
    }
  }

  // Helper methods

  private buildRunArgs(config: ContainerConfig): string[] {
    const args: string[] = [];

    if (config.name) {
      args.push(`--name ${config.name}`);
    }

    for (const port of config.ports) {
      const protocol = port.protocol || 'tcp';
      args.push(`-p ${port.hostPort}:${port.containerPort}/${protocol}`);
    }

    for (const [key, value] of Object.entries(config.environment)) {
      args.push(`-e ${key}=${this.escapeEnvValue(value)}`);
    }

    if (config.volumes) {
      for (const volume of config.volumes) {
        const readOnly = volume.readOnly ? ':ro' : '';
        args.push(`-v ${volume.hostPath}:${volume.containerPath}${readOnly}`);
      }
    }

    if (config.network) {
      args.push(`--network ${config.network}`);
    }

    return args;
  }

  private escapeEnvValue(value: string): string {
    // Escape special characters for shell
    return `"${value.replace(/"/g, '\\"')}"`;
  }

  private mapStatus(status: string): ContainerStatus {
    const statusMap: Record<string, ContainerStatus> = {
      running: ContainerStatus.Running,
      exited: ContainerStatus.Exited,
      paused: ContainerStatus.Paused,
      restarting: ContainerStatus.Restarting,
      removing: ContainerStatus.Removing,
      dead: ContainerStatus.Dead,
      created: ContainerStatus.Created,
    };
    return statusMap[status] || ContainerStatus.Stopped;
  }

  private parseContainerInfo(data: any): ContainerInfo {
    const ports = this.parsePorts(data.NetworkSettings?.Ports || {});

    return {
      id: data.Id?.substring(0, 12) || '',
      name: data.Name?.replace(/^\//, '') || '',
      image: data.Config?.Image || '',
      status: this.mapStatus(data.State?.Status || ''),
      ports,
      created: new Date(data.Created),
      state: {
        running: data.State?.Running || false,
        paused: data.State?.Paused || false,
        restarting: data.State?.Restarting || false,
        startedAt: data.State?.StartedAt ? new Date(data.State.StartedAt) : undefined,
        finishedAt: data.State?.FinishedAt ? new Date(data.State.FinishedAt) : undefined,
      },
    };
  }

  private parseContainerListItem(data: any): ContainerInfo {
    const ports = this.parsePortsString(data.Ports || '');

    return {
      id: data.ID || '',
      name: data.Names || '',
      image: data.Image || '',
      status: this.mapStatus(data.State?.toLowerCase() || ''),
      ports,
      created: new Date(data.CreatedAt || Date.now()),
      state: {
        running: data.State?.toLowerCase() === 'running',
        paused: data.State?.toLowerCase() === 'paused',
        restarting: data.State?.toLowerCase() === 'restarting',
      },
    };
  }

  private parsePorts(portsData: Record<string, any[]>): PortMapping[] {
    const ports: PortMapping[] = [];

    for (const [containerPort, hostBindings] of Object.entries(portsData)) {
      if (!hostBindings) continue;

      const [port, protocol] = containerPort.split('/');

      for (const binding of hostBindings) {
        ports.push({
          containerPort: parseInt(port, 10),
          hostPort: parseInt(binding.HostPort, 10),
          protocol: protocol as 'tcp' | 'udp',
        });
      }
    }

    return ports;
  }

  private parsePortsString(portsStr: string): PortMapping[] {
    const ports: PortMapping[] = [];
    if (!portsStr) return ports;

    // Parse format like "0.0.0.0:5432->5432/tcp, 0.0.0.0:5433->5433/tcp"
    const mappings = portsStr.split(', ');

    for (const mapping of mappings) {
      const match = mapping.match(/(\d+)->(\d+)\/(\w+)/);
      if (match) {
        ports.push({
          hostPort: parseInt(match[1], 10),
          containerPort: parseInt(match[2], 10),
          protocol: match[3] as 'tcp' | 'udp',
        });
      }
    }

    return ports;
  }
}
