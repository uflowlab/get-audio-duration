const express = require('express');
const multer  = require('multer');
const { getAudioDurationInSeconds } = require('get-audio-duration');

const app    = express();
const upload = multer({ storage: multer.memoryStorage() }); // keep everything in RAM


app.get('/healthz/', async (req, res) => {
	return res.json({message: 'success'})
})

app.post('/duration', async (req, res) => {
  const { url } = req.body;

  if (!url) return res.status(400).json({ error: 'Missing "url" in request body' });

  try {
    // Download the audio file as a buffer
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);

    const seconds = await getAudioDurationInSeconds(buffer);

    // Optional: Extract file name from URL
    const fileName = url.split('/').pop() || 'unknown';

    return res.json(buildPayload(seconds, fileName));
  } catch (err) {
    console.error(err);
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

