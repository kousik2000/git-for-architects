import { permissionConfig } from './permission-config';
import type { PermissionKey } from './permissions';

/**
 * Evaluates whether the current application context has a specific permission.
 * In Phase 5.9B, this simply reads from the local permissionConfig object.
 * @param permission - The permission key to check
 * @returns true if the permission is granted, false otherwise.
 */
export function hasPermission(permission: string): boolean {
  if (permission in permissionConfig) {
    return permissionConfig[permission as PermissionKey];
  }
  
  // Default deny for unknown permissions
  return false;
}
