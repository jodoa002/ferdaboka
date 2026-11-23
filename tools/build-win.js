// Bygger Windows-installer og latest.yml for automatiske oppdateringer.
// Kjør: npm run dist   (krever makensis; på Linux brukes NSIS fra electron-builder-cachen)
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const root = path.join(__dirname, '..');
const pkg = require('../package.json');
const { owner, repo } = pkg.updates;
const V = pkg.version;
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', cwd: root, ...opts });

// 1) app-update.yml forteller den installerte appen hvor oppdateringer ligger
fs.writeFileSync(path.join(root, 'build/app-update.yml'),
  `provider: github\nowner: ${owner}\nrepo: ${repo}\nupdaterCacheDirName: ferdaboka-updater\n`);

// 2) app-filer
fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });
if (process.platform === 'win32') {
  // på Windows kan electron-builder sette ikon og versjonsinfo i Ferdaboka.exe
  run('npx electron-builder --win dir --x64 -c.win.signAndEditExecutable=true', [], { shell: true });
} else {
  run('npx', ['electron-builder', '--win', 'dir', '--x64']);
}

// 3) installer med NSIS
let makensis = 'makensis', env = process.env;
if (process.platform === 'win32') {
  const guess = ['C:\\Program Files (x86)\\NSIS\\makensis.exe', 'C:\\Program Files\\NSIS\\makensis.exe'].find(f => fs.existsSync(f));
  if (guess) makensis = guess;
}
const cached = path.join(os.homedir(), '.cache/electron-builder/nsis');
if (process.platform === 'linux' && fs.existsSync(cached)) {
  const dir = path.join(cached, fs.readdirSync(cached).find(d => d.startsWith('nsis-') && !d.includes('resources')));
  makensis = path.join(dir, 'linux/makensis');
  env = { ...process.env, NSISDIR: dir };
}
run(makensis, ['-V2', `-DVERSION=${V}`, 'ferdaboka.nsi'], { cwd: path.join(root, 'build'), env });

// 4) latest.yml (leses av electron-updater)
const exe = `Ferdaboka-Setup-${V}.exe`;
const buf = fs.readFileSync(path.join(root, 'dist', exe));
const sha512 = crypto.createHash('sha512').update(buf).digest('base64');
fs.writeFileSync(path.join(root, 'dist/latest.yml'),
  `version: ${V}\nfiles:\n  - url: ${exe}\n    sha512: ${sha512}\n    size: ${buf.length}\npath: ${exe}\nsha512: ${sha512}\nreleaseDate: '${new Date().toISOString()}'\n`);
console.log(`\nFerdig: dist/${exe} og dist/latest.yml (versjon ${V}, oppdateringer fra github.com/${owner}/${repo})`);
