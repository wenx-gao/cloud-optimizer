// test_key.ts
import "dotenv/config";
import axios from "axios";

async function listModels() {
  const apiKey = process.env.GOOGLE_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`;

  try {
    const response = await axios.get(url);
    console.log("✅ Dein Key hat Zugriff auf folgende Modelle:");
    response.data.models.forEach((m: any) => {
      console.log(`- ${m.name.replace('models/', '')} (${m.displayName})`);
    });
  } catch (e: any) {
    console.error("❌ Fehler beim Abrufen der Modelle:", e.response?.data || e.message);
  }
}

listModels();
