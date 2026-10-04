import puppeteer from "puppeteer-core";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const screenshotsDir = path.resolve(__dirname, "../docs/screenshots");

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

async function capture() {
  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--window-size=1440,900"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log("1. Capturing Home Dashboard...");
  await page.goto("http://localhost:3000", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(screenshotsDir, "01_home_dashboard.png") });

  console.log("2. Capturing SecurePool Auth Modal...");
  const signInBtn = await page.$("#btn-nav-login");
  if (signInBtn) {
    await signInBtn.click();
    await new Promise((r) => setTimeout(r, 800));
    await page.screenshot({ path: path.join(screenshotsDir, "02_securepool_auth.png") });

    // Click demo host profile to log in
    const demoHostBtn = await page.$("#btn-demo-host");
    if (demoHostBtn) {
      await demoHostBtn.click();
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  console.log("3. Capturing Watch Party Modal...");
  const partyNavBtn = await page.$("#btn-nav-watch-party");
  if (partyNavBtn) {
    await partyNavBtn.click();
    await new Promise((r) => setTimeout(r, 800));
    await page.screenshot({ path: path.join(screenshotsDir, "03_watch_party_modal.png") });

    // Close modal
    await page.keyboard.press("Escape");
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("4. Capturing Cinema Video Player (Full View)...");
  await page.evaluate(() => {
    const playBtn = document.querySelector("#hero-btn-play");
    if (playBtn) playBtn.click();
  });
  try {
    await page.waitForSelector(".player-overlay", { timeout: 6000 });
    await new Promise((r) => setTimeout(r, 2000));
    await page.mouse.move(720, 450);
    await new Promise((r) => setTimeout(r, 800));
    await page.screenshot({ path: path.join(screenshotsDir, "04_cinema_player.png") });

    // Exit player
    const backBtn = await page.$("#player-btn-back");
    if (backBtn) {
      await backBtn.click();
      await new Promise((r) => setTimeout(r, 1000));
    }
  } catch (e) {
    console.error("Player overlay not found:", e.message);
  }

  console.log("5. Capturing Live Watch Party Room with Sync & Chat...");
  const heroPartyBtn = await page.$("#hero-btn-party");
  if (heroPartyBtn) {
    await heroPartyBtn.click();
    await new Promise((r) => setTimeout(r, 3000));

    // Send sample chat message in watch party
    const chatInput = await page.$("#party-chat-input");
    if (chatInput) {
      await chatInput.type("This film looks incredible in 4K! 🍿");
      const chatSendBtn = await page.$("#party-chat-send");
      if (chatSendBtn) await chatSendBtn.click();
      await new Promise((r) => setTimeout(r, 600));
    }

    await page.screenshot({ path: path.join(screenshotsDir, "05_watch_party_room.png") });

    // Exit party
    const backBtn = await page.$("#player-btn-back");
    if (backBtn) {
      await backBtn.click();
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  console.log("6. Capturing Catalog Tracks & TV Navigation View...");
  await page.evaluate(() => window.scrollTo(0, 600));
  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(screenshotsDir, "06_catalog_scroll.png") });

  console.log("All screenshots captured successfully!");
  await browser.close();
}

capture().catch((err) => {
  console.error("Screenshot capture error:", err);
  process.exit(1);
});
