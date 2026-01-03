/**
 * Site-specific configuration for Lenskart and Swiggy automation
 */

const config = {
  lenskart: {
    name: 'Lenskart',
    baseUrl: 'https://www.lenskart.com',
    selectors: {
      // Auth selectors
      signInButton: 'a[href*="customer/account"]',
      signInButtonAlt: 'text/Sign In',
      phoneInput: 'input[type="tel"]',
      otpInput: 'input[placeholder*="OTP"]',
      continueButton: 'button:has-text("Continue")',

      // Search selectors
      searchBar: 'input[placeholder*="Search"]',
      searchBarAlt: 'input[type="search"]',
      searchButton: 'button[type="submit"]',

      // Product listing selectors
      productCard: '.product-item',
      productCardAlt: 'a[href*="sunglasses.html"]',
      productLink: 'a.product-item-link',

      // Product page selectors
      buyNowButton: 'button:has-text("BUY NOW")',
      addToCartButton: 'button:has-text("ADD TO CART")',
      selectLensesButton: 'button:has-text("SELECT LENSES")',

      // Lens customization selectors
      noLensOption: 'text/Without Lenses',
      skipLensButton: 'button:has-text("Skip")',
      proceedButton: 'button:has-text("Proceed")',

      // Cart selectors
      cartIcon: 'a[href*="/cart"]',
      cartCount: '.cart-count',

      // Modal/Popup selectors
      closeModal: 'button[aria-label="Close"]',
      noThanksButton: 'button:has-text("No thanks")',
      dismissButton: '[class*="close"]',
    },

    // Timing configuration
    timing: {
      pageLoad: 5000,
      elementWait: 3000,
      shortWait: 1000,
      longWait: 10000,
    },

    // Flow-specific settings
    requiresLocation: false,
    hasCustomization: true,
    customizationType: 'lens',

    // Signup/Signin data
    signupData: {
      phone: '7760809118',
      firstName: 'Rithvik',
      lastName: 'Allada',
      email: 'rithvik25allada@gmail.com',
      password: 'YourPassword123#',
    },
  },

  swiggy: {
    name: 'Swiggy',
    baseUrl: 'https://www.swiggy.com',
    selectors: {
      // Auth selectors
      signInButton: 'a:has-text("Sign in")',
      signInButtonAlt: 'text/Sign in',
      phoneInput: 'input[type="tel"]',
      otpInput: 'input[placeholder*="OTP"]',
      continueButton: 'button:has-text("Continue")',

      // Location selectors
      locationInput: 'input[placeholder*="location"]',
      locationInputAlt: 'input[placeholder*="Enter"]',
      locationSuggestion: '[class*="location"] div',
      locationSuggestionAlt: 'text/Bangalore',

      // Search selectors
      searchLink: 'a:has-text("Search")',
      searchBar: 'input[placeholder*="Search"]',
      searchBarAlt: 'input[type="text"]',

      // Product listing selectors
      addButton: 'button:has-text("ADD")',
      addButtonAlt: 'div:has-text("ADD")',

      // Customization selectors
      customizeModal: '[class*="modal"]',
      radioOption: 'input[type="radio"]',
      checkboxOption: 'input[type="checkbox"]',
      continueCustomize: 'button:has-text("Continue")',
      addToCartCustomize: 'button:has-text("Add Item to cart")',
      addToCartAlt: 'button:has-text("ADD ITEM")',

      // Cart selectors
      cartIcon: 'a[href*="/cart"]',
      cartCount: '[class*="cart"]',
      viewCart: 'text/View Cart',

      // Modal/Popup selectors
      closeModal: 'button[aria-label="Close"]',
      dismissButton: '[class*="close"]',
    },

    // Timing configuration
    timing: {
      pageLoad: 5000,
      elementWait: 3000,
      shortWait: 1000,
      longWait: 10000,
    },

    // Flow-specific settings
    requiresLocation: true,
    defaultLocation: 'Bangalore',
    hasCustomization: true,
    customizationType: 'food',

    // Signup/Signin data
    signupData: {
      phone: '9849397113',
      name: 'Rithvik A',
      email: 'rithvik25allada@gmail.com',
    },
  },
};

module.exports = config;
