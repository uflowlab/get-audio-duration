const express = require('express');
const { getAudioDurationInSeconds } = require('get-audio-duration');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs/promises');
const path = require('path');
const axios = require('axios');
const app = express();
const ffmpeg = require('fluent-ffmpeg');
const tmp = require('tmp');

app.use(express.json());

app.get('/healthz/', async (req, res) => {
  return res.json({ message: 'success' })
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
    durationSeconds: seconds,
    durationMilliseconds: Math.round(seconds * 1000),
    human: new Date(seconds * 1000).toISOString().substring(11, 19) // HH:MM:SS
  };
}


app.post('/combine-audios', async (req, res) => {
  const { urls } = req.body;

  // Function to download audio from a URL and save to a temporary file
  async function downloadAudio(url) {
    const response = await axios({ url, responseType: 'stream' });
    const tempFile = tmp.tmpNameSync({ postfix: '.mp3' });
    const writer = fs.createWriteStream(tempFile);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(tempFile));
      writer.on('error', (err) => reject(err));
    });
  }

  try {
    // 1. Download all the audio files
    const tempFiles = await Promise.all(urls.map(downloadAudio));

    // 2. Create a temp file list for ffmpeg
    const ffmpegInput = tempFiles.map(file => `file '${file}'`).join('\n');
    const tempFileList = tmp.tmpNameSync({ postfix: '.txt' });
    fs.writeFileSync(tempFileList, ffmpegInput);

    // 3. Create a temporary output file
    const outputFile = tmp.tmpNameSync({ postfix: '.mp3' });

    // 4. Run ffmpeg to concatenate
    ffmpeg()
      .input(tempFileList)
      .inputOptions('-f concat', '-safe 0')
      .output(outputFile)
      .on('end', () => {
        // 5. Send the resulting audio file
        res.sendFile(outputFile, err => {
          // Clean up files after sending
          tempFiles.forEach(f => fs.unlinkSync(f));
          fs.unlinkSync(tempFileList);
          fs.unlinkSync(outputFile);
          if (err) {
            console.error('Error sending file:', err);
          }
        });
      })
      .on('error', (err) => {
        console.error('Error during concatenation:', err);
        tempFiles.forEach(f => fs.unlinkSync(f));
        fs.unlinkSync(tempFileList);
        res.status(500).json({ error: 'Audio concatenation failed.' });
      })
      .run();
  } catch (err) {
    console.error('Unexpected error:', err);
    res.status(500).json({ error: 'Server error during processing.' });
  }
});

/* Fire it up! */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🎵  Duration server listening on http://localhost:${PORT}`));

