const fs = require('fs').promises;
const path = require('path');
const https = require('https');

// API anahtarı
const API_KEY = 'sk_eb72557eae8f1a93e619882a6abb2b1b0150b226c88f27e6';

async function convertToSpeech(text) {
    try {
        const options = {
            hostname: 'api.elevenlabs.io',
            path: '/v1/text-to-speech/pqHfZKP75CvOlQylNhV4',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'xi-api-key': API_KEY
            }
        };

        // Metni düzenle: Yavaş okuma için SSML prosody ekle ve parçalar arası boşluk
        const ssmlText = `<prosody rate="slow">${text}</prosody><break time="6s"/>`;

        const data = JSON.stringify({
            text: ssmlText,
            model_id: "eleven_multilingual_v2",  
            voice_settings: {
                stability: 0.95,           // Daha stabil ses
                similarity_boost: 0.85,    // Daha net telaffuz
                style: 0.15,              // Daha monoton, kelimeleri yutmayan
                use_speaker_boost: true
            }
        });

        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                if (res.statusCode !== 200) {
                    let error = '';
                    res.on('data', chunk => error += chunk);
                    res.on('end', () => {
                        console.log('Response Body:', error);
                        reject(new Error(`HTTP Error: ${res.statusCode}`));
                    });
                    return;
                }

                const chunks = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('end', () => {
                    resolve(Buffer.concat(chunks));
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.write(data);
            req.end();
        });
    } catch (error) {
        console.error(`Hata (convertToSpeech): ${error.message}`);
        throw error;
    }
}

async function processDescriptions() {
    try {
        // Dosya adı ve dil parametreleri
        const dosya = process.argv[2];
        if (!dosya) {
            throw new Error('Lütfen bir klasör adı belirtin (örnek: node index.js venus)');
        }

        const dil = "tr";
        const jsonPath = path.join(__dirname, dosya, `${dil}.json`);

        // JSON dosyasının varlığını kontrol et
        try {
            await fs.access(jsonPath);
        } catch {
            throw new Error(`${jsonPath} dosyası bulunamadı`);
        }

        // JSON dosyasını oku
        const data = require(jsonPath);
        
        console.log(`İşleniyor: ${dosya}`);
        console.log(`Toplam bölüm sayısı: ${data.child.length}`);

        // 1. bölüm hariç diğer bölümler için
        for (let i = 1; i < data.child.length; i++) {
            const bolum = data.child[i];
            const outputFile = path.join(__dirname, dosya, `bolum${i + 1}.mp3`);
            
            console.log(`\nBölüm ${i + 1} işleniyor...`);
            console.log(`Bu bölümde ${bolum.description.length} parça var`);

            // Tüm metinleri birleştir ve noktalama işaretlerinden sonra küçük boşluklar ekle
            const fullText = bolum.description.join('. ').replace(/\./g, '.<break time="0.5s"/>');
            
            console.log('Ses dönüşümü başlıyor...');
            const audioBuffer = await convertToSpeech(fullText);
            
            // Ses dosyasını kaydet
            await fs.writeFile(outputFile, audioBuffer);
            console.log(`Ses dosyası oluşturuldu: ${outputFile}`);

            // API limitleri için bekleme
            if (i < data.child.length - 1) {
                console.log('Sonraki bölüm için 10 saniye bekleniyor...');
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }

        console.log('\nTüm bölümler tamamlandı.');
    } catch (error) {
        console.error('İşlem sırasında hata oluştu:', error.message);
        process.exit(1);
    }
}

// Programı çalıştır
processDescriptions();
