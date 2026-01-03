// Generic E-commerce Automation Script
// Supports: Lenskart.com and Swiggy.com
// 
// Usage:
//   node automation.js <site> <searchTerm>
//   node automation.js lenskart <authMode> <searchTerm>
//     where <authMode> is one of: signin | signup
//   node automation.js lenskart sunglasses
//   node automation.js swiggy pizza

const puppeteer = require('puppeteer');
const config = require('./config');
const Utils = require('./utils');

class EcommerceAutomation {
    constructor(siteName, authMode = 'auto') {
        if (!config[siteName]) {
            throw new Error(`Site "${siteName}" not supported. Available: ${Object.keys(config).join(', ')}`);
        }

        this.siteName = siteName;
        this.config = config[siteName];
        this.authMode = authMode; // 'auto' | 'signin' | 'signup'
        this.browser = null;
        this.page = null;
        this.utils = null;
    }

    // Initialize browser and page
    async init() {
        console.log(`\n🚀 Initializing automation for ${this.config.name}...\n`);

        const launchOptions = {
            headless: false, // Set to true for headless mode
            defaultViewport: { width: 1920, height: 1080 },
            args: [
                '--start-maximized',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
            ],
        };
        if (process.env.CHROME_PATH) {
            launchOptions.executablePath = process.env.CHROME_PATH;
        }
        this.browser = await puppeteer.launch(launchOptions);

        this.page = await this.browser.newPage();
        this.utils = new Utils(this.page, this.siteName);

        // Set user agent to avoid bot detection
        await this.page.setUserAgent(
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );
        // Prefer Indian English and English for headers
        try {
            await this.page.setExtraHTTPHeaders({ 'Accept-Language': 'en-IN,en;q=0.9' });
        } catch {}

        // Navigate to base URL
        this.utils.log(`Navigating to ${this.config.baseUrl}`, 'step');
        await this.page.goto(this.config.baseUrl, { waitUntil: 'networkidle2' });
        await this.utils.wait(this.config.timing.pageLoad);
        await this.utils.screenshot('01_homepage');
    }

    // Handle location selection (for Swiggy)
    async setLocation() {
        if (!this.config.requiresLocation) {
            this.utils.log('Location not required for this site', 'info');
            return true;
        }

        this.utils.log('Setting location...', 'step');

        try {
            // Wait a bit for page to stabilize
            await this.utils.wait(2000);

            // Click on location input to focus it
            const locationInputClicked = await this.utils.clickElement(
                [this.config.selectors.locationInput, this.config.selectors.locationInputAlt]
            );

            if (!locationInputClicked) {
                this.utils.log('Location input not found', 'warning');
                return false;
            }

            await this.utils.wait(1000);

            // Clear any existing text and type location
            await this.page.keyboard.down('Control');
            await this.page.keyboard.press('A');
            await this.page.keyboard.up('Control');
            await this.page.keyboard.press('Backspace');

            await this.utils.wait(500);

            // Type location slowly
            await this.page.type(
                this.config.selectors.locationInput,
                this.config.defaultLocation,
                { delay: 100 }
            );

            this.utils.log(`Typed location: ${this.config.defaultLocation}`, 'info');
            await this.utils.wait(3000); // Wait for dropdown suggestions to appear

            await this.utils.screenshot('02_location_dropdown');

            // Click the first search result (not "Use my current location")
            let clicked = false;
            try {
                // Wait for search results to appear
                await this.utils.wait(1000);

                // Click first result using evaluate
                clicked = await this.page.evaluate(() => {
                    // Get all clickable elements
                    const allButtons = Array.from(document.querySelectorAll('div[role="button"]'));

                    // Filter out "Use my current location" and click first actual location
                    for (const button of allButtons) {
                        const text = button.textContent.toLowerCase();
                        // Skip if it's the "use current location" button
                        if (text.includes('current location') || text.includes('detect')) {
                            continue;
                        }
                        // Click first result that has actual location text
                        if (text.length > 5) {
                            button.click();
                            return true;
                        }
                    }
                    return false;
                });

                if (clicked) {
                    this.utils.log('Clicked first search result', 'success');
                }
            } catch (error) {
                this.utils.log(`Error clicking search result: ${error.message}`, 'warning');
            }

            if (!clicked) {
                // Fallback: press Enter to select first suggestion
                this.utils.log('Pressing Enter to select first suggestion', 'info');
                await this.page.keyboard.press('Enter');
            }

            // Wait for location to be set and page to update
            await this.utils.wait(5000);
            await this.utils.screenshot('02_location_set');

            // Close location dropdown if still open
            await this.page.keyboard.press('Escape');
            await this.utils.wait(1000);

            this.utils.log('Location set successfully', 'success');

            return true;
        } catch (error) {
            this.utils.log(`Location setting failed: ${error.message}`, 'error');
            await this.utils.screenshot('error_location');
            return false;
        }
    }

    // Read cart count from topbar (Swiggy badge shows number)
    async getCartCount() {
        try {
            const count = await this.page.evaluate(() => {
                // Primary: number inside the /checkout link
                const badge = document.querySelector('a[href*="/checkout"] span');
                const txt = (badge?.innerText || badge?.textContent || '').trim();
                const n = parseInt(txt, 10);
                if (!isNaN(n)) return n;
                // Fallback: any element near text 'Cart' with a number
                const node = Array.from(document.querySelectorAll('a,span,div'))
                  .find(el => /\bcart\b/i.test(el.innerText || ''));
                if (node) {
                    const m = (node.innerText || '').match(/(\d+)/);
                    if (m) return parseInt(m[1], 10);
                }
                return 0;
            });
            return typeof count === 'number' && !isNaN(count) ? count : 0;
        } catch { return 0; }
    }

    // Open cart from top bar (post-add)
    async openCartTopbar() {
        this.utils.log('Opening cart...', 'step');
        try {
            const clicked = await this.utils.clickElement([
                this.config.selectors.cartIcon,
                'a[href*="/checkout"]',
                'a:has-text("Cart")',
                'span:has-text("Cart")',
            ]);
            if (!clicked) {
                this.utils.log('Cart button not found', 'warning');
                return false;
            }
            await this.utils.wait(this.config.timing.pageLoad);
            await this.utils.screenshot('07_cart_page');
            this.utils.log('Opened cart page', 'success');
            return true;
        } catch (error) {
            this.utils.log(`Open cart failed: ${error.message}`, 'warning');
            await this.utils.screenshot('error_open_cart');
            return false;
        }
    }

