require('dotenv').config();
const { Sequelize } = require('sequelize');

// First connect to postgres database to create github_insights
const sequelize = new Sequelize({
  database: 'postgres', // Connect to default postgres database first
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  dialect: 'postgres',
  logging: console.log
});

async function createDatabase() {
  try {
    console.log('Connecting to postgres database...');
    await sequelize.authenticate();
    console.log('✅ Connected to postgres database.');
    
    // Check if github_insights database exists
    const [results] = await sequelize.query("SELECT 1 FROM pg_database WHERE datname = 'github_insights'");
    
    if (results.length === 0) {
      console.log('Creating github_insights database...');
      await sequelize.query('CREATE DATABASE github_insights');
      console.log('✅ github_insights database created successfully.');
    } else {
      console.log('✅ github_insights database already exists.');
    }
    
    await sequelize.close();
    
    // Now test connection to github_insights database
    const githubSequelize = new Sequelize({
      database: 'github_insights',
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      dialect: 'postgres',
      logging: console.log
    });
    
    console.log('Testing connection to github_insights database...');
    await githubSequelize.authenticate();
    console.log('✅ Successfully connected to github_insights database.');
    await githubSequelize.close();
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

createDatabase();