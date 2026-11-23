// Publiserer gjeldende versjon: lager en tag (v<versjon>) med endringsnotat og laster den opp.
// GitHub Actions (.github/workflows/release.yml) bygger da installeren på Windows og legger ut releasen.
// Kjør: npm run release -- "Hva som er nytt"
const { execFileSync } = require('child_process');
const pkg = require('../package.json');
const tag = `v${pkg.version}`;
const notes = process.argv[2] || `Ferdaboka ${pkg.version}`;
const git = (...a) => execFileSync('git', a, { stdio: 'inherit' });
git('tag', '-a', tag, '-m', notes);
git('push', 'origin', tag);
console.log(`Lastet opp ${tag}. Følg byggingen under «Actions» på GitHub; installerte apper oppdaterer seg når releasen er ute.`);
