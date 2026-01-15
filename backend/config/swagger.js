const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Pratibha Marketing API',
      version: '1.0.0',
      description: 'Agricultural supply chain management API for order management, customer pricing, and market rates',
      contact: {
        name: 'API Support'
      }
    },
    servers: [
      {
        url: '/api',
        description: 'API Server'
      }
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'token'
        },
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
            name: { type: 'string', example: 'John Doe' },
            email: { type: 'string', example: 'john@example.com' },
            phone: { type: 'string', example: '9876543210' },
            role: { type: 'string', enum: ['admin', 'staff', 'customer'], example: 'customer' },
            customer: { type: 'string', description: 'Customer ID (for customer role)' },
            isActive: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Customer: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
            name: { type: 'string', example: 'ABC Traders' },
            phone: { type: 'string', example: '9876543210' },
            whatsapp: { type: 'string', example: '9876543210' },
            address: { type: 'string', example: '123 Market Road, City' },
            pricingType: { type: 'string', enum: ['market', 'markup', 'contract'], example: 'market' },
            markupPercentage: { type: 'number', example: 10 },
            contractPrices: { type: 'object', additionalProperties: { type: 'number' } },
            isActive: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Product: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
            name: { type: 'string', example: 'Wheat' },
            unit: { type: 'string', enum: ['quintal', 'bag', 'kg', 'piece', 'ton', 'bunch'], example: 'quintal' },
            category: { type: 'string', example: 'Grains' },
            isActive: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Order: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
            orderNumber: { type: 'string', example: 'ORD24010001' },
            customer: { type: 'string', description: 'Customer ID' },
            products: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  product: { type: 'string', description: 'Product ID' },
                  productName: { type: 'string', example: 'Wheat' },
                  quantity: { type: 'number', example: 10 },
                  unit: { type: 'string', example: 'quintal' },
                  rate: { type: 'number', example: 2500 },
                  amount: { type: 'number', example: 25000 }
                }
              }
            },
            totalAmount: { type: 'number', example: 25000 },
            status: {
              type: 'string',
              enum: ['pending', 'confirmed', 'processing', 'packed', 'shipped', 'delivered', 'cancelled'],
              example: 'pending'
            },
            paymentStatus: { type: 'string', enum: ['unpaid', 'partial', 'paid'], example: 'unpaid' },
            paidAmount: { type: 'number', example: 0 },
            deliveryAddress: { type: 'string', example: '123 Market Road' },
            notes: { type: 'string', example: 'Urgent delivery' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        MarketRate: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
            product: { type: 'string', description: 'Product ID' },
            productName: { type: 'string', example: 'Wheat' },
            rate: { type: 'number', example: 2500 },
            previousRate: { type: 'number', example: 2400 },
            effectiveDate: { type: 'string', format: 'date-time' },
            trend: { type: 'string', enum: ['up', 'down', 'stable'], example: 'up' },
            changePercentage: { type: 'number', example: 4.17 }
          }
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Error message' }
          }
        },
        Success: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'object' },
            message: { type: 'string' }
          }
        }
      }
    },
    tags: [
      { name: 'Auth', description: 'Authentication endpoints' },
      { name: 'Customers', description: 'Customer management' },
      { name: 'Orders', description: 'Order management' },
      { name: 'Products', description: 'Product inventory' },
      { name: 'Market Rates', description: 'Daily market pricing' },
      { name: 'Supplier', description: 'Supplier dashboard data' }
    ]
  },
  apis: [] // We'll define paths inline below
};

// Generate base spec
const swaggerSpec = swaggerJsdoc(options);

