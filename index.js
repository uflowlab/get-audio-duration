const express = require('express');
const { getAudioDurationInSeconds } = require('get-audio-duration');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs/promises');
const path = require('path');
const axios = require('axios');
const app = express();
const ffmpeg = require('fluent-ffmpeg');
const tmp = require('tmp');
const fsSync = require('fs');


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
  let { urls } = req.body;

  // Split URLs
  urls = urls.split(', ');

  // Function to download audio from a URL and save to a temporary file
  async function downloadAudio(url) {
    const tempFile = tmp.tmpNameSync({ postfix: '.mp3' });
    const writer = fsSync.createWriteStream(tempFile);
    const response = await axios({ url, responseType: 'stream' });

    return new Promise((resolve, reject) => {
      response.data.pipe(writer);
      writer.on('finish', () => resolve(tempFile));
      writer.on('error', reject);
    });
  }

  try {
    // Download all audio files
    const audioFiles = await Promise.all(urls.map(downloadAudio));

    // Create file list for ffmpeg
    const fileListContent = audioFiles.map(file => `file '${file}'`).join('\n');
    const listFile = tmp.tmpNameSync({ postfix: '.txt' });
    fsSync.writeFileSync(listFile, fileListContent); // Write the list file

    // Generate the output file in the tmp folder
    const outputFile = tmp.tmpNameSync({ postfix: '.mp3' });

    console.log('List file:', listFile); // Debugging
    console.log('Output file:', outputFile); // Debugging

    // Running FFmpeg
    ffmpeg()
      .input(listFile) // Input list of files
      .inputOptions('-f', 'concat', '-safe', '0') // Concat protocol
      .outputOptions('-c:a', 'mp3') // Re-encode to mp3
      .output(outputFile) // Output to temporary file
      .on('end', () => {
        console.log('FFmpeg finished concatenation');

        // Send the output file in response
        res.sendFile(outputFile, (err) => {
          if (err) {
            console.error('SendFile error:', err);
          }

          // Clean up temp files
          fsSync.unlink(outputFile, () => {});
          fsSync.unlink(listFile, () => {});
          audioFiles.forEach(file => fsSync.unlink(file, () => {}));
        });
      })
      .on('error', (err) => {
        console.error('FFmpeg error:', err);

        // Clean up
        fsSync.unlink(listFile, () => {});
        audioFiles.forEach(file => fsSync.unlink(file, () => {}));

        // Send error response
        res.status(500).json({ error: 'Failed to combine audio.' });
      })
      .run(); // Run FFmpeg
  } catch (err) {
    console.error('Unexpected error:', err);
    res.status(500).json({ error: 'Unexpected server error.' });
  }
});

/* Fire it up! */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🎵  Duration server listening on http://localhost:${PORT}`));

