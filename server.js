const express = require('express');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'private/.env') });

const app = express();
const port = 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use('/image', express.static(path.join(__dirname, 'image'))); // Adicione esta linha para servir a pasta de imagens


app.get('/api/keys', (req, res) => {
    res.json({
        openCageApiKey: process.env.OPENCAGE_API_KEY,
        azureApiKey: process.env.AZURE_API_KEY
    });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});