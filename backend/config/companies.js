/**
 * Multi-firm configuration for invoice generation
 *
 * Each firm has its own header details and is associated with specific product categories.
 * Products are auto-assigned to firms based on their category during invoice generation.
 */

module.exports = {
  firms: [
    {
      id: 'pratibha',
      name: 'Pratibha Marketing',
      address: 'Block No. 20, Fule Market (Cotton Market), Nagpur - 440018',
      phone: '9422104097, 7057773445, 7897896359',
      whatsapp: '9422104097',
      email: 'pratibhamarketing22@gmail.com',
      // Categories that belong to this firm (all categories NOT in other firms)
      isDefault: true // Fallback firm for categories not explicitly assigned elsewhere
    },
    {
      id: 'vikas',
      name: 'Vikas Frozen Foods',
      address: 'Block No. 123, Fule Market (Cotton Market), Nagpur - 440018',
      phone: '9422104097, 7057773445, 7897896359',
      whatsapp: '9422104097',
      email: 'vikasfrozenfoods@gmail.com',
      // Categories that belong to this firm
      categories: ['Fruits', 'Frozen']
    }
  ],

  /**
   * Get firm by ID
   * @param {string} firmId - The firm identifier
   * @returns {object|null} Firm object or null if not found
   */
  getFirmById(firmId) {
    return this.firms.find(f => f.id === firmId) || null;
  },

  /**
   * Get the appropriate firm for a product category
   * @param {string} category - Product category
   * @returns {object} Firm object (returns default firm if no match)
   */
  getFirmForCategory(category) {
    // Find firm that explicitly lists this category
    const matchedFirm = this.firms.find(f =>
      f.categories && f.categories.includes(category)
    );

    if (matchedFirm) {
      return matchedFirm;
    }

    // Return default firm
    return this.firms.find(f => f.isDefault) || this.firms[0];
  },

  /**
   * Get the default firm
   * @returns {object} Default firm object
   */
  getDefaultFirm() {
    return this.firms.find(f => f.isDefault) || this.firms[0];
  }
};

// Validate configuration at module load time
(function validateConfig() {
  const config = module.exports;

  // Check at least one firm exists
  if (!config.firms || config.firms.length === 0) {
    throw new Error('Company configuration error: No firms defined');
  }

  // Check exactly one default firm
  const defaultFirms = config.firms.filter(f => f.isDefault);
  if (defaultFirms.length === 0) {
    throw new Error('Company configuration error: No default firm defined');
  }
  if (defaultFirms.length > 1) {
    throw new Error('Company configuration error: Multiple default firms defined');
  }

  // Check for duplicate IDs
  const ids = config.firms.map(f => f.id);
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (duplicates.length > 0) {
    throw new Error(`Company configuration error: Duplicate firm IDs: ${duplicates.join(', ')}`);
  }

  // Check required fields
  config.firms.forEach(firm => {
    if (!firm.id || !firm.name) {
      throw new Error(`Company configuration error: Firm missing required fields (id, name): ${JSON.stringify(firm)}`);
    }
  });
})();
