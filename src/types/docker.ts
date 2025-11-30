/**
 * Docker container status
 */
export enum ContainerStatus {
  Running = 'running',
  Stopped = 'stopped',
  Created = 'created',
  Paused = 'paused',
  Restarting = 'restarting',
  Removing = 'removing',
  Exited = 'exited',
  Dead = 'dead',
  NotFound = 'not-found',
}

/**
 * Docker container configuration
 */
export interface ContainerConfig {
  name: string;
  image: string;
  ports: PortMapping[];
  environment: Record<string, string>;
  volumes?: VolumeMount[];
  network?: string;
}

/**
 * Port mapping for Docker container
 */
export interface PortMapping {
  hostPort: number;
  containerPort: number;
  protocol?: 'tcp' | 'udp';
}

/**
 * Volume mount for Docker container
 */
export interface VolumeMount {
  hostPath: string;
  containerPath: string;
  readOnly?: boolean;
}

/**
 * Docker container info
 */
export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: ContainerStatus;
  ports: PortMapping[];
  created: Date;
  state: {
    running: boolean;
    paused: boolean;
    restarting: boolean;
    startedAt?: Date;
    finishedAt?: Date;
  };
}

/**
 * Database template for quick Docker setup
 */
export interface DatabaseTemplate {
  type: string;
  name: string;
  description: string;
  image: string;
  defaultPort: number;
  environmentVariables: {
    name: string;
    description: string;
    required: boolean;
    default?: string;
  }[];
}

/**
 * Predefined database templates
 */
export const DATABASE_TEMPLATES: DatabaseTemplate[] = [
  {
    type: 'postgresql',
    name: 'PostgreSQL',
    description: 'PostgreSQL is a powerful, open-source object-relational database system',
    image: 'postgres:16-alpine',
    defaultPort: 5432,
    environmentVariables: [
      { name: 'POSTGRES_PASSWORD', description: 'Superuser password', required: true },
      {
        name: 'POSTGRES_USER',
        description: 'Superuser name',
        required: false,
        default: 'postgres',
      },
      {
        name: 'POSTGRES_DB',
        description: 'Default database',
        required: false,
        default: 'postgres',
      },
    ],
  },
  {
    type: 'mysql',
    name: 'MySQL',
    description: "MySQL is the world's most popular open-source relational database",
    image: 'mysql:8',
    defaultPort: 3306,
    environmentVariables: [
      { name: 'MYSQL_ROOT_PASSWORD', description: 'Root password', required: true },
      { name: 'MYSQL_DATABASE', description: 'Default database', required: false },
      { name: 'MYSQL_USER', description: 'Additional user', required: false },
      { name: 'MYSQL_PASSWORD', description: 'Additional user password', required: false },
    ],
  },
  {
    type: 'mongodb',
    name: 'MongoDB',
    description: 'MongoDB is a document-oriented NoSQL database',
    image: 'mongo:7',
    defaultPort: 27017,
    environmentVariables: [
      {
        name: 'MONGO_INITDB_ROOT_USERNAME',
        description: 'Root username',
        required: false,
        default: 'admin',
      },
      { name: 'MONGO_INITDB_ROOT_PASSWORD', description: 'Root password', required: true },
    ],
  },
  {
    type: 'redis',
    name: 'Redis',
    description: 'Redis is an in-memory data structure store',
    image: 'redis:7-alpine',
    defaultPort: 6379,
    environmentVariables: [],
  },
];
