// Publisering skjer med GitHub Actions: oppdater versjonen i package.json og RELEASE_NOTES.md,
// last opp til main, og start «Bygg og publiser» under Actions på GitHub.
const pkg = require('../package.json');
console.log(`Versjon ${pkg.version}: gå til https://github.com/${pkg.updates.owner}/${pkg.updates.repo}/actions/workflows/release.yml og trykk «Run workflow».`);
