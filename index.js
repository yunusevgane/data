const fs = require("fs").promises;
const path = require("path");
const https = require("https");
const credits = require('./credits.js');

async function convertToSpeech(text) {
  try {
    const apiactive = credits.getApiActive();
    const options = {
      hostname: "api.elevenlabs.io",
      path: `/v1/text-to-speech/${apiactive.ses}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiactive.key,
      },
    };

    // Metni düzenle: Yavaş okuma için SSML prosody ekle ve parçalar arası boşluk
    const ssmlText = `<prosody rate="slow">${text}</prosody><break time="6s"/>`;

    const data = JSON.stringify({
      text: ssmlText,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.95, // Daha stabil ses
        similarity_boost: 0.85, // Daha net telaffuz
        style: 0.15, // Daha monoton, kelimeleri yutmayan
        use_speaker_boost: true,
      },
    });

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        if (res.statusCode !== 200) {
          let error = "";
          res.on("data", (chunk) => (error += chunk));
          res.on("end", () => {
            console.log("Response Body:", error);
            reject(new Error(`HTTP Error: ${res.statusCode}`));
          });
          return;
        }

        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve(Buffer.concat(chunks));
        });
      });

      req.on("error", (error) => {
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
    // Dosya adı, bölüm numarası ve API kullanıcı parametreleri
    const [dosya, bolumNo, apiUser] = process.argv.slice(2);
    
    // API kullanıcısını seç
    const selectedUser = await credits.selectApiUser(apiUser);
    credits.setApiActive(selectedUser);
    console.log(`\nSeçili API Kullanıcısı: ${selectedUser.user}`);

    if (!dosya) {
      throw new Error(
        "Lütfen bir klasör adı, bölüm numarası ve opsiyonel olarak API kullanıcısı belirtin (örnek: node index.js venus 3 2)"
      );
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

    // Bölüm numarası belirtilmişse sadece o bölümü işle
    if (bolumNo) {
      const bolumIndex = parseInt(bolumNo) - 1;
      if (bolumIndex < 0 || bolumIndex >= data.child.length) {
        throw new Error(
          `Geçersiz bölüm numarası. 1 ile ${data.child.length} arasında bir sayı girin.`
        );
      }

      const bolum = data.child[bolumIndex];
      const outputFile = path.join(__dirname, dosya, `bolum${bolumNo}.mp3`);

      console.log(`\nBölüm ${bolumNo} işleniyor...`);

      // Description array ise join et, string ise direkt kullan
      const description = Array.isArray(bolum.description)
        ? bolum.description.join(". ")
        : bolum.description.tr || bolum.description;

      const fullText = description.replace(/\./g, '.<break time="0.5s"/>');

      console.log("Ses dönüşümü başlıyor...");
      const audioBuffer = await convertToSpeech(fullText);

      // Ses dosyasını kaydet
      await fs.writeFile(outputFile, audioBuffer);
      console.log(`Ses dosyası oluşturuldu: ${outputFile}`);

      // Ses dönüşümü tamamlandıktan sonra kredi kontrolü yap
      await credits.checkCredits();
    } else {
      // Bölüm numarası belirtilmemişse tüm bölümleri işle (1. bölüm hariç)
      for (let i = 1; i < data.child.length; i++) {
        const bolum = data.child[i];
        const outputFile = path.join(__dirname, dosya, `bolum${i + 1}.mp3`);

        console.log(`\nBölüm ${i + 1} işleniyor...`);

        // Description array ise join et, string ise direkt kullan
        const description = Array.isArray(bolum.description)
          ? bolum.description.join(". ")
          : bolum.description.tr || bolum.description;

        const fullText = description.replace(/\./g, '.<break time="0.5s"/>');

        console.log("Ses dönüşümü başlıyor...");
        const audioBuffer = await convertToSpeech(fullText);

        // Ses dosyasını kaydet
        await fs.writeFile(outputFile, audioBuffer);
        console.log(`Ses dosyası oluşturuldu: ${outputFile}`);

        // Her bölüm tamamlandıktan sonra kredi kontrolü yap
        await credits.checkCredits();

        // API limitleri için bekleme
        if (i < data.child.length - 1) {
          console.log("Sonraki bölüm için 10 saniye bekleniyor...");
          await new Promise((resolve) => setTimeout(resolve, 10000));
        }
      }
    }

    console.log("\nİşlem tamamlandı.");
  } catch (error) {
    console.error("İşlem sırasında hata oluştu:", error.message);
    process.exit(1);
  }
}

// Ana program
async function main() {
  try {
    // Komut tipine göre işlem yap
    if (process.argv[2] === "credits") {
      const username = process.argv[3]; // Kullanıcı adı parametresi
      await credits.checkCredits(username);
    } else {
      await processDescriptions();
    }
  } catch (error) {
    console.error("Program hatası:", error.message);
    process.exit(1);
  }
}

// Programı çalıştır
main();



// node index.js uranus 9 4
// node index.js merkur 6