// Add paths manually for complete documentation
swaggerSpec.paths = {
  // ==================== AUTH ====================
  '/auth/register': {
    post: {
      tags: ['Auth'],
      summary: 'Register a new customer account',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'email', 'password'],
              properties: {
                name: { type: 'string', minLength: 2, example: 'John Doe' },
                email: { type: 'string', minLength: 3, example: 'john@example.com' },
                password: { type: 'string', minLength: 6, example: 'SecurePass123' },
                phone: { type: 'string', pattern: '^[0-9]{10}$', example: '9876543210' }
              }
            }
          }
        }
      },
      responses: {
        201: {
          description: 'Registration successful',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: { $ref: '#/components/schemas/User' },
                  redirect: { type: 'string', example: '/customer-order-form.html' }
                }
              }
            }
          }
        },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
      }
    }
  },
  '/auth/login': {
    post: {
      tags: ['Auth'],
      summary: 'Login with email and password',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email', 'password'],
              properties: {
                email: { type: 'string', example: 'john@example.com' },
                password: { type: 'string', example: 'SecurePass123' }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: 'Login successful (sets httpOnly cookie)',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: { $ref: '#/components/schemas/User' },
                  redirect: { type: 'string', example: '/index.html' }
                }
              }
            }
          }
        },
        401: { description: 'Invalid credentials', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
      }
    }
  },
  '/auth/logout': {
    post: {
      tags: ['Auth'],
      summary: 'Logout and clear session',
      responses: {
        200: {
          description: 'Logout successful',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Logged out successfully' }
                }
              }
            }
          }
        }
      }
    }
  },
  '/auth/me': {
    get: {
      tags: ['Auth'],
      summary: 'Get current authenticated user',
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
      responses: {
        200: {
          description: 'Current user data',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: { $ref: '#/components/schemas/User' }
                }
              }
            }
          }
        },
        401: { description: 'Not authenticated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
      }
    }
  },
  '/auth/magic/{token}': {
    get: {
      tags: ['Auth'],
      summary: 'Authenticate via magic link',
      parameters: [
        { name: 'token', in: 'path', required: true, schema: { type: 'string' }, description: 'Magic link token' }
      ],
      responses: {
        200: { description: 'Authentication successful (redirects to order form)' },
        401: { description: 'Invalid or expired token', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
      }
    }
  },

  // ==================== CUSTOMERS ====================
  '/customers': {
    get: {
      tags: ['Customers'],
      summary: 'List all active customers',
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
      description: 'Returns all active customers. Admin/Staff only.',
      responses: {
        200: {
          description: 'List of customers',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  count: { type: 'number', example: 10 },
                  data: { type: 'array', items: { $ref: '#/components/schemas/Customer' } }
                }
              }
            }
          }
        },
        401: { description: 'Not authenticated' },
        403: { description: 'Not authorized (customer role)' }
      }
    },
    post: {
      tags: ['Customers'],
      summary: 'Create a new customer',
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
      description: 'Admin/Staff only.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', example: 'ABC Traders' },
                phone: { type: 'string', example: '9876543210' },
                whatsapp: { type: 'string', example: '9876543210' },
                address: { type: 'string', example: '123 Market Road' },
                pricingType: { type: 'string', enum: ['market', 'markup', 'contract'], default: 'market' },
                markupPercentage: { type: 'number', example: 10 },
                contractPrices: { type: 'object', example: { 'productId': 2500 } }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Customer created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
        400: { description: 'Validation error' }
      }
    }
  },
  '/customers/{id}': {
    get: {
      tags: ['Customers'],
      summary: 'Get a specific customer',
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Customer ID' }
      ],
      responses: {
        200: { description: 'Customer data', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
        404: { description: 'Customer not found' }
      }
    },
    put: {
      tags: ['Customers'],
      summary: 'Update a customer',
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Customer ID' }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                phone: { type: 'string' },
                whatsapp: { type: 'string' },
                address: { type: 'string' },
                pricingType: { type: 'string', enum: ['market', 'markup', 'contract'] },
                markupPercentage: { type: 'number' },
                contractPrices: { type: 'object' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Customer updated' },
        404: { description: 'Customer not found' }
      }
    },
    delete: {
      tags: ['Customers'],
      summary: 'Soft delete a customer',
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Customer ID' }
      ],
      responses: {
        200: { description: 'Customer deactivated' },
        404: { description: 'Customer not found' }
      }
    }
  },
  '/customers/{id}/magic-link': {
    post: {
      tags: ['Customers'],
      summary: 'Generate magic link for customer',
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
      description: 'Creates a passwordless login link for the customer. Admin/Staff only.',
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Customer ID' }
      ],
      responses: {
        200: {
          description: 'Magic link generated',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      link: { type: 'string', example: 'http://localhost:5000/api/auth/magic/abc123...' },
                      expiresIn: { type: 'string', example: '30 days' }
                    }
                  }
                }
              }
            }
          }
        },
        404: { description: 'Customer not found' }
      }
    },
    delete: {
      tags: ['Customers'],
      summary: 'Revoke magic link',
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Customer ID' }
      ],
      responses: {
        200: { description: 'Magic link revoked' },
        404: { description: 'Customer not found' }
      }
    }
  },

  // ==================== ORDERS ====================
  '/orders': {
    get: {
      tags: ['Orders'],
      summary: 'List orders',
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
      description: 'Admin/Staff see all orders. Customers see only their own.',
      parameters: [
        { name: 'status', in: 'query', schema: { type: 'string' }, description: 'Filter by status' },
        { name: 'paymentStatus', in: 'query', schema: { type: 'string' }, description: 'Filter by payment status' },
        { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Filter from date' },
        { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Filter to date' },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: 'Page number' },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 }, description: 'Items per page' }
      ],
      responses: {
        200: {
          description: 'List of orders',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  count: { type: 'number' },
                  pagination: {
                    type: 'object',
                    properties: {
                      page: { type: 'number' },
                      limit: { type: 'number' },
                      total: { type: 'number' },
                      pages: { type: 'number' }
                    }
                  },
                  data: { type: 'array', items: { $ref: '#/components/schemas/Order' } }
                }
              }
            }
          }
        }
      }
    },
    post: {
      tags: ['Orders'],
      summary: 'Create a new order',
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['customer', 'products'],
              properties: {
                customer: { type: 'string', description: 'Customer ID' },
                products: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['product', 'quantity', 'rate'],
                    properties: {
                      product: { type: 'string', description: 'Product ID' },
                      quantity: { type: 'number', minimum: 0.2 },
                      rate: { type: 'number', minimum: 0 }
                    }
                  }
                },
                deliveryAddress: { type: 'string' },
                notes: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Order created' },
        400: { description: 'Validation error' }
      }
    }
  },
  '/orders/{id}': {
    get: {
      tags: ['Orders'],
      summary: 'Get a specific order',
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Order ID' }
      ],
      responses: {
        200: { description: 'Order data' },
        404: { description: 'Order not found' }
      }
    },
    delete: {
      tags: ['Orders'],
      summary: 'Cancel an order',
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
      description: 'Admin/Staff only. Sets status to cancelled.',
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Order ID' }
      ],
      responses: {
        200: { description: 'Order cancelled' },
        404: { description: 'Order not found' }
      }
    }
  },
  '/orders/{id}/status': {
    put: {
      tags: ['Orders'],
      summary: 'Update order status',
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
      description: 'Admin/Staff only.',
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Order ID' }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['status'],
              properties: {
                status: {
                  type: 'string',
                  enum: ['pending', 'confirmed', 'processing', 'packed', 'shipped', 'delivered', 'cancelled']
                }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Status updated' },
        400: { description: 'Invalid status' }
      }
    }
  },
  '/orders/{id}/payment': {
    put: {
      tags: ['Orders'],
      summary: 'Update order payment',
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
      description: 'Admin/Staff only.',
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Order ID' }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['paidAmount'],
              properties: {
                paidAmount: { type: 'number', minimum: 0, description: 'Total amount paid so far' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Payment updated' },
        400: { description: 'Invalid amount' }
      }
    }
  },
  '/orders/customer/{id}': {
    get: {
      tags: ['Orders'],
      summary: 'Get orders for a specific customer',
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Customer ID' }
      ],
      responses: {
        200: { description: 'Customer orders' }
      }
    }
  },

  // ==================== PRODUCTS ====================
  '/products': {
    get: {
      tags: ['Products'],
      summary: 'List all products',
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
      description: 'Returns active products. Admin sees all including inactive.',
      responses: {
        200: {
          description: 'List of products',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  count: { type: 'number' },
                  data: { type: 'array', items: { $ref: '#/components/schemas/Product' } }
                }
              }
            }
          }
        }
      }
    },
    post: {
      tags: ['Products'],
      summary: 'Create a new product',
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
      description: 'Admin/Staff only.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'unit'],
              properties: {
                name: { type: 'string', example: 'Wheat' },
                unit: { type: 'string', enum: ['quintal', 'bag', 'kg', 'piece', 'ton', 'bunch'], example: 'quintal' },
                category: { type: 'string', example: 'Grains' }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Product created' },
        400: { description: 'Validation error or duplicate name' }
      }
    }
  },
  '/products/{id}': {
    get: {
      tags: ['Products'],
      summary: 'Get a specific product',
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Product ID' }
      ],
      responses: {
        200: { description: 'Product data' },
        404: { description: 'Product not found' }
      }
    },
    put: {
      tags: ['Products'],
      summary: 'Update a product',
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
      description: 'Admin/Staff only.',
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Product ID' }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                unit: { type: 'string', enum: ['quintal', 'bag', 'kg', 'piece', 'ton'] },
                category: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Product updated' },
        404: { description: 'Product not found' }
      }
    },
    delete: {
      tags: ['Products'],
      summary: 'Deactivate a product',
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
      description: 'Admin/Staff only. Soft delete.',
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Product ID' }
      ],
      responses: {
        200: { description: 'Product deactivated' },
        404: { description: 'Product not found' }
      }
    }
  },

  // ==================== MARKET RATES ====================
  '/market-rates': {
    get: {
      tags: ['Market Rates'],
      summary: 'Get current market rates',
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } }
      ],
      responses: {
        200: {
          description: 'Current market rates',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  count: { type: 'number' },
                  data: { type: 'array', items: { $ref: '#/components/schemas/MarketRate' } }
                }
              }
            }
          }
        }
      }
    },
    post: {
      tags: ['Market Rates'],
      summary: 'Update market rate for a product',
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
      description: 'Admin/Staff only. Creates or updates rate.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['product', 'rate'],
              properties: {
                product: { type: 'string', description: 'Product ID' },
                rate: { type: 'number', minimum: 0, example: 2500 }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Rate updated' },
        201: { description: 'Rate created' },
        400: { description: 'Invalid data' }
      }
    }
  },

  // ==================== SUPPLIER ====================
  '/supplier/quantity-summary': {
    get: {
      tags: ['Supplier'],
      summary: 'Get aggregated order quantities',
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
      description: 'Returns quantity totals grouped by product. Admin/Staff only.',
      parameters: [
        { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Filter from date' },
        { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Filter to date' },
        { name: 'status', in: 'query', schema: { type: 'string' }, description: 'Filter by order status' }
      ],
      responses: {
        200: {
          description: 'Quantity summary',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        productName: { type: 'string', example: 'Wheat' },
                        unit: { type: 'string', example: 'quintal' },
                        totalQuantity: { type: 'number', example: 150 },
                        orderCount: { type: 'number', example: 12 }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },

  // ==================== HEALTH ====================
  '/health': {
    get: {
      tags: ['Health'],
      summary: 'Server health check',
      responses: {
        200: {
          description: 'Server status',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string', example: 'ok' },
                  message: { type: 'string', example: 'Server is running' },
                  timestamp: { type: 'string', format: 'date-time' },
                  sentry: { type: 'string', example: 'configured' }
                }
              }
            }
          }
        }
      }
    }
  }
};

module.exports = swaggerSpec;
