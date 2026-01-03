// Utility functions for Puppeteer automation

const fs = require('fs');
const path = require('path');

class Utils {
    constructor(page, siteName) {
        this.page = page;
        this.siteName = siteName;
        this.screenshotDir = path.join(__dirname, 'screenshots', siteName);

        // Create screenshot directory if it doesn't exist
        if (!fs.existsSync(this.screenshotDir)) {
            fs.mkdirSync(this.screenshotDir, { recursive: true });
        }
    }

    // Wait for a specified duration
    async wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Take a screenshot with timestamp
    async screenshot(name) {
        const timestamp = Date.now();
        const filename = `${name}_${timestamp}.png`;
        const filepath = path.join(this.screenshotDir, filename);

        try {
            await this.page.screenshot({ path: filepath, fullPage: true });
            console.log(`📸 Screenshot saved: ${filename}`);
            return filepath;
        } catch (error) {
            console.error(`❌ Failed to take screenshot: ${error.message}`);
            return null;
        }
    }

    // Wait for selector with multiple fallback options and retry logic
    async waitForSelector(selectors, timeout = 10000) {
        const selectorArray = Array.isArray(selectors) ? selectors : [selectors];

        for (const selector of selectorArray) {
            try {
                console.log(`⏳ Waiting for selector: ${selector}`);
                await this.page.waitForSelector(selector, { timeout, visible: true });
                console.log(`✅ Found selector: ${selector}`);
                return selector;
            } catch (error) {
                console.log(`⚠️  Selector not found: ${selector}`);
            }
        }

        throw new Error(`None of the selectors found: ${selectorArray.join(', ')}`);
    }

    // Click element with retry logic
    async clickElement(selectors, options = {}) {
        const { timeout = 10000, retries = 3 } = options;
        const selectorArray = Array.isArray(selectors) ? selectors : [selectors];

        for (let attempt = 1; attempt <= retries; attempt++) {
            for (const selector of selectorArray) {
                try {
                    console.log(`🖱️  Attempting to click: ${selector} (attempt ${attempt}/${retries})`);

                    await this.page.waitForSelector(selector, { timeout: timeout / retries, visible: true });
                    await this.page.click(selector);

                    console.log(`✅ Clicked: ${selector}`);
                    await this.wait(500); // Small wait after click
                    return true;
                } catch (error) {
                    console.log(`⚠️  Failed to click ${selector}: ${error.message}`);
                }
            }

            if (attempt < retries) {
                await this.wait(1000); // Wait before retry
            }
        }

        console.error(`❌ Failed to click any selector after ${retries} attempts`);
        return false;
    }

    // Type text into input field
    async typeText(selectors, text, options = {}) {
        const { timeout = 10000, clearFirst = true, pressEnter = false } = options;
        const selectorArray = Array.isArray(selectors) ? selectors : [selectors];

        for (const selector of selectorArray) {
            try {
                console.log(`⌨️  Typing into: ${selector}`);

                await this.page.waitForSelector(selector, { timeout, visible: true });

                if (clearFirst) {
                    await this.page.click(selector, { clickCount: 3 }); // Select all
                }

                await this.page.type(selector, text, { delay: 50 });

                if (pressEnter) {
                    await this.page.keyboard.press('Enter');
                }

                console.log(`✅ Typed text: ${text}`);
                await this.wait(500);
                return true;
            } catch (error) {
                console.log(`⚠️  Failed to type into ${selector}: ${error.message}`);
            }
        }

        console.error(`❌ Failed to type into any selector`);
        return false;
    }

    // Check if element exists on page
    async elementExists(selector, timeout = 3000) {
        try {
            await this.page.waitForSelector(selector, { timeout, visible: true });
            return true;
        } catch {
            return false;
        }
    }

    // Close modal/popup if present
    async closeModalIfPresent(selectors) {
        const selectorArray = Array.isArray(selectors) ? selectors : [selectors];

        for (const selector of selectorArray) {
            const exists = await this.elementExists(selector, 2000);
            if (exists) {
                console.log(`🚫 Closing modal with: ${selector}`);
                await this.clickElement(selector);
                await this.wait(1000);
                return true;
            }
        }

        // Try pressing Escape as fallback
        try {
            await this.page.keyboard.press('Escape');
            await this.wait(500);
            console.log(`🚫 Pressed Escape to close modal`);
            return true;
        } catch {
            return false;
        }
    }

    // Scroll element into view
    async scrollToElement(selector) {
        try {
            await this.page.evaluate((sel) => {
                const element = document.querySelector(sel);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, selector);
            await this.wait(500);
            return true;
        } catch (error) {
            console.error(`❌ Failed to scroll to element: ${error.message}`);
            return false;
        }
    }

    // Log step with formatting
    log(message, type = 'info') {
        const icons = {
            info: 'ℹ️',
            success: '✅',
            error: '❌',
            warning: '⚠️',
            step: '👉',
        };

        const icon = icons[type] || icons.info;
        console.log(`${icon} ${message}`);
    }
}

module.exports = Utils;
