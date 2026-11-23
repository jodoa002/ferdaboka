// Automatisk røyktest: starter appen med tom datamappe, tegner en tur og tar skjermbilder.
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ferd-'));
app.setPath('userData', tmp);
const OUT = process.env.SHOT_DIR || '/tmp/shots';
fs.mkdirSync(OUT, { recursive: true });

require('../src/main.js');

const wait = (ms) => new Promise(r => setTimeout(r, ms));
app.on('browser-window-created', async (_e, win) => {
  const wc = win.webContents;
  wc.on('console-message', (_e, lvl, msg) => console.log('[renderer]', msg));
  await new Promise(r => wc.once('did-finish-load', r));
  await wait(1500);
  win.setSize(1600, 1000);
  const shot = async (name) => { await wait(500); const img = await wc.capturePage(); fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG()); console.log('skjermbilde', name); };
  const js = (code) => wc.executeJavaScript(code);
  try {
    await shot('1-start');
    await js(`document.querySelector('.map-card').click()`);
    await wait(1500);
    await shot('2-kart');
    // tegn en tur med ekte musehendelser
    await js(`setTool('draw')`);
    const pts = [];
    for (let i = 0; i <= 60; i++) { const t = i / 60; pts.push([520 + 380 * t + 40 * Math.sin(t * 9), 330 + 220 * t + 50 * Math.sin(t * 5)]); }
    const send = (type, [x, y], extra = {}) => wc.sendInputEvent({ type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1, ...extra });
    send('mouseMove', pts[0]); send('mouseDown', pts[0]);
    for (const p of pts.slice(1)) { send('mouseMove', p, { modifiers: ['leftButtonDown'] }); await wait(8); }
    send('mouseUp', pts[pts.length - 1]);
    await wait(400);
    const info = await js(`JSON.stringify({ trips: state.data.trips.length, strokes: selected()?.strokes.length, pts: selected()?.strokes[0]?.length, km: tripKm(selected()) })`);
    console.log('etter tegning:', info);
    // fyll ut detaljer og legg til et bilde
    const media = path.join(tmp, 'media'); fs.mkdirSync(media, { recursive: true });
    fs.copyFileSync(path.join(__dirname, '../build/icon.png'), path.join(media, 'test1.png'));
    fs.copyFileSync(path.join(__dirname, '../assets/maps/trondheim.jpg'), path.join(media, 'test2.jpg'));
    await js(`(() => { const t = selected(); t.title = 'Gråkallen rundt'; t.category = 'Fjelltur'; t.description = 'Startet ved Skistua, gikk opp til Gråkallen og videre rundt Lianvatnet. Klar sikt over fjorden!'; t.photos.push('media/test1.png','media/test2.jpg'); touch(t); showDetail(); })()`);
    await shot('3-tur-detaljer');
    // tegn en tur nr. 2 i annen farge
    await js(`showList(); pickColor('#1f3f6e'); setTool('draw')`);
    const p2 = []; for (let i = 0; i <= 40; i++) { const t = i / 40; p2.push([300 + 200 * t, 600 - 250 * t + 30 * Math.cos(t * 7)]); }
    send('mouseMove', p2[0]); send('mouseDown', p2[0]);
    for (const p of p2.slice(1)) { send('mouseMove', p, { modifiers: ['leftButtonDown'] }); await wait(8); }
    send('mouseUp', p2[p2.length - 1]);
    await wait(300);
    // visk ut litt på midten
    await js(`setTool('erase')`);
    send('mouseMove', p2[20]); send('mouseDown', p2[20]); send('mouseMove', [p2[21][0] + 3, p2[21][1]], { modifiers: ['leftButtonDown'] }); send('mouseUp', p2[21]);
    await wait(300);
    console.log('etter visking:', await js(`JSON.stringify(selected().strokes.map(s=>s.length))`));
    await js(`undoRedo(state.undo, state.redo)`);
    console.log('etter angre:', await js(`JSON.stringify(selected().strokes.map(s=>s.length))`));
    await js(`(() => { const t = selected(); t.title = 'Kveldstur til Lian'; t.date = '2026-09-14'; touch(t); showList(); setTool('pan'); })()`);
    await shot('4-turliste');
    // zoom inn
    await js(`zoomAt(700, 450, 2.2)`); await wait(300);
    await shot('5-zoom');
    // legg til eget kart og sjekk startmenyen
    fs.copyFileSync(path.join(__dirname, '../build/icon.png'), path.join(media, 'kart.png'));
    await js(`state.data.maps.push({ id: 'x1', name: 'Oppdal og Trollheimen', subtitle: 'Sommerturer i fjellet', image: 'media/kart.png', width: 512, height: 512, kmPerPx: null }); save(); $('backBtn').click();`);
    await shot('6-start-med-turer');
    await js(`setTimeout(addMapDialog); 1`); await wait(300);
    await shot('7-nytt-kart-dialog');
    await wait(800);
    console.log('lagret fil:', fs.readFileSync(path.join(tmp, 'ferdaboka.json'), 'utf8').slice(0, 300));
  } catch (err) { console.error('FEIL', err); }
  app.exit(0);
});
