/**
 * Resolve the name recorded on audit records (transactions, history entries).
 *
 * The signed-in user lives in AuthContext, but that value can be null — auth not
 * resolved yet, expired token, or an embedded/preview session — and reading
 * `user.full_name` straight off it threw "Cannot read properties of null".
 * Every audit write goes through this guard instead: it never throws and simply
 * falls back to 'Unknown'. No extra auth call is made from inside a mutation,
 * so a non-admin user can never be blocked mid-write by a 403.
 */
export function getPerformedBy(user) {
  if (user?.full_name) return user.full_name;
  if (user?.email) return user.email;
  if (user?.name) return user.name;
  return 'Unknown';
}