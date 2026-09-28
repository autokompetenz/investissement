export default async function handler() {
  // Aucune importation. Une constante, une chaine. Si ceci expire aussi, le
  // probleme n'est ni le code ni les dependances : c'est le demarrage de la
  // fonction sur cette plateforme.
  return new Response("ok", { status: 200 });
}
