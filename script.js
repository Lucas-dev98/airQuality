document.getElementById('locationForm').addEventListener('submit', function (e) {
    e.preventDefault();

    const location = document.getElementById('location').value;
    const openCageApiKey = 'd729f70e1b9f41d0afc4f075efbf8b6e'; // Substitua pela sua chave de API do OpenCage

    // Fazendo uma requisição para a API de Geocodificação do OpenCage
    fetch(`https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(location)}&key=${openCageApiKey}`)
        .then(response => response.json())
        .then(data => {
            if (data.results.length > 0) {
                const { lat, lng } = data.results[0].geometry;

                // Chama a API de condições climáticas usando as coordenadas obtidas
                obterClima(lat, lng);
            } else {
                document.getElementById('weatherResult').innerHTML = `<p>Localização não encontrada.</p>`;
            }
        })
        .catch(error => {
            document.getElementById('weatherResult').innerHTML = `<p>Erro ao obter localização: ${error.message}</p>`;
        });
});

function obterClima(latitude, longitude) {
    const azureApiKey = 'DoZFAPaQ03w353yM2SeAsbGzO5DydnWcbQ9ILS3vvFOkk2Z3PD7dJQQJ99AGAC8vTInO7kh4AAAgAZMP7EHq'; // Substitua pela sua chave de API do Azure Maps

    fetch(`https://atlas.microsoft.com/weather/currentConditions/json?api-version=1.1&query=${latitude},${longitude}&subscription-key=${azureApiKey}`)
        .then(response => response.json())
        .then(data => {
            const weather = data.results[0];
            document.getElementById('weatherResult').innerHTML = `
                <h2>${weather.phrase}</h2>
                <p>Temperatura: ${weather.temperature.value}°${weather.temperature.unit}</p>
                <p>Sensação Térmica: ${weather.realFeelTemperature.value}°${weather.realFeelTemperature.unit}</p>
                <p>Umidade: ${weather.relativeHumidity}%</p>
                <p>Vento: ${weather.wind.speed.value} ${weather.wind.speed.unit} de ${weather.wind.direction.localizedDescription}</p>
                <p>Índice UV: ${weather.uvIndex} (${weather.uvIndexPhrase})</p>
            `;
        })
        .catch(error => {
            document.getElementById('weatherResult').innerHTML = `<p>Erro ao obter dados climáticos: ${error.message}</p>`;
        });
}
