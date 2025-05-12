const express = require('express');
const { getAudioDurationInSeconds } = require('get-audio-duration');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs/promises');
const path = require('path');
const axios = require('axios');
const app    = express();

app.use(express.json());

app.get('/healthz/', async (req, res) => {
	return res.json({message: 'success'})
})


app.post('/duration', async (req, res) => {
  const { url } = req.body;

  if (!url) return res.status(400).json({ error: 'Missing "url" in request body' });

  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);

    // Generate a temporary filename
    const tempFilePath = path.join('/tmp', `${uuidv4()}.wav`);
    await fs.writeFile(tempFilePath, buffer);

    const seconds = await getAudioDurationInSeconds(tempFilePath);

    // Clean up the temp file
    await fs.unlink(tempFilePath);

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

