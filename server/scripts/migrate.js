const { sequelize } = require('../models');

async function migrate() {
  try {
    console.log('🔄 Starting database migration...');
    
    // Test database connection
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully.');
    
    // Check if tables exist
    const queryInterface = sequelize.getQueryInterface();
    const tableNames = await queryInterface.showAllTables();
    
    if (tableNames.length === 0) {
      console.log('📝 No existing tables found. Creating new schema...');
      // First time setup - create all tables
      await sequelize.sync({ force: false, alter: false });
    } else {
      console.log('🔄 Existing tables found. Running safe sync...');
      // Tables exist - only create missing ones, don't alter existing
      await sequelize.sync({ force: false, alter: false });
      
      // If you need to alter existing tables, add specific migrations here
      console.log('⚠️  If you need to modify existing table structures, please create proper migration files.');
    }
    
    console.log('✅ Database tables synchronized successfully.');
    console.log('🎉 Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.error('💡 If you need to reset the database, you can:');
    console.error('   1. Drop all tables manually, or');
    console.error('   2. Use { force: true } in development (WARNING: destroys all data)');
    process.exit(1);
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  migrate();
}

module.exports = migrate;