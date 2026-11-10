// Video enviado em 4K/H.264 High trava nas TV boxes (WebView nao decodifica liso).
// Converte pra no maximo 1080p, H.264 Main, sem audio (o player toca mudo), com faststart.
const { execFile } = require('child_process');

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

module.exports = { transcode, probe };
