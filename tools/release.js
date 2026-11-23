// Legger ut gjeldende versjon som GitHub Release, slik at installerte apper oppdaterer seg.
// Kjør: npm run release   (krever innlogget gh CLI)
// Endringsnotat kan gis slik: npm run release -- "Hva som er nytt"
const { execFileSync } = require('child_process');
const path = require('path');
const pkg = require('../package.json');

const V = pkg.version, tag = `v${V}`;
const { owner, repo } = pkg.updates;
const notes = process.argv[2] || `Ferdaboka ${V}`;
const dist = path.join(__dirname, '../dist');
execFileSync('gh', ['release', 'create', tag, '--repo', `${owner}/${repo}`, '--title', `Ferdaboka ${V}`, '--notes', notes,
  path.join(dist, `Ferdaboka-Setup-${V}.exe`), path.join(dist, 'latest.yml')], { stdio: 'inherit' });
console.log(`Publisert ${tag}. Installerte apper henter oppdateringen neste gang de starter.`);
