import { ContainerConfig, ContainerInfo, ContainerStatus } from '../../types';

/**
 * Interface for Docker container management
 */
export interface IDockerService {
  /**
   * Check if Docker is available
   */
  isDockerAvailable(): Promise<boolean>;

  /**
   * Create and start a container
   */
  createContainer(config: ContainerConfig): Promise<string>;

  /**
   * Start an existing container
   */
  startContainer(containerNameOrId: string): Promise<void>;

  /**
   * Stop a running container
   */
  stopContainer(containerNameOrId: string): Promise<void>;

  /**
   * Remove a container
   */
  removeContainer(containerNameOrId: string, force?: boolean): Promise<void>;

  /**
   * Get container status
   */
  getContainerStatus(containerNameOrId: string): Promise<ContainerStatus>;

  /**
   * Get container info
   */
  getContainerInfo(containerNameOrId: string): Promise<ContainerInfo | null>;

  /**
   * List all containers (optionally filter by image)
   */
  listContainers(imageFilter?: string): Promise<ContainerInfo[]>;

  /**
   * Get container logs
   */
  getContainerLogs(containerNameOrId: string, tail?: number): Promise<string>;

  /**
   * Pull an image
   */
  pullImage(imageName: string): Promise<void>;

  /**
   * Check if an image exists locally
   */
  imageExists(imageName: string): Promise<boolean>;
}
