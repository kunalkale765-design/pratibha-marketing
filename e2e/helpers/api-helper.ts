import { APIRequestContext } from '@playwright/test';

/**
 * API Helper for making direct API calls during test setup
 */
export class ApiHelper {
  constructor(private request: APIRequestContext, private baseURL: string) {}

  /**
   * Get auth token via login
   */
  async login(email: string, password: string): Promise<string> {
    const response = await this.request.post(`${this.baseURL}/api/auth/login`, {
      data: { email, password }
    });

    const cookies = response.headers()['set-cookie'] || '';
    const tokenMatch = cookies.match(/token=([^;]+)/);
    return tokenMatch ? tokenMatch[1] : '';
  }

  /**
   * Create a customer
   */
  async createCustomer(token: string, data: {
    name: string;
    phone?: string;
    pricingType?: string;
    markupPercentage?: number;
  }) {
    const response = await this.request.post(`${this.baseURL}/api/customers`, {
      headers: {
        Cookie: `token=${token}`,
        'Content-Type': 'application/json'
      },
      data: {
        name: data.name,
        phone: data.phone || `98${Date.now().toString().slice(-8)}`,
        pricingType: data.pricingType || 'market',
        markupPercentage: data.markupPercentage,
        isActive: true
      }
    });

    return response.json();
  }

  /**
   * Create a product
   */
  async createProduct(token: string, data: {
    name: string;
    unit?: string;
    category?: string;
  }) {
    const response = await this.request.post(`${this.baseURL}/api/products`, {
      headers: {
        Cookie: `token=${token}`,
        'Content-Type': 'application/json'
      },
      data: {
        name: data.name,
        unit: data.unit || 'kg',
        category: data.category || 'Test',
        isActive: true
      }
    });

    return response.json();
  }

  /**
   * Create an order
   */
  async createOrder(token: string, customerId: string, products: {
    product: string;
    quantity: number;
    rate?: number;
  }[]) {
    const response = await this.request.post(`${this.baseURL}/api/orders`, {
      headers: {
        Cookie: `token=${token}`,
        'Content-Type': 'application/json'
      },
      data: {
        customer: customerId,
        products: products.map(p => ({
          product: p.product,
          quantity: p.quantity,
          rate: p.rate || 100
        }))
      }
    });

    return response.json();
  }

  /**
   * Update market rate
   */
  async updateMarketRate(token: string, productId: string, rate: number) {
    const response = await this.request.post(`${this.baseURL}/api/market-rates`, {
      headers: {
        Cookie: `token=${token}`,
        'Content-Type': 'application/json'
      },
      data: {
        product: productId,
        rate
      }
    });

    return response.json();
  }

  /**
   * Get all customers
   */
  async getCustomers(token: string) {
    const response = await this.request.get(`${this.baseURL}/api/customers`, {
      headers: {
        Cookie: `token=${token}`
      }
    });

    return response.json();
  }

  /**
   * Get all products
   */
  async getProducts(token: string) {
    const response = await this.request.get(`${this.baseURL}/api/products`, {
      headers: {
        Cookie: `token=${token}`
      }
    });

    return response.json();
  }

  /**
   * Get all orders
   */
  async getOrders(token: string, filters?: { status?: string }) {
    const params = new URLSearchParams();
    if (filters?.status) {
      params.set('status', filters.status);
    }

    const url = `${this.baseURL}/api/orders${params.toString() ? '?' + params.toString() : ''}`;
    const response = await this.request.get(url, {
      headers: {
        Cookie: `token=${token}`
      }
    });

    return response.json();
  }

  /**
   * Update order status
   */
  async updateOrderStatus(token: string, orderId: string, status: string) {
    const response = await this.request.put(`${this.baseURL}/api/orders/${orderId}/status`, {
      headers: {
        Cookie: `token=${token}`,
        'Content-Type': 'application/json'
      },
      data: { status }
    });

    return response.json();
  }

  /**
   * Delete customer
   */
  async deleteCustomer(token: string, customerId: string) {
    const response = await this.request.delete(`${this.baseURL}/api/customers/${customerId}`, {
      headers: {
        Cookie: `token=${token}`
      }
    });

    return response.json();
  }

  /**
   * Delete product
   */
  async deleteProduct(token: string, productId: string) {
    const response = await this.request.delete(`${this.baseURL}/api/products/${productId}`, {
      headers: {
        Cookie: `token=${token}`
      }
    });

    return response.json();
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.request.get(`${this.baseURL}/api/health`);
      return response.ok();
    } catch {
      return false;
    }
  }
}
