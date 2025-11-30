/**
 * Shared types for database clients
 */

import { TableInfo, ViewInfo, FunctionInfo } from '../../types';

/**
 * Trigger information
 */
export interface TriggerInfo {
  name: string;
  table: string;
  event: string;
  timing: string;
  definition?: string;
}

/**
 * Procedure information
 */
export interface ProcedureInfo {
  name: string;
  schema: string;
  returnType: string;
  parameters: ParameterInfo[];
  definition?: string;
}

/**
 * Parameter information
 */
export interface ParameterInfo {
  name: string;
  type: string;
  mode: 'IN' | 'OUT' | 'INOUT';
}

/**
 * Database info
 */
export interface DatabaseInfo {
  name: string;
  owner?: string; // Optional for MySQL
  encoding: string;
  size?: string; // Optional for MySQL
  isCurrent?: boolean; // Optional for MySQL
  collation?: string; // MySQL-specific
}

/**
 * Role/User info
 */
export interface RoleInfo {
  name: string;
  isSuper: boolean;
  canLogin: boolean;
  canCreateDb: boolean;
  canCreateRole: boolean;
}

/**
 * Schema objects container
 */
export interface SchemaObjects {
  tables: TableInfo[];
  views: ViewInfo[];
  functions: FunctionInfo[];
  procedures: ProcedureInfo[];
}

/**
 * User information
 */
export interface UserInfo {
  name: string;
  host: string;
  isSuperUser: boolean;
  hasCreatePrivilege: boolean;
  hasPasswordExpired: boolean;
}
