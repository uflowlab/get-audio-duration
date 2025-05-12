const express = require('express');
const multer  = require('multer');
const { getAudioDurationInSeconds } = require('get-audio-duration');

const app    = express();
const upload = multer({ storage: multer.memoryStorage() }); // keep everything in RAM


app.get('/health/', async (req, res) => {
	return res.json({message: 'success'})
})
/* GET route (uses a file already on disk) ───────────────────────────── */
app.get('/duration', async (req, res) => {
  const { file } = req.query;
  if (!file) return res.status(400).json({ error: 'Missing ?file=/path/to/audio' });

  try {
    const seconds = await getAudioDurationInSeconds(file);
    return res.json(buildPayload(seconds, file));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* POST route (upload new audio via multipart) ───────────────────────── */
app.post('/duration', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Form field "audio" not found' });

  try {
    const buffer  = req.file.buffer;
    const seconds = await getAudioDurationInSeconds(buffer); // library accepts Buffers
    return res.json(buildPayload(seconds, req.file.originalname));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* Helper to format the JSON response */
function buildPayload(seconds, identifier) {
  return {
    file: identifier,
    durationSeconds:      seconds,
    durationMilliseconds: Math.round(seconds * 1000),
    human: new Date(seconds * 1000).toISOString().substring(11, 19) // HH:MM:SS
  };
}

/* Fire it up! */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🎵  Duration server listening on http://localhost:${PORT}`));

