require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize({
  database: process.env.DB_NAME || 'github_insights',
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  dialect: 'postgres',
  logging: console.log
});

async function testConnection() {
  try {
    console.log('Testing database connection...');
    console.log('Config:', {
      database: process.env.DB_NAME || 'github_insights',
      username: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432
    });
    
    await sequelize.authenticate();
    console.log('✅ Connection has been established successfully.');
    
    // Try to list databases
    const [results] = await sequelize.query('SELECT datname FROM pg_database;');
    console.log('Available databases:', results.map(r => r.datname));
    
    await sequelize.close();
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error);
  }
}

testConnection();