const fs = require("fs").promises;
const path = require("path");
const https = require("https");

// API listesini dosyadan oku
let apilist = [];
let apiactive = null;

// API listesini yeniden yükle
async function reloadApiList() {
  try {
    const apiData = await fs.readFile(path.join(__dirname, 'apilist.json'), 'utf8');
    apilist = JSON.parse(apiData);
    return apilist;
  } catch (error) {
    console.error("API listesi yüklenirken hata:", error.message);
    throw error;
  }
}

// API kullanıcısını seç
async function selectApiUser(identifier) {
  // API listesini yeniden yükle
  await reloadApiList();
  
  let selectedUser;
  
  if (identifier) {
    // Sayısal index ile arama
    if (!isNaN(identifier)) {
      const index = parseInt(identifier) - 1;
      if (index >= 0 && index < apilist.length) {
        selectedUser = apilist[index];
      }
    } else {
      // Email ile arama
      selectedUser = apilist.find(api => api.user === identifier);
    }
  } else {
    // Kullanıcı belirtilmemişse en yüksek kredili kullanıcıyı seç
    selectedUser = apilist.reduce((max, user) => 
      (user.Credits > max.Credits) ? user : max, apilist[0]);
    console.log(`\nEn yüksek kredili kullanıcı seçildi: ${selectedUser.user} (${selectedUser.Credits} kredi)`);
  }

  if (!selectedUser) {
    console.log("\nMevcut API Kullanıcıları:");
    apilist.forEach((api, index) => console.log(`${index + 1}. ${api.user} (${api.Credits} kredi)`));
    throw new Error(`Kullanıcı bulunamadı: ${identifier}`);
  }
  return selectedUser;
}

async function checkCredits(identifier = null) {
  try {
    // Eğer identifier null ise ve apiactive zaten seçilmişse, mevcut kullanıcıyı kullan
    if (!identifier && apiactive) {
      console.log(`\nSeçili Kullanıcı: ${apiactive.user}`);
    } else {
      // API listesini yükle ve kullanıcı seçimi yap
      await reloadApiList();
      apiactive = await selectApiUser(identifier);
      console.log(`\nSeçili Kullanıcı: ${apiactive.user}`);
    }

    const options = {
      hostname: "api.elevenlabs.io",
      path: "/v1/user",
      method: "GET",
      headers: {
        "xi-api-key": apiactive.key,
      },
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP Error: ${res.statusCode}`));
          return;
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            const remainingCredits = response.subscription.character_limit - response.subscription.character_count;
            const currentDate = new Date().toISOString().split('T')[0];
            
            console.log("\nAPI Kredi Bilgileri:");
            console.log(`Kullanıcı: ${apiactive.user}`);
            console.log(`Toplam Kredi: ${response.subscription.character_limit}`);
            console.log(`Kullanılan: ${response.subscription.character_count}`);
            console.log(`Kalan Kredi: ${remainingCredits}`);
            console.log(`Güncelleme Tarihi: ${currentDate}`);

            // apilist.json ve apiactive'i güncelle
            const userIndex = apilist.findIndex(api => api.user === apiactive.user);
            apilist[userIndex].Credits = remainingCredits;
            apilist[userIndex].tarih = currentDate;

            fs.writeFile(
              path.join(__dirname, 'apilist.json'),
              JSON.stringify(apilist, null, 2)
            ).then(() => {
              console.log('\napilist.json güncellendi');
            }).catch(error => {
              console.error('apilist.json güncellenirken hata:', error.message);
            });

            resolve(response);
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.end();
    });
  } catch (error) {
    console.error("Kredi kontrolü sırasında hata:", error.message);
    throw error;
  }
}

// Ana program (sadece kredi kontrolü için)
async function main() {
  try {
    // İlk başta API listesini yükle
    await reloadApiList();

    const username = process.argv[2]; // Kullanıcı adı parametresi
    
    if (username) {
      // Belirli bir kullanıcı için kredi kontrolü
      await checkCredits(username);
    } else {
      // Tüm kullanıcılar için kredi kontrolü
      console.log("\nTüm API kullanıcıları kontrol ediliyor...");
      for (const api of apilist) {
        console.log("\n----------------------------------------");
        await checkCredits(api.user);
      }
      console.log("\n----------------------------------------");
      console.log("Tüm kullanıcıların kredi kontrolü tamamlandı.");
    }
  } catch (error) {
    console.error("Program hatası:", error.message);
    process.exit(1);
  }
}

// Eğer doğrudan bu dosya çalıştırılıyorsa
if (require.main === module) {
  main();
}

module.exports = {
  reloadApiList,
  selectApiUser,
  checkCredits,
  getApiActive: () => apiactive,
  setApiActive: (user) => { apiactive = user; }
};