    // Handle signup/signin with form filling and OTP wait
    async signin() {
        this.utils.log('Navigating to signup/signin...', 'step');

        try {
            // Close any modals first (skip for Lenskart to go directly to Sign In)
            if (this.siteName !== 'lenskart') {
                await this.utils.closeModalIfPresent([
                    this.config.selectors.closeModal,
                    this.config.selectors.noThanksButton,
                ]);
            }

            // Click sign-in button to open auth modal
            const clicked = await this.utils.clickElement(
                [this.config.selectors.signInButton, this.config.selectors.signInButtonAlt]
            );

            if (!clicked) {
                this.utils.log('Sign-in button not found, skipping authentication', 'warning');
                return false;
            }

            await this.utils.wait(2000);
            await this.utils.screenshot('03_auth_modal_login');

            // Lenskart-specific auth flow: try Sign In, or Create Account based on authMode
            if (this.siteName === 'lenskart') {
                try {
                    // Wait for modal container
                    await this.page.waitForSelector('[role="dialog"]', { timeout: 5000 });

                    let didOpenSignupForm = false;

                    // If user requested signup explicitly, switch to Create Account immediately
                    if (this.authMode === 'signup') {
                        const opened = await this.utils.clickElement([
                            '[role="button"][aria-label*="create account" i]',
                            'button[aria-label*="create account" i]',
                            'button:has-text("Create an Account")',
                            'a:has-text("Create an Account")'
                        ]);
                        if (opened) {
                            await this.utils.wait(600);
                        }
                        // Consider we are on signup if firstName field appears
                        try {
                            await this.page.waitForSelector('input[name="firstName"]', { timeout: 3000 });
                            didOpenSignupForm = true;
                        } catch {}
                    }

                    // Type Mobile/Email for signin mode or when staying on Sign In
                    if (this.authMode !== 'signup') {
                        const inputSelCandidates = [
                            'input[name="emailOrPhone"]',
                            'input[placeholder*="Mobile" i]',
                            'input[placeholder*="Email" i]'
                        ];
                        let loginInput = null;
                        for (const sel of inputSelCandidates) {
                            const h = await this.page.$(sel);
                            if (h) { loginInput = h; break; }
                        }
                        if (loginInput) {
                            await loginInput.click();
                            await this.utils.wait(100);
                            await this.page.keyboard.down('Control');
                            await this.page.keyboard.press('A');
                            await this.page.keyboard.up('Control');
                            await this.page.keyboard.press('Backspace');
                            try { await loginInput.type(this.config.signupData.phone, { delay: 60 }); } catch {}
                        }
                    }

                    // Click Sign In button (id="remove-button")
                    let signInClickable = false;
                    if (this.authMode !== 'signup') {
                        try {
                            this.utils.log('Clicking Sign In button...', 'info');
                            await this.page.click('#remove-button');
                            signInClickable = true;
                            this.utils.log('Clicked Sign In button successfully', 'success');
                            await this.utils.wait(1500);
                        } catch (e) {
                            this.utils.log(`Failed to click Sign In button: ${e.message}`, 'warning');
                        }
                    }

                    // If not already on signup form and we're allowed to signup, open it
                    if (!didOpenSignupForm && !signInClickable && this.authMode !== 'signin') {
                        // Open Create Account (only when not already open)
                        if (this.authMode === 'auto') {
                            this.utils.log('Sign In disabled/unavailable, switching to Create Account', 'warning');
                        }
                        const opened = await this.utils.clickElement([
                            '[role="button"][aria-label*="create account" i]',
                            'button[aria-label*="create account" i]',
                            'button:has-text("Create an Account")',
                            'a:has-text("Create an Account")'
                        ]);
                        if (opened) {
                            await this.utils.wait(800);
                            await this.utils.screenshot('03_signup_form_lenskart');
                            // Fill fields
                            const map = [
                                { sel: 'input[name="firstName"]', value: this.config.signupData.firstName },
                                { sel: 'input[name="lastName"]', value: this.config.signupData.lastName },
                                { sel: 'input[name="mobile"]', value: this.config.signupData.phone },
                                { sel: 'input[name="email"]', value: this.config.signupData.email },
                                { sel: 'input[name="password"]', value: this.config.signupData.password },
                            ];
                            for (const f of map) {
                                try {
                                    await this.page.click(f.sel, { clickCount: 3 }).catch(()=>{});
                                    await this.page.focus(f.sel).catch(()=>{});
                                    await this.page.keyboard.type(f.value, { delay: 40 });
                                } catch {}
                            }
                            // Simple submit: click the Create an Account button inside the dialog
                            this.utils.log('Clicking Create an Account button...', 'info');
                            await this.page.click('#remove-button');
                            await this.utils.wait(1500);
                            
                            // Check if account already exists AFTER clicking
                            const existsMsg = await this.page.evaluate(() => {
                                const c = document.querySelector('[role="dialog"]');
                                if (!c) return false;
                                const el = Array.from(c.querySelectorAll('div')).find(d => /already registered/i.test(d.textContent || ''));
                                return !!el;
                            });
                            
                            if (existsMsg) {
                                this.utils.log('Phone number already registered — switching to Sign In', 'warning');
                                await this.utils.screenshot('03_already_registered');
                                const signInClicked = await this.utils.clickElement(['[role="button"][aria-label="Sign In"]', 'button:has-text("Sign In")']);
                                if (signInClicked) {
                                    this.utils.log('Clicked Sign In link, waiting for form...', 'info');
                                    await this.utils.wait(1500);
                                    // Fill phone and submit Sign In
                                    try {
                                        await this.page.waitForSelector('input[name="emailOrPhone"]', { timeout: 3000 });
                                        await this.page.click('input[name="emailOrPhone"]');
                                        await this.page.keyboard.down('Control');
                                        await this.page.keyboard.press('A');
                                        await this.page.keyboard.up('Control');
                                        await this.page.keyboard.press('Backspace');
                                        await this.page.type('input[name="emailOrPhone"]', this.config.signupData.phone, { delay: 60 });
                                        this.utils.log('Filled phone number for Sign In', 'info');
                                    } catch (e) {
                                        this.utils.log(`Failed to fill phone: ${e.message}`, 'warning');
                                    }
                                    try {
                                        const btn = (await this.page.$x("//button[@data-testid='button-testid' and contains(., 'Sign In')]") )[0];
                                        if (btn) { 
                                            await btn.click(); 
                                            this.utils.log('Clicked Sign In button - waiting for OTP screen...', 'success');
                                            await this.utils.wait(2000);
                                        }
                                    } catch (e) {
                                        this.utils.log(`Failed to click Sign In button: ${e.message}`, 'warning');
                                    }
                                }
                                // Don't set didOpenSignupForm since we switched to signin
                            } else {
                                didOpenSignupForm = true;
                            }
                        }
                    }

                    // If we are already on signup form (from explicit authMode), fill and submit
                    if (didOpenSignupForm) {
                        try {
                            await this.utils.screenshot('03_signup_form_lenskart');
                            const map = [
                                { sel: 'input[name="firstName"]', value: this.config.signupData.firstName },
                                { sel: 'input[name="lastName"]', value: this.config.signupData.lastName },
                                { sel: 'input[name="mobile"]', value: this.config.signupData.phone },
                                { sel: 'input[name="email"]', value: this.config.signupData.email },
                                { sel: 'input[name="password"]', value: this.config.signupData.password },
                            ];
                            for (const f of map) {
                                try {
                                    await this.page.click(f.sel, { clickCount: 3 }).catch(()=>{});
                                    await this.page.focus(f.sel).catch(()=>{});
                                    await this.page.keyboard.type(f.value, { delay: 40 });
                                } catch {}
                            }
                            // Simple submit: click the Create an Account button inside the dialog
                            this.utils.log('Clicking Create an Account button...', 'info');
                            await this.page.click('#remove-button');
                            await this.utils.wait(1500);
                            
                            // Check if account already exists AFTER clicking
                            {
                                const existsMsg = await this.page.evaluate(() => {
                                    const c = document.querySelector('[role="dialog"]');
                                    if (!c) return false;
                                    const el = Array.from(c.querySelectorAll('div')).find(d => /already registered/i.test(d.textContent || ''));
                                    return !!el;
                                });
                                
                                if (existsMsg) {
                                    this.utils.log('Phone number already registered — switching to Sign In', 'warning');
                                    await this.utils.screenshot('03_already_registered');
                                    const signInClicked = await this.utils.clickElement(['[role\="button\'][aria-label\="Sign In\']', 'button:has-text("Sign In")']);
                                    if (signInClicked) {
                                        this.utils.log('Clicked Sign In link, waiting for form...', 'info');
                                        await this.utils.wait(1500);
                                        // Fill phone and submit Sign In
                                        try {
                                            await this.page.waitForSelector('input[name="emailOrPhone"]', { timeout: 3000 });
                                            await this.page.click('input[name="emailOrPhone"]');
                                            await this.page.keyboard.down('Control');
                                            await this.page.keyboard.press('A');
                                            await this.page.keyboard.up('Control');
                                            await this.page.keyboard.press('Backspace');
                                            await this.page.type('input[name="emailOrPhone"]', this.config.signupData.phone, { delay: 60 });
                                            this.utils.log('Filled phone number for Sign In', 'info');
                                        } catch (e) {
                                            this.utils.log(`Failed to fill phone: ${e.message}`, 'warning');
                                        }
                                        try {
                                            const btn = (await this.page.$x("//button[@data-testid='button-testid' and contains(., 'Sign In')]") )[0];
                                            if (btn) { 
                                                await btn.click(); 
                                                this.utils.log('Clicked Sign In button - waiting for OTP screen...', 'success');
                                                await this.utils.wait(2000);
                                            }
                                        } catch (e) {
                                            this.utils.log(`Failed to click Sign In button: ${e.message}`, 'warning');
                                        }
                                    }
                                    // Account exists handled - will proceed to OTP wait
                                }
                            }
                        } catch {}
                    }
                } catch (e) {
                    this.utils.log(`Lenskart auth handling warning: ${e.message}`,'warning');
                }
            }

            // Swiggy login flow (skip signup, just phone + OTP)
            if (this.siteName === 'swiggy') {
                this.utils.log('Using login form for Swiggy', 'info');

                // Fill phone in login form
                const signupLinkClicked = false;

                if (signupLinkClicked) {
                this.utils.log('Switched to signup form', 'success');
                await this.utils.wait(2000);
                await this.utils.screenshot('03_signup_form');

                // Fill signup form
                this.utils.log('Filling signup form...', 'info');

                // Wait for form to load and stabilize
                await this.utils.wait(2000);

                // Get inputs ONLY from the modal, not the entire page
                // Use a more specific selector to avoid selecting homepage location input
                const modal = await this.page.$('[role="dialog"], .modal, [class*="Modal"]');
                let inputs;

                if (modal) {
                    inputs = await modal.$$('input:not([type="hidden"])');
                    this.utils.log(`Found ${inputs.length} input fields in modal`, 'info');
                } else {
                    // Fallback: try to get inputs from form element
                    this.utils.log('Modal not found, trying form element', 'warning');
                    const form = await this.page.$('form');
                    if (form) {
                        inputs = await form.$$('input:not([type="hidden"])');
                        this.utils.log(`Found ${inputs.length} input fields in form`, 'info');
                    } else {
                        this.utils.log('Form not found either, using page inputs', 'warning');
                        inputs = await this.page.$$('input:not([type="hidden"])');
                    }
                }

                // Fill phone number (first field in modal)
                if (inputs && inputs.length >= 1) {
                    await inputs[0].click();
                    await this.utils.wait(200);
                    await inputs[0].type(this.config.signupData.phone, { delay: 50 });
                    this.utils.log(`Entered phone: ${this.config.signupData.phone}`, 'info');
                }

                // Fill name (second field) - all fields are already visible
                if (inputs && inputs.length >= 2) {
                    await inputs[1].click();
                    await this.utils.wait(200);
                    await inputs[1].type(this.config.signupData.name, { delay: 50 });
                    this.utils.log(`Entered name: ${this.config.signupData.name}`, 'info');
                }

                // Fill email (third field)
                if (inputs && inputs.length >= 3) {
                    await inputs[2].click();
                    await this.utils.wait(200);
                    await inputs[2].type(this.config.signupData.email, { delay: 50 });
                    this.utils.log(`Entered email: ${this.config.signupData.email}`, 'info');
                }

                await this.utils.wait(1000);
                await this.utils.screenshot('03_signup_filled');

                // Debug: capture current form HTML (truncated)
                try {
                    const formPreview = await this.page.evaluate(() => {
                        const phone = document.querySelector('input[type="tel"], input[placeholder*="Phone" i]');
                        const form = (phone && phone.closest('form')) || document.querySelector('form');
                        return form ? form.outerHTML.slice(0, 1200) : 'NO_FORM';
                    });
                    this.utils.log(`Form HTML (pre-submit, first 1200 chars):\n${formPreview}`, 'info');
                } catch {}

                // Try hardware-grade click on CONTINUE using Chromium's mouse events (trusted)
                let hardwareClicked = false;
                try {
                    const handle = await this.page.evaluateHandle(() => {
                        const phone = document.querySelector('input[type="tel"], input[placeholder*="Phone" i]');
                        const form = phone && phone.closest('form');
                        if (!form) return null;
                        const nodes = Array.from(form.querySelectorAll('a, button, div, span'));
                        return nodes.find(el => ((el.innerText || el.textContent || '').trim().toUpperCase() === 'CONTINUE')) || null;
                    });
                    const el = handle && handle.asElement ? handle.asElement() : null;
                    if (el) {
                        const box = await el.boundingBox();
                        if (box) {
                            const cx = box.x + box.width / 2;
                            const cy = box.y + box.height / 2;
                            await this.page.mouse.move(cx, cy);
                            await this.page.mouse.down();
                            await this.page.mouse.up();
                            await this.utils.wait(200);
                            // Quick OTP/network check
                            try {
                                await this.page.waitForResponse(r => /otp|one[-_]?time|verify/i.test(r.url()), { timeout: 1200 });
                                hardwareClicked = true;
                                this.utils.log('Submitted via hardware-grade click on CONTINUE', 'success');
                            } catch {}
                            // Fallback: try touchscreen tap if mouse click did not trigger
                            if (!hardwareClicked) {
                                try {
                                    await this.page.touchscreen.tap(cx, cy);
                                    await this.utils.wait(200);
                                    await this.page.waitForResponse(r => /otp|one[-_]?time|verify/i.test(r.url()), { timeout: 1200 });
                                    hardwareClicked = true;
                                    this.utils.log('Submitted via touchscreen tap on CONTINUE', 'success');
                                } catch {}
                            }
                        }
                    }
                } catch {}

                // Human-like first: focus phone and press Enter twice (only if hardware click did not trigger)
                if (!hardwareClicked) this.utils.log('Submitting via human-like Enter x2...', 'info');
                if (!hardwareClicked) {
                await this.page.evaluate(() => {
                    const phone = document.querySelector('input[type="tel"], input[placeholder*="Phone" i]');
                    const form = phone && phone.closest('form');
                    if (!form) throw new Error('No form found');
                    // Remove referral button to avoid focus traps
                    try {
                        let referralBtn = form.querySelector('button.zGPvY') || Array.from(form.querySelectorAll('button')).find(b => (b.textContent || '').toLowerCase().includes('referral')) || null;
                        if (referralBtn && referralBtn.parentNode) referralBtn.parentNode.removeChild(referralBtn);
                    } catch {}
                    // Flush React state
                    Array.from(form.querySelectorAll('input')).forEach(el => {
                        try {
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                            el.dispatchEvent(new Event('blur', { bubbles: true }));
                        } catch {}
                    });
                    phone?.focus();
                });
                await this.page.keyboard.press('Enter');
                await this.utils.wait(120);
                await this.page.keyboard.press('Enter');
                await this.page.evaluate(() => {
                    const phone = document.querySelector('input[type="tel"], input[placeholder*="Phone" i]');
                    if (!phone) return;
                    const opts = { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', which: 13, keyCode: 13 };
                    const fire = () => {
                        phone.dispatchEvent(new KeyboardEvent('keydown', opts));
                        phone.dispatchEvent(new KeyboardEvent('keypress', opts));
                        phone.dispatchEvent(new KeyboardEvent('keyup', opts));
                    };
                    fire();
                    setTimeout(fire, 80);
                });
                }

                // Quick check: if OTP/network not detected shortly, try React-safe requestSubmit path
                let enterTriggered = false;
                try {
                    await this.page.waitForResponse(resp => /otp|one[-_]?time|verify/i.test(resp.url()), { timeout: 1500 });
                    enterTriggered = true;
                } catch {}

                if (!enterTriggered) {
                    this.utils.log('Enter x2 did not trigger OTP yet, using requestSubmit()', 'warning');
                    try {
                        await this.page.evaluate(() => {
                            const phone = document.querySelector('input[type="tel"], input[placeholder*="Phone" i]');
                            const form = (phone && phone.closest('form')) || document.querySelector('form');
                            if (!form) throw new Error('No form found');
                            const submitter = form.querySelector('input[type="submit"], button[type="submit"]');
                            if (typeof form.requestSubmit === 'function') {
                                submitter ? form.requestSubmit(submitter) : form.requestSubmit();
                                setTimeout(() => { try { submitter ? form.requestSubmit(submitter) : form.requestSubmit(); } catch {} }, 0);
                                try {
                                    const ev = new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter: submitter || undefined });
                                    form.dispatchEvent(ev);
                                } catch {}
                            } else {
                                const ev = new Event('submit', { bubbles: true, cancelable: true });
                                if (form.dispatchEvent(ev)) form.submit();
                            }
                        });
                        this.utils.log('Submitted signup form via requestSubmit()', 'success');
                    } catch {
                        this.utils.log('requestSubmit path failed unexpectedly', 'warning');
                    }
                }

                // Wait for either OTP input or a specific account-exists error near the auth UI
                this.utils.log('Waiting for OTP or error...', 'info');
                await this.utils.screenshot('03_after_continue');

                // Strong signal: wait for OTP-related network call if present
                try {
                    await this.page.waitForResponse(resp => {
                        const url = resp.url().toLowerCase();
                        return /otp|one[-_]?time|verify/.test(url);
                    }, { timeout: 8000 });
                    this.utils.log('Observed OTP-related network request', 'info');
                } catch {}

                // Debug: capture form HTML after submit
                try {
                    const formPreviewPost = await this.page.evaluate(() => {
                        const container = document.querySelector('[role="dialog"], .modal, [class*="Modal"], form');
                        const form = container ? (container.querySelector('form') || container.closest('form')) : document.querySelector('form');
                        return form ? form.outerHTML.slice(0, 1200) : 'NO_FORM';
                    });
                    this.utils.log(`Form HTML (post-submit, first 1200 chars):\n${formPreviewPost}`, 'info');
                } catch {}

                // Debug: inspect auth container state right after submit
                try {
                    const debugInfo = await this.page.evaluate(() => {
                        const container = document.querySelector('[role="dialog"], .modal, [class*="Modal"], form');
                        const form = container ? container.querySelector('form') || container.closest('form') : document.querySelector('form');
                        const text = container ? (container.innerText || '').slice(0, 400) : '';
                        const hasReferral = !!(container && Array.from(container.querySelectorAll('a, button, div, span')).some(el => /referral/i.test(el.textContent || '')));
                        const otpInputs = container ? Array.from(container.querySelectorAll('input')).filter(el => {
                            const ml = el.getAttribute('maxlength');
                            const hint = (el.getAttribute('autocomplete') || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('name') || '') + ' ' + (el.getAttribute('placeholder') || '');
                            return /one-time-code|otp/i.test(hint) || ml === '1';
                        }).length : 0;
                        return {
                            hasContainer: !!container,
                            hasForm: !!form,
                            snippet: text,
                            hasReferral,
                            otpInputsCount: otpInputs,
                        };
                    });
                    this.utils.log(`Auth UI — container:${debugInfo.hasContainer} form:${debugInfo.hasForm} referral:${debugInfo.hasReferral} otpInputs:${debugInfo.otpInputsCount}`, 'info');
                } catch {}

                let otpVisible = false;
                let existsError = false;

                // Prefer robust OTP detection within auth container
                try {
                    await this.page.waitForFunction(() => {
                        const container = document.querySelector('[role="dialog"], .modal, [class*="Modal"], form');
                        if (!container) return false;

                        // Common OTP patterns
                        const otpSelectors = [
                            'input[autocomplete="one-time-code"]',
                            'input[aria-label*="otp" i]',
                            'input[name*="otp" i]',
                            'input[placeholder*="otp" i]'
                        ];

                        // Direct selector match
                        if (otpSelectors.some(sel => container.querySelector(sel))) return true;

                        // Group of 4-6 single-char inputs (often type="tel" or text with maxlength=1)
                        const candidates = Array.from(container.querySelectorAll('input'))
                            .filter(el => {
                                const ml = el.getAttribute('maxlength');
                                return ml === '1' || (ml === null && (el.type === 'tel' || el.type === 'text'));
                            });
                        if (candidates.length >= 4 && candidates.length <= 6) return true;

                        return false;
                    }, { timeout: 12000 });
                    otpVisible = true;
                } catch {}

                if (!otpVisible) {
                    // Look for a specific error text within the auth modal/form only
                    existsError = await this.page.evaluate(() => {
                        const container = document.querySelector('[role="dialog"], .modal, [class*="Modal"], form');
                        if (!container) return false;
                        const text = container.innerText || '';
                        return /mobile number already exists/i.test(text) || /account already exists/i.test(text);
                    });
                }

                this.utils.log(`OTP visible: ${otpVisible} | Account exists error: ${existsError}`, 'info');

                // If nothing happened, simulate a real user Enter key once
                if (!otpVisible && !existsError) {
                    this.utils.log('No OTP or error yet, safe Enter nudge or resubmit...', 'warning');
                    try {
                        const action = await this.page.evaluate(() => {
                            const phone = document.querySelector('input[type="tel"], input[placeholder*="Phone" i]');
                            const form = phone && phone.closest('form');
                            if (!form) return 'no-form';
                            if (document.activeElement !== phone) phone?.focus();
                            if (form.checkValidity && !form.checkValidity()) return 'resubmit';
                            return document.activeElement === phone ? 'press-enter' : 'resubmit';
                        });
                        if (action === 'press-enter') {
                            // Press Enter twice with a short delay
                            await this.page.keyboard.press('Enter');
                            await this.utils.wait(120);
                            await this.page.keyboard.press('Enter');
                            await this.page.evaluate(() => {
                                const phone = document.querySelector('input[type="tel"], input[placeholder*="Phone" i]');
                                if (!phone) return;
                                const opts = { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', which: 13, keyCode: 13 };
                                const fire = () => {
                                    phone.dispatchEvent(new KeyboardEvent('keydown', opts));
                                    phone.dispatchEvent(new KeyboardEvent('keypress', opts));
                                    phone.dispatchEvent(new KeyboardEvent('keyup', opts));
                                };
                                fire();
                                setTimeout(fire, 80);
                            });
                            // Last resort: focus CONTINUE anchor and press Enter twice
                            try {
                                const focused = await this.page.evaluate(() => {
                                    const phone = document.querySelector('input[type="tel"], input[placeholder*="Phone" i]');
                                    const form = phone && phone.closest('form');
                                    if (!form) return false;
                                    let cont = form.querySelector('div._1cmcE a.lyOGZ') || form.querySelector('a.lyOGZ') || null;
                                    if (!cont) return false;
                                    if (!cont.hasAttribute('tabindex')) cont.setAttribute('tabindex','0');
                                    cont.focus();
                                    return document.activeElement === cont;
                                });
                                if (focused) {
                                    await this.page.keyboard.press('Enter');
                                    await this.utils.wait(120);
                                    await this.page.keyboard.press('Enter');
                                }
                            } catch {}
                        } else if (action === 'resubmit') {
                            await this.page.evaluate(() => {
                                const phone = document.querySelector('input[type="tel"], input[placeholder*="Phone" i]');
                                const form = phone && phone.closest('form');
                                if (form) form.requestSubmit();
                            });
                        }
                    } catch {}

                    // Re-check quickly
                    try {
                        await this.page.waitForSelector(this.config.selectors.otpInput || 'input[placeholder*="OTP" i]', { timeout: 6000, visible: true });
                        otpVisible = true;
                    } catch {}

                    if (!otpVisible) {
                        existsError = await this.page.evaluate(() => {
                            const container = document.querySelector('[role="dialog"], .modal, [class*="Modal"], form');
                            if (!container) return false;
                            const text = container.innerText || '';
                            return /mobile number already exists/i.test(text) || /account already exists/i.test(text);
                        });
                    }

                    this.utils.log(`Post-Enter check — OTP: ${otpVisible}, Exists error: ${existsError}`, 'info');
                }

                if (existsError && !otpVisible) {
                    this.utils.log('Account already exists, switching to signin...', 'warning');

                    // Click "login to your account" or similar link
                    const loginLinkClicked = await this.utils.clickElement([
                        'a:has-text("login to your account")',
                        'text/login to your account',
                        'a:has-text("Login")',
                    ]);

                    if (loginLinkClicked) {
                        await this.utils.wait(2000);
                        await this.utils.screenshot('03_switched_to_login');

                        // Fill phone number in login form using modal-scoped approach
                        const loginModal = await this.page.$('[role="dialog"], .modal, [class*="Modal"]');
                        let loginInputs;

                        if (loginModal) {
                            loginInputs = await loginModal.$$('input:not([type="hidden"])');
                            this.utils.log(`Found ${loginInputs.length} input fields in login modal`, 'info');
                        } else {
                            // Fallback to form-based selection
                            const form = await this.page.$('form');
                            if (form) {
                                loginInputs = await form.$$('input:not([type="hidden"])');
                                this.utils.log(`Found ${loginInputs.length} input fields in form`, 'info');
                            }
                        }

                        // Fill phone number (first input)
                        if (loginInputs && loginInputs.length >= 1) {
                            await loginInputs[0].click();
                            await this.utils.wait(200);
                            await loginInputs[0].type(this.config.signupData.phone, { delay: 50 });
                            this.utils.log(`Entered phone in login: ${this.config.signupData.phone}`, 'info');
                        }

                        // Click LOGIN button using form submit
                        await this.utils.wait(1000);
                        await this.page.evaluate(() => {
                            const form = document.querySelector('form');
                            if (form) form.requestSubmit();
                        });
                        this.utils.log('Submitted login form', 'success');

                        await this.utils.wait(2000);
                        await this.utils.screenshot('03_otp_screen');
                    }
                }
                } else {
                    // Swiggy login (no signup)
                    this.utils.log('Filling login form for Swiggy', 'info');

                // Fill phone in login form (use Puppeteer typing to satisfy React validation)
                try {
                    const phoneSelectors = [
                        'input[placeholder*="Phone"]',
                        'input[type="tel"]',
                        'input#mobile',
                        'input[name="mobile"]',
                    ];
                    let phoneSel = null;
                    for (const sel of phoneSelectors) {
                        const exists = await this.utils.elementExists(sel, 3000);
                        if (exists) { phoneSel = sel; break; }
                    }
                    if (!phoneSel) {
                        this.utils.log('Login phone input not found', 'warning');
                    } else {
                        // Focus and clear any existing text, then type
                        await this.page.click(phoneSel);
                        await this.page.keyboard.down('Control');
                        await this.page.keyboard.press('A');
                        await this.page.keyboard.up('Control');
                        await this.page.keyboard.press('Backspace');
                        await this.utils.wait(100);
                        await this.page.type(phoneSel, this.config.signupData.phone, { delay: 50 });
                        // Blur to trigger React validation
                        try {
                            await this.page.evaluate((sel) => {
                                const el = document.querySelector(sel);
                                if (!el) return;
                                el.dispatchEvent(new Event('input', { bubbles: true }));
                                el.dispatchEvent(new Event('change', { bubbles: true }));
                                el.blur();
                            }, phoneSel);
                        } catch {}
                        this.utils.log(`Entered phone in login: ${this.config.signupData.phone}`, 'info');

                        // Click LOGIN button scoped to the same form using hardware-grade click
                        let clicked = false;
                        try {
                            const handle = await this.page.evaluateHandle((sel) => {
                                const input = document.querySelector(sel);
                                const form = input && input.closest('form');
                                if (!form) return null;
                                const nodes = Array.from(form.querySelectorAll('button, a, div, span'));
                                return nodes.find(el => ((el.innerText || el.textContent || '').trim().toUpperCase() === 'LOGIN')) || null;
                            }, phoneSel);
                            const el = handle && handle.asElement ? handle.asElement() : null;
                            if (el) {
                                const box = await el.boundingBox();
                                if (box) {
                                    const cx = box.x + box.width / 2;
                                    const cy = box.y + box.height / 2;
                                    await this.page.mouse.move(cx, cy);
                                    await this.page.mouse.down();
                                    await this.page.mouse.up();
                                    clicked = true;
                                }
                            }
                        } catch {}

                        if (!clicked) {
                            // Fallback: submit the scoped form
                            try {
                                await this.page.evaluate((sel) => {
                                    const input = document.querySelector(sel);
                                    const form = input && input.closest('form');
                                    if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
                                }, phoneSel);
                            } catch {}
                        }

                        await this.utils.wait(2000);
                    }
                } catch (e) {
                    this.utils.log(`Login form typing failed: ${e.message}`, 'warning');
                }
                }
            }

            // Now wait for OTP entry (common path for all flows)

            this.utils.log('', 'info');
            this.utils.log('═══════════════════════════════════════════════════', 'warning');
            this.utils.log('⏸️  PAUSED FOR MANUAL OTP ENTRY (up to 60s)', 'warning');
            this.utils.log('═══════════════════════════════════════════════════', 'warning');
            this.utils.log('', 'info');
            this.utils.log('Please complete the following steps:', 'info');
            this.utils.log('  1. Check your phone for the OTP', 'info');
            this.utils.log('  2. Enter the OTP in the browser', 'info');
            this.utils.log('  3. Complete the authentication process', 'info');
            this.utils.log('', 'info');
            this.utils.log('⏱️  Waiting up to 60 seconds, will continue as soon as verification finishes...', 'info');

            // Phase A: observe OTP UI (strict) so we don't exit before it appears (up to 30s)
            try {
                await this.page.waitForFunction(() => {
                    const container = document.querySelector('[role="dialog"], .modal, [class*="Modal"]');
                    if (!container) return false;
                    const text = (container.innerText || '').toLowerCase();
                    const hasText = /verify otp|didn\'t receive otp|didn’t receive otp/.test(text);
                    const inputs = Array.from(container.querySelectorAll('input'));
                    const hasOtpInputs = inputs.some(i => i.getAttribute('maxlength') === '1' || /one-time-code|otp/i.test((i.getAttribute('autocomplete')||'') + ' ' + (i.getAttribute('aria-label')||'')));
                    return hasText || hasOtpInputs;
                }, { timeout: 30000 });
            } catch {}

            // Phase B: continue only when OTP UI is gone AND Sign in trigger is absent (or header indicates logged in)
            try {
                await this.page.waitForFunction(() => {
                    // Lenskart-specific: check if sign-in-form is gone and header is present
                    const signInForm = document.querySelector('#sign-in-form');
                    const header = document.querySelector('#header-wrapper, header[id="header"]');
                    const userButton = document.querySelector('button[aria-label*="User account menu" i]');
                    
                    // If Lenskart header and user button appear, and sign-in form is gone, we're logged in
                    if (!signInForm && (header || userButton)) {
                        return true;
                    }
                    
                    // Generic check for other sites
                    const container = document.querySelector('[role="dialog"], .modal, [class*="Modal"]');
                    const otpVisible = !!(container && /otp|verify/i.test((container.innerText || '')));
                    const hasOtpInputs = !!(container && Array.from(container.querySelectorAll('input')).some(i => i.getAttribute('maxlength') === '1'));
                    const authVisible = otpVisible || hasOtpInputs;

                    // Sign in trigger still visible?
                    const signInNode = Array.from(document.querySelectorAll('a,button,div,span')).find(n => /\bsign\s*in\b/i.test(n.innerText || ''));

                    // Header-based positive signals
                    const headerEl = document.querySelector('header, [data-testid*="header" i], [class*="Header" i]');
                    const headerText = (headerEl ? headerEl.innerText : '') || '';
                    const signedInHeader = /account|profile|logout|sign out|my orders/i.test(headerText);

                    return (!authVisible) && (!signInNode || signedInHeader);
                }, { timeout: 60000 });
                this.utils.log('✅ Sign-in detected! Continuing...', 'success');
            } catch {
                this.utils.log('⚠️ OTP wait timeout - continuing anyway', 'warning');
            }

            // Close modal if still open AND it's not the OTP screen anymore
            return true;
        } catch (error) {
            this.utils.log(`Sign-in/signup failed: ${error.message}`, 'error');
            await this.utils.screenshot('error_signin');
            return false;
        }
    }

