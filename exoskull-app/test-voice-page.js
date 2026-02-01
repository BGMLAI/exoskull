#!/usr/bin/env node

/**
 * Simple test script for voice page
 * Run: node test-voice-page.js
 */

const puppeteer = require('puppeteer');

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testVoicePage() {
  console.log('🧪 Testing voice page...\n');

  const browser = await puppeteer.launch({
    headless: false, // Show browser
    args: ['--no-sandbox']
  });

  try {
    const page = await browser.newPage();

    // Listen to console messages
    page.on('console', async msg => {
      const type = msg.type();
      const text = msg.text();

      if (type === 'error') {
        console.log('❌ Console Error:', text);
      } else if (text.includes('VAPI') || text.includes('SDK') || text.includes('✅') || text.includes('❌')) {
        console.log(`📝 ${text}`);
      }
    });

    // Listen to page errors
    page.on('pageerror', error => {
      console.log('💥 Page Error:', error.message);
    });

    // Navigate to voice page
    console.log('1️⃣  Navigating to http://localhost:3000/dashboard/voice');
    await page.goto('http://localhost:3000/dashboard/voice', {
      waitUntil: 'networkidle0'
    });

    // Wait a bit for redirect/loading
    await wait(2000);

    // Check if we're on login page (redirected)
    const url = page.url();
    if (url.includes('/login')) {
      console.log('⚠️  Redirected to login - you need to be authenticated');
      console.log('   Manual test: Login at http://localhost:3000/login first\n');
      return;
    }

    console.log('2️⃣  Page loaded, checking for VAPI SDK...');

    // Wait for SDK to load (max 10 seconds)
    try {
      await page.waitForFunction(
        () => typeof window.Vapi !== 'undefined',
        { timeout: 10000 }
      );
      console.log('✅ VAPI SDK loaded successfully!\n');

      // Try to click the button
      console.log('3️⃣  Looking for "Rozpocznij rozmowę" button...');
      const button = await page.waitForSelector('button:not([disabled])', {
        timeout: 5000
      });

      if (button) {
        console.log('✅ Button found and enabled!');
        console.log('4️⃣  Clicking button...');
        await button.click();

        // Wait to see what happens
        await wait(3000);

        console.log('\n✅ Test completed! Check browser for results.');
      }
    } catch (error) {
      console.log('❌ VAPI SDK failed to load within 10 seconds');
      console.log('   Error:', error.message);
      console.log('\n🔍 Checking network requests...');

      // Check if script tag exists
      const scriptExists = await page.evaluate(() => {
        const scripts = document.querySelectorAll('script[src*="vapi"]');
        return scripts.length > 0;
      });

      if (scriptExists) {
        console.log('   ✅ Script tag exists in DOM');
      } else {
        console.log('   ❌ No VAPI script tag found in DOM!');
      }
    }

  } finally {
    console.log('\nClosing browser in 5 seconds...');
    await wait(5000);
    await browser.close();
  }
}

testVoicePage().catch(console.error);
