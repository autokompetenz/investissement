// Une fonction minimale, pour distinguer un probleme de packaging d'un
// probleme dans le code de register.
export default async function handler() {
  return new Response(JSON.stringify({ ok: true, neon: true }), {
    headers: { "content-type": "application/json" },
  });
}
