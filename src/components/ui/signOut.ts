export async function signOut() {
  try { await fetch("/api/auth/logout", { method: "POST" }); } finally { window.location.href = "/login"; }
}
