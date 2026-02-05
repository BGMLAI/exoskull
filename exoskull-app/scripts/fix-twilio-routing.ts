/**
 * Fix Twilio Routing
 *
 * Przekierowuje +48732143210 z VAPI na custom ExoSkull pipeline.
 *
 * Uruchom: npx tsx scripts/fix-twilio-routing.ts
 */

import twilio from "twilio";

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

// Numery do przekonfigurowania
const PHONE_NUMBERS_TO_FIX = [
  "+48732143210", // Obecnie VAPI → zmień na custom
];

// Nowe webhooki (produkcja)
const NEW_VOICE_URL = "https://exoskull.xyz/api/twilio/voice";
const NEW_STATUS_CALLBACK = "https://exoskull.xyz/api/twilio/status";

async function main() {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.error("❌ Brak TWILIO_ACCOUNT_SID lub TWILIO_AUTH_TOKEN w env");
    console.log("Ustaw zmienne środowiskowe lub dodaj do .env.local");
    process.exit(1);
  }

  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

  console.log("🔍 Pobieram listę numerów Twilio...\n");

  try {
    const numbers = await client.incomingPhoneNumbers.list();

    console.log(`Znaleziono ${numbers.length} numerów:\n`);

    for (const num of numbers) {
      const needsFix = PHONE_NUMBERS_TO_FIX.includes(num.phoneNumber);
      const status = needsFix ? "⚠️  DO NAPRAWY" : "✓";

      console.log(`${status} ${num.phoneNumber}`);
      console.log(`   SID: ${num.sid}`);
      console.log(`   Voice URL: ${num.voiceUrl || "(brak)"}`);
      console.log(`   Status CB: ${num.statusCallback || "(brak)"}`);
      console.log();

      if (needsFix) {
        console.log(`   🔧 Aktualizuję webhook...`);

        await client.incomingPhoneNumbers(num.sid).update({
          voiceUrl: NEW_VOICE_URL,
          voiceMethod: "POST",
          statusCallback: NEW_STATUS_CALLBACK,
          statusCallbackMethod: "POST",
        });

        console.log(`   ✅ Zaktualizowano!`);
        console.log(`   → Voice URL: ${NEW_VOICE_URL}`);
        console.log(`   → Status CB: ${NEW_STATUS_CALLBACK}`);
        console.log();
      }
    }

    console.log("✅ Gotowe!");
    console.log(
      "\nTeraz zadzwoń na +48732143210 - powinien odpowiedzieć ExoSkull.",
    );
  } catch (error) {
    console.error("❌ Błąd:", error);
    process.exit(1);
  }
}

main();