    // Search for a product/item
    async search(searchTerm) {
        this.utils.log(`Searching for "${searchTerm}"...`, 'step');

        try {
            // Close any modals (skip for Lenskart after sign-in)
            if (this.siteName !== 'lenskart') {
                await this.utils.closeModalIfPresent([
                    this.config.selectors.closeModal,
                    this.config.selectors.noThanksButton,
                    this.config.selectors.dismissButton,
                ]);
            }

            // Extra wait to ensure location is fully set (for Swiggy)
            if (this.siteName === 'swiggy') {
                await this.utils.wait(2000);
            }

            let typed = false;
            
            // Lenskart-specific search
            if (this.siteName === 'lenskart') {
                this.utils.log('Opening Lenskart search...', 'info');
                try {
                    // Wait for the search input to be available
                    const searchSelector = 'input#autocomplete-0-input, input.aa-Input[placeholder*="What are you looking for" i]';
                    await this.page.waitForSelector(searchSelector, { timeout: 5000, visible: true });
                    
                    // Click and type
                    await this.page.click(searchSelector);
                    await this.utils.wait(300);
                    await this.page.keyboard.type(searchTerm, { delay: 80 });
                    await this.utils.wait(500);
                    await this.page.keyboard.press('Enter');
                    typed = true;
                    this.utils.log('Search query entered', 'success');
                } catch (e) {
                    this.utils.log(`Lenskart search failed: ${e.message}`, 'warning');
                }
            } else if (this.siteName === 'swiggy') {
                // Prefer direct homepage search for Swiggy (supports DIV opener -> input flow)
                this.utils.log('Opening search...', 'info');
                try {
                    // 1) Click the opener DIV if present (has the text label)
                    let opener = null;
                    try {
                        const openerHandle = await this.page.evaluateHandle(() => {
                            const visible = el => { const r=el.getBoundingClientRect(); const s=getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
                            const textOf = el => ((el.innerText||el.textContent||'').trim().toLowerCase());
                            const nodes = Array.from(document.querySelectorAll('div,button,a,span')).filter(visible);
                            return nodes.find(el => textOf(el) === 'search for restaurant, item or more') || null;
                        });
                        opener = openerHandle && openerHandle.asElement ? openerHandle.asElement() : null;
                    } catch {}
                    if (opener) {
                        try { await opener.click(); } catch {}
                    }

                    // 2) Wait for the real input to be visible (overlay or page)
                    const inputSelector = 'input[type="search"], input[placeholder*="Search" i], input[aria-label*="search" i]';
                    try {
                        await this.page.waitForSelector(inputSelector, { timeout: 5000, visible: true });
                    } catch {}

                    // 3) Focus the input and type
                    const handle = await this.page.$(inputSelector);
                    if (!handle) throw new Error('Search input not found');
                    await handle.click();
                    await this.utils.wait(120);
                    await this.page.keyboard.down('Control');
                    await this.page.keyboard.press('A');
                    await this.page.keyboard.up('Control');
                    await this.page.keyboard.press('Backspace');
                    await this.page.keyboard.type(searchTerm, { delay: 70 });
                    await this.page.keyboard.press('Enter');
                    typed = true;
                } catch (e) {
                    this.utils.log(`Search focus failed: ${e.message}`, 'warning');
                }
                if (!typed) { this.utils.log('Failed to search', 'error'); return false; }
            } else {
                // Non-Swiggy: use generic selectors
                const searchBarSelectors = [this.config.selectors.searchBar, this.config.selectors.searchBarAlt];
                typed = await this.utils.typeText(
                    searchBarSelectors,
                    searchTerm,
                    { pressEnter: true }
                );
                if (!typed) {
                    this.utils.log('Failed to search', 'error');
                    return false;
                }
            }

            await this.utils.wait(this.config.timing.pageLoad);
            await this.utils.screenshot('04_search_results');
            this.utils.log('Search completed successfully', 'success');

            return true;
        } catch (error) {
            this.utils.log(`Search failed: ${error.message}`, 'error');
            await this.utils.screenshot('error_search');
            return false;
        }
    }

    // Handle product customization (lens selection for Lenskart, food options for Swiggy)
    async handleCustomization() {
        if (!this.config.hasCustomization) {
            return true;
        }

        this.utils.log('Checking for customization options...', 'step');

        try {
            if (this.siteName === 'lenskart') {
                // Check if lens selection is required
                const hasLensButton = await this.utils.elementExists(
                    this.config.selectors.selectLensesButton,
                    3000
                );

                if (hasLensButton) {
                    this.utils.log('Lens customization detected', 'info');
                    await this.utils.clickElement(this.config.selectors.selectLensesButton);
                    await this.utils.wait(2000);
                    await this.utils.screenshot('06_lens_customization');

                    // Try to select "Without Lenses" or skip
                    const skipped = await this.utils.clickElement([
                        this.config.selectors.noLensOption,
                        this.config.selectors.skipLensButton,
                    ]);

                    if (skipped) {
                        await this.utils.wait(1000);
                        await this.utils.clickElement(this.config.selectors.proceedButton);
                    }
                }
            } else if (this.siteName === 'swiggy') {
                // Dynamic, step-based customization handling (also handles no-customization final Add)
                // Briefly poll for modal or direct final Add for up to ~2s
                await this.utils.wait(600);
                let modalPresent = false;
                for (let i = 0; i < 4; i++) {
                    modalPresent = await this.page.evaluate(() => !!document.querySelector('[role="dialog"], .modal, [class*="Modal"], #customise-content'));
                    if (modalPresent) break;
                    // If final Add button exists without steps, click it directly
                    const quickAdd = await this.page.$('button[data-cy="customize-footer-add-button"]');
                    if (quickAdd) { try { await quickAdd.click(); await new Promise(r=>setTimeout(r,900)); } catch {} return true; }
                    await this.utils.wait(350);
                }
                if (modalPresent) {
                    this.utils.log('Food customization detected', 'info');
                    await this.utils.screenshot('05_food_customization_step1');

                    let completed = false;
                    for (let step = 0; step < 6 && !completed; step++) {
                        // Prefer the official Continue button if present
                        let continued = false;
                        try {
                            // Log step numbers from aria-label: "Step X out of Y"
                            const meta = await this.page.evaluate(() => {
                                const btn = document.querySelector('button[data-testid="menu-customize-continue-button"]');
                                const label = btn?.getAttribute('aria-label') || '';
                                const m = label.match(/step\s*(\d+)\s*out\s*of\s*(\d+)/i);
                                return { has: !!btn, cur: m?.[1] || null, tot: m?.[2] || null };
                            });
                            if (meta?.cur && meta?.tot) this.utils.log(`Customization Step ${meta.cur}/${meta.tot}`, 'info');
                            if (meta?.has) {
                                const h = await this.page.$('button[data-testid="menu-customize-continue-button"]');
                                if (h) { await h.click(); continued = true; }
                            }
                        } catch {}
                        if (continued) { await this.utils.wait(900); continue; }

                        // If Continue not visible, try to click Add Item to cart (final step)
                        let clickedFinal = false;
                        try {
                            const addBtn = await this.page.$('button[data-cy="customize-footer-add-button"]');
                            if (addBtn) { await addBtn.click(); clickedFinal = true; }
                            else {
                                const h = await this.page.evaluateHandle(() => {
                                    const dlg = document.querySelector('[role="dialog"], .modal, [class*="Modal"], #customise-content');
                                    if (!dlg) return null;
                                    const visible = el => { const r=el.getBoundingClientRect(); const s=getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
                                    const byText = Array.from(dlg.querySelectorAll('button, [role="button"], span, div')).find(el => visible(el) && /\badd\s*item\s*to\s*cart\b/i.test((el.innerText||el.textContent||'')));
                                    const t = byText ? (byText.closest('button') || byText) : null;
                                    if (t) t.scrollIntoView({block:'center'});
                                    return t;
                                });
                                const el = h && h.asElement ? h.asElement() : null;
                                if (el) { await el.click(); clickedFinal = true; }
                            }
                        } catch {}
                        if (clickedFinal) { await this.utils.wait(1200); completed = true; break; }

                        // If some option must be selected, pick the first visible radio then loop again
                        try {
                            const picked = await this.page.evaluate(() => {
                                const dlg = document.querySelector('[role="dialog"], .modal, [class*="Modal"], #customise-content');
                                if (!dlg) return false;
                                const visible = el => { const r=el.getBoundingClientRect(); const s=getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
                                const radios = Array.from(dlg.querySelectorAll('input[type="radio"]')).filter(visible);
                                const r = radios.find(x => !x.checked) || radios[0];
                                if (r) { r.click(); return true; }
                                return false;
                            });
                            if (picked) { await this.utils.wait(400); continue; }
                        } catch {}

                        // Last-resort: click any primary-looking footer button
                        try {
                            const anyBtn = await this.page.evaluateHandle(() => {
                                const dlg = document.querySelector('[role="dialog"], .modal, [class*="Modal"], #customise-content');
                                if (!dlg) return null;
                                return Array.from(dlg.querySelectorAll('button')).find(b => /continue|add/i.test(b.innerText||'')) || null;
                            });
                            const el = anyBtn && anyBtn.asElement ? anyBtn.asElement() : null;
                            if (el) { await el.click(); await this.utils.wait(800); }
                        } catch {}
                    }

                    // Final attempt to click Add Item to cart by config selectors
                    if (!completed) {
                        await this.utils.clickElement([
                            this.config.selectors.addToCartCustomize,
                            this.config.selectors.addToCartAlt,
                        ]);
                        await this.utils.wait(1200);
                    }

                    this.utils.log('Customization completed', 'success');
                    return true;
                }
            }

            return true;
        } catch (error) {
            this.utils.log(`Customization handling failed: ${error.message}`, 'warning');
            await this.utils.screenshot('error_customization');
            return false;
        }
    }

    // Add first product/item to cart
    async addToCart() {
        this.utils.log('Adding item to cart...', 'step');

        try {
            if (this.siteName === 'lenskart') {
                // Click first product card (from search results) - opens in new tab
                this.utils.log('Clicking first product...', 'info');
                
                // Listen for new tab
                const newPagePromise = new Promise(resolve => {
                    this.browser.once('targetcreated', async target => {
                        const newPage = await target.page();
                        resolve(newPage);
                    });
                });
                
                const productClicked = await this.utils.clickElement([
                    'a.sc-23b7d3eb-7.gZcHRJ',
                    '.sc-23b7d3eb-8.gUutuN a',
                    'div[data-cy="plpCardContainerProductImage"]',
                    'a[class*="sc-"][class*="eb-"]'
                ]);

                if (!productClicked) {
                    this.utils.log('Failed to click product', 'error');
                    return false;
                }

                // Switch to the new tab
                this.utils.log('Switching to product page tab...', 'info');
                const newPage = await newPagePromise;
                await newPage.waitForLoadState?.('domcontentloaded').catch(() => {});
                this.page = newPage; // Switch context to new tab
                
                this.utils.log('Waiting for product page to load...', 'info');
                await this.utils.wait(3000);
                await this.utils.screenshot('05_product_page');

                // Dynamically detect and click the primary action button
                this.utils.log('Detecting primary action button...', 'info');
                await this.utils.wait(2000);
                
                // Check what the primary button says
                const buttonInfo = await this.page.evaluate(() => {
                    const primaryBtn = document.getElementById('btn-primary');
                    if (!primaryBtn) return { found: false };
                    const text = (primaryBtn.innerText || primaryBtn.textContent || '').trim().toUpperCase();
                    return {
                        found: true,
                        text: text,
                        isSelectLenses: text.includes('SELECT LENSES'),
                        isBuyNow: text.includes('BUY NOW')
                    };
                });
                
                if (!buttonInfo.found) {
                    this.utils.log('No primary button found!', 'error');
                    return false;
                }
                
                this.utils.log(`Primary button text: "${buttonInfo.text}"`, 'info');
                
                // Click the primary button
                await this.page.click('#btn-primary');
                this.utils.log(`Clicked: ${buttonInfo.text}`, 'success');
                await this.utils.wait(2000);
                
                // If it was SELECT LENSES, handle customization flow
                if (buttonInfo.isSelectLenses) {
                    
                    // Step 1: Check for "Select Lens Type" modal
                    this.utils.log('Checking for lens type selection modal...', 'info');
                    const hasLensTypeModal = await this.page.evaluate(() => {
                        return !!document.querySelector('[role="dialog"]') && document.body.innerText.includes('Select Lens Type');
                    });
                    
                    if (hasLensTypeModal) {
                        this.utils.log('Lens type modal found, selecting first option...', 'info');
                        // Click first lens type option
                        const clicked = await this.page.evaluate(() => {
                            const firstOption = document.querySelector('[data-cy="PackageItemWrapper"][role="button"]');
                            if (firstOption) {
                                firstOption.click();
                                return true;
                            }
                            return false;
                        });
                        if (clicked) {
                            this.utils.log('Selected first lens type', 'success');
                            await this.utils.wait(2000);
                        }
                    }
                    
                    // Step 2: Check for "Choose Lens Package" modal
                    this.utils.log('Checking for lens package selection modal...', 'info');
                    const hasPackageModal = await this.page.evaluate(() => {
                        return !!document.querySelector('[role="dialog"]') && document.body.innerText.includes('Choose Lens Package');
                    });
                    
                    if (hasPackageModal) {
                        this.utils.log('Lens package modal found, selecting first option...', 'info');
                        // Click first package using Puppeteer's native click (more reliable)
                        let clicked = false;
                        try {
                            // Try clicking the h3 element inside the first package
                            const h3Element = await this.page.$('div[id="package-card-wrapper"] h3');
                            if (h3Element) {
                                await h3Element.click();
                                clicked = true;
                            }
                        } catch (e) {
                            this.utils.log(`h3 click failed: ${e.message}`, 'warning');
                        }
                        
                        if (!clicked) {
                            // Fallback: try clicking the role="button" element
                            try {
                                const buttonElement = await this.page.$('div[id="package-card-wrapper"] [role="button"]');
                                if (buttonElement) {
                                    await buttonElement.click();
                                    clicked = true;
                                }
                            } catch (e) {
                                this.utils.log(`role=button click failed: ${e.message}`, 'warning');
                            }
                        }
                        
                        if (!clicked) {
                            // Last fallback: click the wrapper itself
                            try {
                                await this.page.click('div[id="package-card-wrapper"]');
                                clicked = true;
                            } catch (e) {
                                this.utils.log(`wrapper click failed: ${e.message}`, 'warning');
                            }
                        }
                        if (clicked) {
                            this.utils.log('Selected first lens package', 'success');
                            await this.utils.wait(2000);
                            
                            // Click CONTINUE button
                            this.utils.log('Clicking CONTINUE button...', 'info');
                            const continueClicked = await this.page.evaluate(() => {
                                const continueBtn = document.querySelector('button[data-cy="packageBtnContinue"]');
                                if (continueBtn) {
                                    continueBtn.click();
                                    return true;
                                }
                                return false;
                            });
                            if (continueClicked) {
                                this.utils.log('Clicked CONTINUE', 'success');
                                await this.utils.wait(2000);
                            } else {
                                this.utils.log('CONTINUE button not found', 'warning');
                            }
                        } else {
                            this.utils.log('Failed to click lens package', 'warning');
                        }
                    }
                }

                // Wait for cart page
                this.utils.log('Waiting for cart page...', 'info');
                await this.utils.wait(3000);
                await this.utils.screenshot('06_cart');

                // Click Proceed To Checkout
                this.utils.log('Clicking Proceed To Checkout...', 'info');
                try {
                    await this.page.waitForSelector('div[data-cy="cart-cta-desktop"]', { timeout: 5000 });
                    await this.page.click('div[data-cy="cart-cta-desktop"]');
                    this.utils.log('Clicked Proceed To Checkout', 'success');
                    await this.utils.wait(2000);
                    await this.utils.screenshot('07_checkout');
                    this.utils.log('✅ Lenskart automation completed successfully!', 'success');
                    return true;
                } catch (e) {
                    this.utils.log(`Failed to click Proceed To Checkout: ${e.message}`, 'error');
                    return false;
                }
            } else if (this.siteName === 'swiggy') {
                // Ensure search/menu results are rendered
                try { await this.page.waitForFunction(() => !!document.querySelector('[data-testid*="dish" i], [data-testid*="normal-dish" i], [data-testid*="grid" i]'), { timeout: 4000 }); } catch {}
                await this.utils.wait(800);
                // Capture initial cart count to verify increment later
                const preCount = await this.getCartCount();
                // Try to locate a visible 'ADD' control anywhere (search results or menu)
                let clicked = false;
                try {
                    // Attempt multiple scroll chunks to surface buttons
                    for (let i = 0; i < 4 && !clicked; i++) {
                        const handle = await this.page.evaluateHandle(() => {
                            const visible = (el) => {
                                if (!el) return false;
                                const r = el.getBoundingClientRect();
                                const st = window.getComputedStyle(el);
                                if (st.visibility === 'hidden' || st.display === 'none' || st.opacity === '0') return false;
                                return r.width > 0 && r.height > 0;
                            };
                            const textOf = (el) => ((el.innerText || el.textContent || '').trim());
                            // Prefer Add buttons inside dish cards
                            const dishContainers = Array.from(document.querySelectorAll('[data-testid*="dish" i], [data-testid*="normal-dish" i]'));
                            let candidates = [];
                            for (const c of dishContainers) {
                                candidates.push(...Array.from(c.querySelectorAll('button, div[role="button"], div, a, span')));
                            }
                            if (candidates.length === 0) {
                                candidates = Array.from(document.querySelectorAll('button, div[role="button"], div, a, span'));
                            }
                            // Strategy: choose the BUTTON with class *add-button-center-container* or ancestor BUTTON of a node with text 'ADD'/'Add'
                            let btn = Array.from(document.querySelectorAll('button')).find(b => /add-button-center-container/i.test(b.className)) || null;
                            if (!btn) {
                                const labelNode = candidates.find(el => {
                                    const t = textOf(el);
                                    if (!t) return false;
                                    const tl = t.toLowerCase();
                                    if (tl === 'more details') return false;
                                    return tl === 'add' || tl === 'add item' || tl === 'add to cart';
                                });
                                if (labelNode) btn = labelNode.closest('button');
                            }
                            if (btn && !visible(btn)) { btn = null; }
                            if (btn) { btn.scrollIntoView({ block: 'center' }); }
                            if (btn) { btn.scrollIntoView({ block: 'center' }); }
                            return btn;
                        });
                        const el = handle && handle.asElement ? handle.asElement() : null;
                        if (el) {
                            const box = await el.boundingBox();
                            if (box) {
                                const cx = box.x + box.width / 2;
                                const cy = box.y + box.height / 2;
                                await this.page.mouse.move(cx, cy);
                                await this.page.mouse.down();
                                await this.page.mouse.up();
                                clicked = true;
                            } else {
                                await el.click();
                                clicked = true;
                            }
                        } else {
                            // Scroll to reveal more results
                            await this.page.evaluate(() => window.scrollBy(0, 600));
                            await this.utils?.wait?.(400);
                        }
                    }
                } catch {}

                // Fallback to simple selectors if hardware scan didn't click
                if (!clicked) {
                    clicked = await this.utils.clickElement([
                        this.config.selectors.addButton,
                        this.config.selectors.addButtonAlt,
                        'button:has-text("Add")',
                        'div:has-text("Add")',
                    ]);
                }

                if (!clicked) {
                    // Likely on search/listing page; open first restaurant and then add
                    this.utils.log('ADD not found on current page, opening first restaurant...', 'info');
                    let opened = await this.utils.clickElement([
                        'a[href*="/restaurants/"]',
                        'a[role="link"]:has-text("Restaurant")',
                    ]);
                    if (!opened) {
                        // Fallback: click first card-looking link
                        try {
                            const handle = await this.page.evaluateHandle(() => {
                                const visible = el => {
                                    const r = el.getBoundingClientRect();
                                    const st = window.getComputedStyle(el);
                                    return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
                                };
                                return Array.from(document.querySelectorAll('a'))
                                    .filter(visible)
                                    .find(a => /restaurant/i.test((a.innerText || a.textContent || '')) || /\/restaurants\//.test(a.getAttribute('href') || '')) || null;
                            });
                            const el = handle && handle.asElement ? handle.asElement() : null;
                            if (el) {
                                await el.click();
                                opened = true;
                            }
                        } catch {}
                    }

                    if (!opened) {
                        this.utils.log('Could not open a restaurant from search results', 'error');
                        return false;
                    }

                    await this.utils.wait(this.config.timing.pageLoad);
                    await this.utils.screenshot('05_restaurant_menu');

                    // Now try clicking ADD on the menu
                    clicked = await this.utils.clickElement([
                        this.config.selectors.addButton,
                        this.config.selectors.addButtonAlt,
                    ]);
                    if (!clicked) {
                        this.utils.log('Failed to click ADD button after opening restaurant', 'error');
                        return false;
                    }
                }

                await this.utils.wait(2000);

                // If a details dialog opened instead of customization, click ADD inside the dialog
                try {
                    const hadDetails = await this.page.evaluate(() => {
                        const dlg = document.querySelector('[role="dialog"], .modal, [class*="Modal"]');
                        if (!dlg) return false;
                        const txt = (dlg.innerText || '').toLowerCase();
                        // Details dialog often has big image + an ADD on bottom-right
                        const addBtn = Array.from(dlg.querySelectorAll('button, [role="button"], div, a, span')).find(el => /\badd\b/i.test((el.innerText||el.textContent||'').trim()));
                        if (addBtn) { (addBtn instanceof HTMLElement) && addBtn.click(); return true; }
                        return false;
                    });
                    if (hadDetails) {
                        await this.utils.wait(1200);
                    }
                } catch {}

                // Handle customization
                await this.handleCustomization();

                // Verify add actually happened; if not, try final Add once
                await this.utils.wait(800);
                let addedOk = false;
                try {
                    addedOk = await this.page.evaluate(() => {
                        // Header cart count > 0
                        const header = document.querySelector('a[href*="/checkout"] span');
                        const txt = (header?.innerText || header?.textContent || '').trim();
                        const n = parseInt(txt, 10);
                        if (!isNaN(n) && n > 0) return true;
                        // Any mini cart/quantity control visible near an added item
                        return !!Array.from(document.querySelectorAll('button,div')).find(el => /\badded\b|\bqty\b|\bitem added\b/i.test(el.innerText || ''));
                    });
                } catch {}

                if (!addedOk) {
                    // Try clicking modal Add if present, else re-click first ADD on the card
                    try {
                        const addInModal = await this.page.$('button[data-cy="customize-footer-add-button"]');
                        if (addInModal) { await addInModal.click(); await this.utils.wait(1000); }
                        else {
                            await this.utils.clickElement([
                                this.config.selectors.addButton,
                                this.config.selectors.addButtonAlt,
                            ]);
                            await this.utils.wait(1000);
                        }
                    } catch {}
                }

                // Final sanity: cart count should increase
                try {
                    const postCount = await this.getCartCount();
                    if (typeof postCount === 'number' && postCount <= preCount) {
                        this.utils.log(`Cart count did not increase (before=${preCount}, after=${postCount}). Retrying add once...`, 'warning');
                        // One retry: click final Add in modal or card ADD
                        const addInModal = await this.page.$('button[data-cy="customize-footer-add-button"]');
                        if (addInModal) { await addInModal.click(); await this.utils.wait(1000); }
                        else {
                            await this.utils.clickElement([
                                this.config.selectors.addButton,
                                this.config.selectors.addButtonAlt,
                            ]);
                            await this.utils.wait(1000);
                        }
                    }
                } catch {}

                await this.utils.screenshot('06_cart');
                this.utils.log('Item added to cart successfully', 'success');
                return true;
            }

            return false;
        } catch (error) {
            this.utils.log(`Add to cart failed: ${error.message}`, 'error');
            await this.utils.screenshot('error_add_to_cart');
            return false;
        }
    }

    // Main automation flow
    async run(searchTerm) {
        try {
            await this.init();

            // Step 1: Sign-in FIRST (pause for manual OTP entry)
            this.utils.log('Starting authentication flow...', 'step');
            await this.signin();

            // Step 2: Set location (if required) - AFTER signin
            if (this.config.requiresLocation) {
                await this.setLocation();
            }

            // Step 3: Search for item
            const searchSuccess = await this.search(searchTerm);
            if (!searchSuccess) {
                throw new Error('Search failed');
            }

            // Step 4: Add to cart
            const cartSuccess = await this.addToCart();
            if (!cartSuccess) {
                throw new Error('Add to cart failed');
            }

            // Step 5: Open cart from top bar (skip for Lenskart - already at checkout)
            if (this.siteName !== 'lenskart') {
                await this.openCartTopbar();
            }

            this.utils.log('\n✅ Automation completed successfully!\n', 'success');
            this.utils.log(`📁 Screenshots saved in: ./screenshots/${this.siteName}/`, 'info');

            // Keep browser open for 10 seconds to view results
            this.utils.log('⏳ Keeping browser open for 10 seconds...', 'info');
            await this.utils.wait(10000);

        } catch (error) {
            this.utils.log(`\n❌ Automation failed: ${error.message}\n`, 'error');
            await this.utils.screenshot('error_final');
            throw error;
        } finally {
            if (this.browser) {
                await this.browser.close();
                this.utils.log('Browser closed', 'info');
            }
        }
    }
}

// Main execution
(async () => {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log('\n❌ Usage:');
        console.log('  node automation.js <site> <searchTerm>');
        console.log('  node automation.js lenskart <authMode> <searchTerm>');
        console.log('    <authMode>: signin | signup (optional; default: auto)');
        console.log('\nExamples:');
        console.log('  node automation.js swiggy pizza');
        console.log('  node automation.js swiggy ice cream');
        console.log('  node automation.js swiggy "ice cream"');
        console.log('  node automation.js lenskart signin sunglasses');
        console.log('  node automation.js lenskart signup prescription glasses\n');
        process.exit(1);
    }

    let site = args[0];
    let authMode = 'auto';
    let searchTerm;

    if (site === 'lenskart' && args.length >= 3 && /^(signin|signup)$/i.test(args[1])) {
        authMode = args[1].toLowerCase();
        searchTerm = args.slice(2).join(' '); // Join all remaining args for multi-word search
    } else {
        searchTerm = args.slice(1).join(' '); // Join all remaining args for multi-word search
    }

    try {
        const automation = new EcommerceAutomation(site, authMode);
        await automation.run(searchTerm);
        process.exit(0);
    } catch (error) {
        console.error(`\n❌ Fatal error: ${error.message}\n`);
        process.exit(1);
    }
})();

module.exports = EcommerceAutomation;
