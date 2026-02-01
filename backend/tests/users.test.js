const request = require('supertest');
const app = require('../server');
const User = require('../models/User');
const Customer = require('../models/Customer');

describe('Users Endpoints', () => {
  let adminToken;
  let staffToken;
  let customerToken;

  beforeEach(async () => {
    const { testUtils } = require('./setup');
    const admin = await testUtils.createAdminUser();
    adminToken = admin.token;
    const staff = await testUtils.createStaffUser();
    staffToken = staff.token;
    const customer = await testUtils.createCustomerUser();
    customerToken = customer.token;
  });

  describe('GET /api/users', () => {
    it('should list users as admin', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Cookie', `token=${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.count).toBeGreaterThanOrEqual(3);
    });

    it('should reject staff access', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Cookie', `token=${staffToken}`);

      expect(res.statusCode).toBe(403);
    });

    it('should reject customer access', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Cookie', `token=${customerToken}`);

      expect(res.statusCode).toBe(403);
    });

    it('should reject unauthenticated access', async () => {
      const res = await request(app).get('/api/users');
      expect(res.statusCode).toBe(401);
    });

    it('should filter by role', async () => {
      const res = await request(app)
        .get('/api/users?role=admin')
        .set('Cookie', `token=${adminToken}`);

      expect(res.statusCode).toBe(200);
      res.body.data.forEach(u => expect(u.role).toBe('admin'));
    });

    it('should search by name', async () => {
      const res = await request(app)
        .get('/api/users?search=Admin')
        .set('Cookie', `token=${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should not return passwords', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Cookie', `token=${adminToken}`);

      res.body.data.forEach(u => {
        expect(u.password).toBeUndefined();
      });
    });
  });

  describe('GET /api/users/:id', () => {
    it('should get a single user', async () => {
      const users = await User.find();
      const res = await request(app)
        .get(`/api/users/${users[0]._id}`)
        .set('Cookie', `token=${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data._id).toBe(users[0]._id.toString());
    });

    it('should return 404 for nonexistent user', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .get(`/api/users/${fakeId}`)
        .set('Cookie', `token=${adminToken}`);

      expect(res.statusCode).toBe(404);
    });

    it('should return 400 for invalid ID', async () => {
      const res = await request(app)
        .get('/api/users/notavalidid')
        .set('Cookie', `token=${adminToken}`);

      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/users', () => {
    it('should create a staff user', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Cookie', `token=${adminToken}`)
        .send({
          name: 'New Staff',
          email: 'newstaff',
          password: 'Test123!',
          role: 'staff'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.data.role).toBe('staff');
      expect(res.body.data.name).toBe('New Staff');
    });

    it('should create a customer user with linked Customer record', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Cookie', `token=${adminToken}`)
        .send({
          name: 'New Customer',
          email: 'newcust',
          password: 'Test123!',
          role: 'customer'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.data.role).toBe('customer');

      // Verify Customer record was created
      const user = await User.findById(res.body.data._id);
      expect(user.customer).toBeDefined();
      const customer = await Customer.findById(user.customer);
      expect(customer).not.toBeNull();
      expect(customer.name).toBe('New Customer');
    });

    it('should reject duplicate email', async () => {
      await request(app)
        .post('/api/users')
        .set('Cookie', `token=${adminToken}`)
        .send({ name: 'User1', email: 'dupemail', password: 'Test123!', role: 'staff' });

      const res = await request(app)
        .post('/api/users')
        .set('Cookie', `token=${adminToken}`)
        .send({ name: 'User2', email: 'dupemail', password: 'Test123!', role: 'staff' });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/already exists/i);
    });

    it('should reject weak password', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Cookie', `token=${adminToken}`)
        .send({ name: 'Weak', email: 'weakpw', password: '123', role: 'staff' });

      expect(res.statusCode).toBe(400);
    });

    it('should reject missing name', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Cookie', `token=${adminToken}`)
        .send({ email: 'noname', password: 'Test123!', role: 'staff' });

      expect(res.statusCode).toBe(400);
    });

    it('should reject invalid role', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Cookie', `token=${adminToken}`)
        .send({ name: 'Bad', email: 'badrole', password: 'Test123!', role: 'superadmin' });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('PUT /api/users/:id', () => {
    it('should update user name', async () => {
      const staff = await User.findOne({ role: 'staff' });
      const res = await request(app)
        .put(`/api/users/${staff._id}`)
        .set('Cookie', `token=${adminToken}`)
        .send({ name: 'Updated Name' });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.name).toBe('Updated Name');
    });

    it('should prevent admin from deactivating themselves', async () => {
      const admin = await User.findOne({ role: 'admin' });
      const res = await request(app)
        .put(`/api/users/${admin._id}`)
        .set('Cookie', `token=${adminToken}`)
        .send({ isActive: false });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/cannot deactivate your own/i);
    });

    it('should reject duplicate email on update', async () => {
      const users = await User.find().limit(2);
      const res = await request(app)
        .put(`/api/users/${users[1]._id}`)
        .set('Cookie', `token=${adminToken}`)
        .send({ email: users[0].email });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/already exists/i);
    });

    it('should return 404 for nonexistent user', async () => {
      const res = await request(app)
        .put('/api/users/507f1f77bcf86cd799439011')
        .set('Cookie', `token=${adminToken}`)
        .send({ name: 'Ghost' });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('PUT /api/users/:id/password', () => {
    it('should reset user password', async () => {
      const staff = await User.findOne({ role: 'staff' });
      const res = await request(app)
        .put(`/api/users/${staff._id}/password`)
        .set('Cookie', `token=${adminToken}`)
        .send({ password: 'NewPass123!' });

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toMatch(/password updated/i);
    });

    it('should reject weak new password', async () => {
      const staff = await User.findOne({ role: 'staff' });
      const res = await request(app)
        .put(`/api/users/${staff._id}/password`)
        .set('Cookie', `token=${adminToken}`)
        .send({ password: '123' });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('DELETE /api/users/:id', () => {
    it('should soft-delete (deactivate) a user', async () => {
      const staff = await User.findOne({ role: 'staff' });
      const res = await request(app)
        .delete(`/api/users/${staff._id}`)
        .set('Cookie', `token=${adminToken}`);

      expect(res.statusCode).toBe(200);

      const deactivated = await User.findById(staff._id);
      expect(deactivated.isActive).toBe(false);
    });

    it('should prevent admin from deleting themselves', async () => {
      const admin = await User.findOne({ role: 'admin' });
      const res = await request(app)
        .delete(`/api/users/${admin._id}`)
        .set('Cookie', `token=${adminToken}`);

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/cannot deactivate your own/i);
    });

    it('should return 404 for nonexistent user', async () => {
      const res = await request(app)
        .delete('/api/users/507f1f77bcf86cd799439011')
        .set('Cookie', `token=${adminToken}`);

      expect(res.statusCode).toBe(404);
    });
  });
});
