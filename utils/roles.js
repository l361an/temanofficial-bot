// utils/roles.js
export function isAdminRole(role) {
  return role === "admin" || role === "superadmin" || role === "owner";
}

export function isSuperadminRole(role) {
  return role === "superadmin" || role === "owner";
}
