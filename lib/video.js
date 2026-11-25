// Video enviado em 4K/H.264 High trava nas TV boxes (WebView nao decodifica liso).
// Converte pra no maximo 1080p, H.264 Main, sem audio (o player toca mudo), com faststart.
const { execFile, spawn } = require('child_process');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const run = (cmd, args) => new Promise((resolve, reject) =>
  execFile(cmd, args, { maxBuffer: 1024 * 1024 }, (err, stdout) => (err ? reject(err) : resolve(stdout))));

async function probe(file) {
  const out = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,profile,width,height', '-of', 'json', file]);
  return (JSON.parse(out).streams || [])[0] || null;
}

// Ja serve pra TV como esta? H.264 Main/Baseline ate 1920x1080.
const playable = (s) => s.codec_name === 'h264' && /^(Main|Baseline|Constrained Baseline)$/.test(s.profile || '')
  && Math.max(s.width, s.height) <= 1920 && Math.min(s.width, s.height) <= 1080;

// true = gravou `output`; false = arquivo ja servia, nada feito. Rejeita se ffmpeg falhar.
async function transcode(input, output) {
  const s = await probe(input);
  if (!s) throw new Error('sem trilha de video');
  if (playable(s)) return false;
  await run('ffmpeg', ['-y', '-v', 'error', '-i', input,
    // cabe em 1920x1080 (vertical tambem), sem aumentar video menor; -2 mantem dimensao par
    '-vf', "scale='if(gt(iw,ih),min(1920,iw),-2)':'if(gt(iw,ih),-2,min(1920,ih))'",
    '-c:v', 'libx264', '-profile:v', 'main', '-level', '4.0', '-pix_fmt', 'yuv420p',
    '-preset', 'medium', '-crf', '23', '-maxrate', '5M', '-bufsize', '10M', '-r', '30',
    '-an', '-movflags', '+faststart', '-f', 'mp4', output]);
  return true;
}

// WebP animado roda na CPU da TV (nao usa o chip de video) e engasga: vira MP4.
// O ffmpeg nao le WebP animado, entao quem decodifica e o sharp.
const FPS = 30;
const OWNER_MAX_S = 7; // tempo maximo de uma imagem do dono na tela
const ADMIN_MAX_S = 60; // anuncio: teto so pra conversao nao prender a CPU do VPS

async function* rawFrames(sharp, input, meta, maxS) {
  const size = meta.width * meta.height * 3;
  // Poucos quadros por vez: 1080p descomprimido inteiro passa de 500 MB.
  const step = Math.max(1, Math.floor(8e6 / (meta.width * meta.height)));
  const total = maxS * FPS;
  let elapsed = 0, written = 0;
  for (let page = 0; page < meta.pages && written < total; page += step) {
    const pages = Math.min(step, meta.pages - page);
    const raw = await sharp(input, { page, pages, limitInputPixels: 40e6 }).removeAlpha().toColourspace('srgb').raw().toBuffer();
    for (let i = 0; i < pages && written < total; i++) {
      const ms = meta.delay?.[page + i] ?? 0;
      elapsed += ms > 10 ? ms : 100; // navegador trata atraso <= 10ms como 100ms
      // Animacao que toca uma vez so: segura o ultimo quadro, porque o player repete o video.
      const hold = meta.loop === 1 && page + i === meta.pages - 1;
      const until = hold ? total : Math.min(total, Math.round(elapsed * FPS / 1000));
      for (; written < until; written++) yield raw.subarray(i * size, (i + 1) * size);
    }
  }
}

// true = gravou `output`; false = nao e animado (ou tem transparencia, que o MP4 perderia).
async function webpToMp4(input, output, maxS = OWNER_MAX_S) {
  const sharp = require('sharp'); // aqui dentro: se o binario faltar no VPS, o site sobe do mesmo jeito
  const meta = await sharp(input, { limitInputPixels: false }).metadata();
  if (meta.format !== 'webp' || !(meta.pages > 1)) return false;
  // ponytail: olha so o 1o quadro; transparencia que aparece depois vira fundo solido.
  if (!(await sharp(input, { limitInputPixels: 40e6 }).stats()).isOpaque) return false;
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
    '-s', meta.width + 'x' + meta.height, '-r', String(FPS), '-i', '-',
    // cabe em 1920x1080 (ou 1080x1920), dimensao par; bt709 pra nao mudar a cor da arte
    '-filter_threads', '1', '-vf', "scale='min(iw,if(gt(iw,ih),1920,1080))':'min(ih,if(gt(iw,ih),1080,1920))':force_original_aspect_ratio=decrease:force_divisible_by=2:out_color_matrix=bt709",
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-c:v', 'libx264', '-profile:v', 'main', '-level', '4.0', '-pix_fmt', 'yuv420p',
    '-preset', 'medium', '-crf', '20', '-maxrate', '5M', '-bufsize', '10M',
    // sem limite, o x264 chega a 1 GB de RAM e derruba VPS pequeno
    '-threads', '1', '-x264-params', 'rc-lookahead=10:sync-lookahead=0', '-an', '-movflags', '+faststart', '-f', 'mp4', output], { stdio: ['pipe', 'ignore', 'pipe'] });
  let errText = '';
  ff.stderr.on('data', d => { errText = (errText + d).slice(-2000); });
  const done = new Promise((resolve, reject) => {
    ff.on('error', reject);
    ff.on('close', code => (code === 0 ? resolve() : reject(new Error('ffmpeg: ' + errText))));
  });
  const feed = pipeline(Readable.from(rawFrames(sharp, input, meta, maxS)), ff.stdin);
  // Espera os dois: se a leitura falhar, o ffmpeg fecharia "com sucesso" um video pela metade.
  const [fed, encoded] = await Promise.allSettled([feed, done]);
  if (encoded.status === 'rejected') throw encoded.reason;
  if (fed.status === 'rejected') throw fed.reason;
  return true;
}

module.exports = { transcode, webpToMp4, probe, ADMIN_MAX_S };
