document.getElementById('locationForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    const location = document.getElementById('location').value.trim();
    if (!location) {
        document.getElementById('weatherResult').innerHTML = `<p>Por favor, insira uma localização válida.</p>`;
        return;
    }

    document.getElementById('weatherResult').innerHTML = `<p>Carregando...</p>`;
    try {
        const keys = await fetch('/api/keys').then(res => res.json());
        const { lat, lng } = await getCoordinates(location, keys.openCageApiKey);
        await obterClima(lat, lng, keys.azureApiKey);
    } catch (error) {
        document.getElementById('weatherResult').innerHTML = `<p>Erro: ${error.message}</p>`;
    }
});

async function getCoordinates(location, openCageApiKey) {
    const response = await fetch(`https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(location)}&key=${openCageApiKey}`);
    const data = await response.json();

    if (data.results.length === 0) {
        throw new Error('Localização não encontrada.');
    }

    return data.results[0].geometry;
}

async function obterClima(latitude, longitude, azureApiKey) {
    const response = await fetch(`https://atlas.microsoft.com/weather/currentConditions/json?api-version=1.1&query=${latitude},${longitude}&subscription-key=${azureApiKey}`);
    const data = await response.json();

    if (!data.results || data.results.length === 0) {
        throw new Error('Dados climáticos não encontrados.');
    }

    const weather = data.results[0];
    document.getElementById('weatherResult').innerHTML = `
        <h2>${weather.phrase}</h2>
        <p>Temperatura: ${weather.temperature.value}°${weather.temperature.unit}</p>
        <p>Sensação Térmica: ${weather.realFeelTemperature.value}°${weather.realFeelTemperature.unit}</p>
        <p>Umidade: ${weather.relativeHumidity}%</p>
        <p>Vento: ${weather.wind.speed.value} ${weather.wind.speed.unit} de ${weather.wind.direction.localizedDescription}</p>
        <p>Índice UV: ${weather.uvIndex} (${weather.uvIndexPhrase})</p>
    `;
}