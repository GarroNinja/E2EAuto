# E2E Automation Script

Generic e-commerce automation script for **Lenskart.com** and **Swiggy.com** using Puppeteer.

## Features

✅ **Generic Architecture**: Single script handles both sites through configuration  
✅ **Complete Flow**: Signup → Signin → Search → Add to Cart  
✅ **Smart Customization**: Handles lens selection (Lenskart) and food options (Swiggy)  
✅ **Error Handling**: Retry logic, fallback selectors, screenshot capture  
✅ **Location Support**: Automatic location setting for Swiggy  
✅ **Detailed Logging**: Step-by-step console output with emojis  

## Installation

```bash
npm install
```

This will install Puppeteer and its dependencies (including Chromium).

## Usage

### Basic Command

```bash
node automation.js swiggy <searchTerm>
node automation.js lenskart <authMode> <searchTerm>
```

### Examples

**Swiggy - Search for pizza:**
```bash
node automation.js swiggy pizza
```

**Swiggy - Search with multiple words (two ways):**
```bash
node automation.js swiggy ice cream
# OR
node automation.js swiggy "ice cream"
```

**Lenskart - Sign in and search:**
```bash
node automation.js lenskart signin sunglasses
```

**Lenskart - Sign up with multi-word search:**
```bash
node automation.js lenskart signup prescription glasses
# OR
node automation.js lenskart signup "prescription glasses"
```

## Before You Test, Make sure to update the config.js file with your own data

### For swiggy

```js
    defaultLocation: 'Your Residence', // will select the first closest match
```

```js
    // Signup/Signin data
    signupData: {
      phone: '1234567890',
      name: 'Jane Doe',
      email: 'janedoe@gmail.com',
    },
```

### For lenskart

```js
    // Signup/Signin data
    signupData: {
      phone: '1234567890',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'janedoe@gmail.com',
      password: 'YourPassword123#',
    },
```

## How It Works

### Flow Overview

1. **Initialize**: Launch browser and navigate to site
2. **Sign-in/Sign-up**: Authenticate (pauses for manual OTP entry, auto-detects completion)
3. **Set Location** (Swiggy only): Enter and select location
4. **Search**: Search for the specified term
5. **Add to Cart**: Click first result and handle customization
6. **Checkout** (Lenskart): Proceed to checkout page
7. **Screenshots**: Capture screenshots at each step

### Site-Specific Handling

#### Lenskart
- Supports signin and signup modes
- Auto-detects OTP completion (no 60s wait!)
- Searches for products (e.g., sunglasses, eyeglasses)
- Clicks first product (opens in new tab)
- Clicks "BUY NOW" button
- Proceeds to checkout page

#### Swiggy
- Sets location to Bangalore (configurable)
- Navigates to Search page
- Searches for food items (e.g., pizza, burger)
- Clicks "ADD" on first item
- Handles multi-step customization modal
- Selects default options and adds to cart

## Configuration

Edit `config.js` to customize:

- **Selectors**: Update CSS/XPath selectors if site structure changes
- **Timing**: Adjust wait times for slower/faster connections
- **Location**: Change default location for Swiggy
- **Customization**: Modify customization handling logic

### Example Configuration

```javascript
swiggy: {
  baseUrl: 'https://www.swiggy.com',
  requiresLocation: true,
  defaultLocation: 'Mumbai', // Change this
  timing: {
    pageLoad: 5000,
    elementWait: 3000,
  },
  // ... selectors
}
```

## Screenshots

Screenshots are automatically saved in `./screenshots/<site>/` directory:

- `01_homepage.png` - Initial homepage
- `02_location_set.png` - After setting location (Swiggy)
- `03_signin_modal.png` - Sign-in modal (if enabled)
- `04_search_results.png` - Search results page
- `05_product_page.png` / `05_food_customization_step1.png` - Product/customization
- `06_cart.png` - Final cart state
- `error_*.png` - Error screenshots if something fails

## Limitations

### Authentication
Both sites use **phone-based OTP authentication**:
- The script automatically fills phone number
- You need to manually enter OTP
- Script auto-detects when OTP is completed and continues with the automation

### Dynamic Content
- Sites may show different content based on location and time
- Selectors may change if sites update their UI
- Some products may be out of stock or unavailable

### Customization Variations
- Lenskart products may have different customization flows
- Swiggy items may have varying numbers of customization steps
- Script uses "select first option" strategy which may not suit all cases

## Troubleshooting

### "Selector not found" errors
- Site structure may have changed
- Update selectors in `config.js`
- Check screenshots to see current state

### Timeout errors
- Increase timing values in `config.js`
- Check internet connection
- Site may be slow or down

### Customization not working
- Different products have different customization flows
- Check screenshots to see what's happening
- Manually adjust customization logic in `automation.js`

### Browser doesn't open
- Puppeteer may not have installed Chromium correctly
- Run `npm install puppeteer` again
- Or install Chromium manually

## Advanced Usage

### Headless Mode

Edit `automation.js` and change:

```javascript
this.browser = await puppeteer.launch({
  headless: true, // Change to true
  // ...
});
```

### Authentication Modes (Lenskart)

Use different auth modes:

```bash
# Sign in with existing account
node automation.js lenskart signin sunglasses

# Create new account
node automation.js lenskart signup sunglasses # not tested perfectly due to lack of non signed up phone numbers, but the sign up does get processed as "already exists" for the phone number
```

### Custom Search Terms

```bash
node automation.js lenskart "prescription glasses"
node automation.js swiggy "chicken biryani"
```

### Modify Customization Logic

Edit the `handleCustomization()` method in `automation.js` to:
- Select specific options instead of first available
- Handle more complex customization flows
- Skip customization entirely

## Project Structure

```
E2EAuto/
├── automation.js      # Main automation script
├── config.js          # Site-specific configuration
├── utils.js           # Helper utilities
├── package.json       # Dependencies and scripts
├── README.md          # This file
└── screenshots/       # Auto-generated screenshots
    ├── lenskart/
    └── swiggy/
```
